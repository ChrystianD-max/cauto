// C-AUTO — Passerelle de stockage (modules 59/60)
// -----------------------------------------------------------------------------
// Abstraction fournisseur-agnostique pour les fichiers téléversés (documents,
// preuves d'intervention). Mode au choix via STORAGE_MODE :
//   - local (défaut si rien n'est configuré) : écriture sur disque (UPLOAD_DIR).
//   - s3    : stockage objet S3-compatible — AWS S3, Cloudflare R2, Supabase
//             Storage, MinIO, Backblaze B2, Garantia, Ceph. Aucun lien avec un
//             hébergeur particulier : tout est piloté par variables d'environ.
//
// Aucune vraie clé n'est stockée dans le code : STORAGE_ACCESS_KEY /
// STORAGE_SECRET_KEY ne sont lues qu'à l'exécution depuis process.env.

const fs = require('fs');
const path = require('path');
const config = require('../../config');

function resolveMode() {
  if (config.storage.mode === 's3') return 's3';
  if (config.storage.mode === 'local') return 'local';
  // auto : S3 uniquement si l'endpoint ET la paire de clés ET le bucket sont définis.
  const s3c = config.storage;
  if (s3c.endpoint && s3c.accessKey && s3c.secretKey && s3c.bucket && s3c.accessKey !== 'CHANGE_ME') return 's3';
  return 'local';
}

let client = null;
let mode = resolveMode();

function init() {
  if (mode !== 's3') return null;
  if (client) return client;
  const { S3Client } = require('@aws-sdk/client-s3');
  client = new S3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region || 'auto',
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey
    },
    forcePathStyle: config.storage.forcePathStyle
  });
  return client;
}

function objectKey(dir, filename) {
  const base = [config.storage.prefix, dir, filename].filter(Boolean).join('/');
  return base;
}

function localPath(dir, filename) {
  return path.join(config.uploadDir, dir, filename);
}

function isS3() {
  return mode === 's3';
}

// Publie un fichier déjà présent sur le disque local vers le stockage objet.
// Si STORAGE_KEEP_LOCAL=false (défaut), le fichier local est supprimé après
// publication (le volume n'est plus le support de stockage).
async function replicate(dir, filename, absPath) {
  if (mode !== 's3') return;
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const body = fs.createReadStream(absPath);
  const key = objectKey(dir, filename);
  try {
    await init().send(new PutObjectCommand({ Bucket: config.storage.bucket, Key: key, Body: body }));
  } finally {
    body.destroy();
  }
  if (!config.storage.keepLocal) {
    fs.promises.unlink(absPath).catch(() => {});
  }
}

// Ouvre un fichier (lecture) selon le mode. Retourne :
//   { type: 'file', abs }   — mode local : chemin absolu.
//   { type: 'stream', stream, size } — mode S3 : flux GetObject.
async function open(dir, filename) {
  if (mode === 's3') {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const out = await init().send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: objectKey(dir, filename) }));
    return { type: 'stream', stream: out.Body, size: out.ContentLength };
  }
  const abs = localPath(dir, filename);
  if (!fs.existsSync(abs)) return null;
  return { type: 'file', abs };
}

// Supprime un objet : disque local (mode local) et stockage objet (mode S3,
// quel que soit le stockage final des fichiers présents).
async function remove(dir, filename) {
  const abs = localPath(dir, filename);
  await fs.promises.unlink(abs).catch(() => {});
  if (mode === 's3') {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await init().send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: objectKey(dir, filename) })).catch(() => {});
  }
}

// URL publique optionnelle (CDN / domaine stockage) pour servir directement
// des objets S3 sans transiter par l'API. Empty string si non configurée.
function publicUrl(dir, filename) {
  if (mode !== 's3' || !config.storage.publicUrl) return '';
  const base = config.storage.publicUrl.replace(/\/+$/, '');
  return base + '/' + objectKey(dir, filename);
}

module.exports = { isS3, replicate, open, remove, publicUrl, resolveMode };