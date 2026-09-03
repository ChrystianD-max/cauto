const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const config = require('../config');
const { HttpError } = require('./errors');

// Module 40/41 — Contrôle d'upload :
//  - whitelist MIME par catégorie ;
//  - taille maximale (env DOC_MAX_BYTES, défaut 20 Mo) ;
//  - sniff des *magic bytes* (anti-polyglot : un .png ne peut pas être servi en .pdf) ;
//  - scan antivirus optionnel (env AV_SCAN_CMD) avec statut CLEAN / INFECTED / DISABLED.

const CATEGORY_MIME = {
  PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
  AUDIO: ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'],
  PDF: ['application/pdf'],
  INVOICE: ['application/pdf', 'image/jpeg', 'image/png'],
  REPORT: ['application/pdf', 'text/plain', 'image/jpeg', 'image/png'],
  VEHICLE: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  DOCUMENT: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'text/plain']
};
const CATEGORIES = Object.keys(CATEGORY_MIME);
// Pré-filtre multer : n'importe quel type d'UNE des catégories (le contrôle
// strict par catégorie se fait après parsing dans la route, car req.body n'est
// pas encore peuplé quand fileFilter tourne).
const ALLOWED_MIMES = [...new Set(Object.values(CATEGORY_MIME).flat())];
const MAX_BYTES = parseInt(process.env.DOC_MAX_BYTES || String(20 * 1024 * 1024), 10);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'text/plain': '.txt'
};

function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4'; // mp4/m4a (box ISO BMFF)
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'video/webm';
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return 'audio/mpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  return null;
}

const documentsDir = path.join(config.uploadDir, 'documents');
fs.mkdirSync(documentsDir, { recursive: true });

function buildUploader(category) {
  if (!CATEGORY_MIME[category]) throw new HttpError(400, 'Catégorie inconnue : ' + category);
  const allowed = ALLOWED_MIMES;
  return multer({
    storage: multer.diskStorage({
      destination: (_r, _f, cb) => cb(null, documentsDir),
      filename: (_r, f, cb) => {
        const ext = EXT_BY_MIME[f.mimetype] || path.extname(f.originalname || '').toLowerCase().slice(0, 8);
        cb(null, crypto.randomBytes(16).toString('hex') + ext);
      }
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_r, file, cb) => {
      if (!allowed.includes(file.mimetype)) {
        return cb(new HttpError(415, 'Type de fichier non autorisé (MIME) : ' + file.mimetype));
      }
      cb(null, true);
    }
  });
}

// Scan antivirus : si AV_SCAN_CMD est défini (ex: clamscan), on exécute.
// Retour : CLEAN / INFECTED / DISABLED.
function scanFile(filePath) {
  return new Promise((resolve) => {
    const cmd = process.env.AV_SCAN_CMD;
    if (!cmd) { resolve({ status: 'DISABLED', note: 'aucun antivirus configuré (env AV_SCAN_CMD)' }); return; }
    const [bin, ...args] = cmd.split(/\s+/);
    const timer = setTimeout(() => { try { proc.kill(); } catch { /* process déjà terminé */ } resolve({ status: 'DISABLED', note: 'scan expiré' }); }, 15000);
    let proc;
    try {
      proc = execFile(bin, [...args, filePath], { timeout: 15000 }, (err, _stdout, stderr) => {
        clearTimeout(timer);
        if (!err) { resolve({ status: 'CLEAN', note: 'aucune menace détectée' }); return; }
        if (err.code === 1) { resolve({ status: 'INFECTED', note: (err.message || '').slice(0, 300) }); return; }
        resolve({ status: 'DISABLED', note: (stderr || err.message || '').slice(0, 200) });
      });
    } catch {
      resolve({ status: 'DISABLED', note: 'antivirus indisponible' });
    }
    if (proc) { proc.on('error', () => clearTimeout(timer)); }
  });
}

// Bannissement des fichiers signalés infectés.
function isBlocked(scan) {
  return scan && scan.status === 'INFECTED';
}

module.exports = { CATEGORIES, CATEGORY_MIME, ALLOWED_MIMES, MAX_BYTES, buildUploader, sniffMime, scanFile, isBlocked, documentsDir, EXT_BY_MIME };