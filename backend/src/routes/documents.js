const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { audit, auditChange } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');
const { validate } = require('../utils/validate');
const upload = require('../utils/upload');
const storage = require('../services/storage');

const router = express.Router();

// Module 40 — Stockage de documents avec propriétaire + permissions.
// Types gérés : photos, vidéos, PDF, factures, rapports, documents véhicule.
const CATEGORY = z.enum(['PHOTO', 'VIDEO', 'AUDIO', 'PDF', 'INVOICE', 'REPORT', 'VEHICLE', 'DOCUMENT']);
const VISIBILITY = z.enum(['private', 'professional', 'public']);

// wrapper multer : convertit MulterError (taille limite…) en HttpError propre
function uploadOne(req, res, next) {
  const mw = upload.buildUploader((req.body.category || 'DOCUMENT').toUpperCase());
  return mw.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(err.code === 'LIMIT_FILE_SIZE'
        ? new HttpError(413, 'Fichier trop volumineux (max ' + Math.round(upload.MAX_BYTES / 1048576) + ' Mo)')
        : new HttpError(400, 'Upload invalide : ' + err.message));
    }
    next(err);
  });
}

const createSchema = z.object({
  category: CATEGORY.default('DOCUMENT'),
  entity_type: z.enum(['VEHICLE', 'INTERVENTION', 'QUOTE', 'PAYMENT', 'REPAIR', 'WARRANTY', 'PROFILE', 'SERVICE_REQUEST']).optional(),
  entity_id: z.string().uuid().optional(),
  visibility: VISIBILITY.default('private'),
  permissions: z.object({ read: z.array(z.string().max(80)).optional(), write: z.array(z.string().max(80)).optional() }).optional(),
  name: z.string().max(200).optional()
}).passthrough();

// Professionnel lié à une entité (lecture partagée entity -> intervention -> pro)
const ENTITY_TABLES = { QUOTE: 'quotes', PAYMENT: 'payments', REPAIR: 'repairs', WARRANTY: 'warranties' };
async function entityProUser(entityType, entityId) {
  if (!entityId) return null;
  if (entityType === 'SERVICE_REQUEST') {
    const r = await db.one(
      `SELECT pro.user_id FROM service_requests sr JOIN professionals pro ON pro.id=sr.professional_id WHERE sr.id=$1`,
      [entityId]
    ).catch(() => null);
    return r ? r.user_id : null;
  }
  if (entityType === 'INTERVENTION') {
    const r = await db.one(
      `SELECT pro.user_id FROM interventions i JOIN professionals pro ON pro.id=i.professional_id WHERE i.id=$1`,
      [entityId]
    ).catch(() => null);
    return r ? r.user_id : null;
  }
  const table = ENTITY_TABLES[entityType];
  if (table) {
    const r = await db.one(
      `SELECT pro.user_id FROM interventions i JOIN professionals pro ON pro.id=i.professional_id
       WHERE i.id = (SELECT intervention_id FROM ${table} WHERE id=$1)`,
      [entityId]
    ).catch(() => null);
    return r ? r.user_id : null;
  }
  return null;
}

// Client lié à une entité (lecture partagée entity -> client)
async function entityClientUser(entityType, entityId) {
  if (!entityId) return null;
  if (entityType === 'SERVICE_REQUEST') {
    const r = await db.one(
      `SELECT user_id FROM service_requests WHERE id=$1`,
      [entityId]
    ).catch(() => null);
    return r ? r.user_id : null;
  }
  return null;
}

function canRead(doc, user, proUserId, clientUserId) {
  if (doc.owner_id === user.sub) return true;
  if (user.role === 'ADMIN' || user.isSuperAdmin) return true;
  if (doc.visibility === 'public') return true;
  const read = (doc.permissions && doc.permissions.read) || ['owner'];
  if (read.includes(user.sub)) return true;
  if (clientUserId && doc.entity_type === 'SERVICE_REQUEST' && clientUserId === user.sub) return true;
  if (proUserId && read.includes('professional') && proUserId === user.sub) return true;
  return false;
}

async function loadDoc(req) {
  const doc = await db.one('SELECT * FROM document_storage WHERE id=$1', [req.params.id]).catch(() => null);
  if (!doc) throw new HttpError(404, 'Document introuvable');
  // Médias du chat : seuls les membres de la conversation y ont accès.
  if (doc.entity_type === 'CHAT') {
    const member = await db.one(
      'SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [doc.entity_id, req.user.sub]
    ).catch(() => null);
    if (!member) throw new HttpError(403, 'Accès refusé à ce document');
    return doc;
  }
  const pro = await entityProUser(doc.entity_type, doc.entity_id);
  if (!canRead(doc, req.user, pro)) throw new HttpError(403, 'Accès refusé à ce document');
  return doc;
}

// ---------- Upload ----------
router.post('/', requireAuth, uploadOne, wrap(async (req, res) => {
  let permissionsRaw;
  try { permissionsRaw = req.body.permissions ? JSON.parse(req.body.permissions) : undefined; } catch (e) { permissionsRaw = undefined; }
  const body = createSchema.safeParse({
    ...req.body,
    permissions: permissionsRaw
  });
  if (!body.success) {
    if (req.file) fs.unlinkSync(req.file.path);
    throw new HttpError(400, 'Métadonnées invalides', { code: 'VALIDATION_ERROR', details: body.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (!req.file) throw new HttpError(400, 'Fichier manquant (champ multipart "file")');
  const { category, entity_type, entity_id, visibility, permissions, name } = body.data;

  // Contrôle STRICT par catégorie (après parsing : req.body est peuplé).
  if (!upload.CATEGORY_MIME[category].includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(415, 'Type de fichier non autorisé pour la catégorie ' + category + ' : ' + req.file.mimetype);
  }

  // Anti-polyglot : le type détecté aux magic bytes doit correspondre au type déclaré.
  // Le conteneur webm / mp4 est partagé entre audio et vidéo : on accepte la famille.
  const head = fs.readFileSync(req.file.path);
  const sniffed = upload.sniffMime(head);
  const declared = req.file.mimetype;
  const sameFamily = (a, b) =>
    a === b ||
    (a === 'video/webm' && b === 'audio/webm') ||
    (a === 'audio/webm' && b === 'video/webm') ||
    (a === 'video/mp4' && b === 'audio/mp4') ||
    (a === 'audio/mp4' && b === 'video/mp4');
  if (sniffed && !sameFamily(sniffed, declared)) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(415, 'Contenu du fichier ne correspond pas à son type déclaré');
  }
  if (!sniffed && (declared === 'application/pdf' || declared.startsWith('image/') || declared.startsWith('video/') || declared.startsWith('audio/'))) {
    // Un vrai PDF / image / vidéo déteint toujours aux magic bytes.
    fs.unlinkSync(req.file.path);
    throw new HttpError(415, 'Fichier déclaré ' + declared + ' mais signature absente');
  }
  if (req.file.size > upload.MAX_BYTES) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(413, 'Fichier trop volumineux');
  }

  const scan = await upload.scanFile(req.file.path);
  if (upload.isBlocked(scan)) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(422, 'Fichier rejeté : menace détectée par l\'antivirus');
  }

  const relative = 'documents/' + req.file.filename;
  const perms = {
    read: (permissions && permissions.read) || ['owner'],
    write: (permissions && permissions.write) || ['owner']
  };
  const doc = await db.one(
    `INSERT INTO document_storage (owner_id, name, original_name, mime, size_bytes, category, entity_type, entity_id, storage_path, visibility, permissions, scan_status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.user.sub, name || req.file.originalname, req.file.originalname, req.file.mimetype, req.file.size,
     category, entity_type || null, entity_id || null, relative, visibility, JSON.stringify(perms),
     scan.status, JSON.stringify({ scan_note: scan.note || '', region: 'documents' })]
  );
  const { storage_path, ...safe } = doc;
  // Passerelle de stockage objet (modules 59/60) : si S3 est configuré et que
  // le fichier local provient du disk handler, on le réplique vers l'objet.
  if (storage.isS3()) {
    try {
      await storage.replicate('documents', req.file.filename, req.file.path);
    } catch (e) {
      await db.query('DELETE FROM document_storage WHERE id=$1', [doc.id]).catch(() => {});
      await storage.remove('documents', req.file.filename);
      console.error('[STORAGE]', e.message || e);
      throw new HttpError(500, 'Le stockage objet est momentanément indisponible');
    }
  }
  await audit(req, 'document.create', 'document', doc.id, { category, size: doc.size_bytes, scan: scan.status });
  res.status(201).json({ document: safe, infected: scan.status === 'INFECTED' });
}));

// ---------- Liste (propriétaire / partagés / admin) ----------
router.get('/', requireAuth, wrap(async (req, res) => {
  const { category, entity_type, entity_id, scope } = req.query;
  if (scope === 'all' && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    const rows = await db.many(
      `SELECT id, owner_id, name, original_name, mime, size_bytes, category, entity_type, entity_id, visibility, permissions, scan_status, created_at
       FROM document_storage ${entity_type ? 'WHERE entity_type=$1' : ''} ORDER BY created_at DESC LIMIT 500`,
      entity_type ? [entity_type] : []
    );
    return res.json({ documents: rows.map(clean) });
  }
  const base = `SELECT id, owner_id, name, original_name, mime, size_bytes, category, entity_type, entity_id, visibility, permissions, scan_status, created_at
                FROM document_storage d WHERE 1=1`;
  const conds = []; const params = [];
  conds.push(`(d.owner_id = $${params.length + 1} OR d.visibility = 'public' OR d.permissions->'read' ?| array[$${params.length + 1}::text])`);
  params.push(req.user.sub);
  if (category) { conds.push('d.category=$' + (params.length + 1)); params.push(category); }
  if (entity_type) {
    conds.push('d.entity_type=$' + (params.length + 1)); params.push(entity_type);
    if (entity_id) { conds.push('d.entity_id=$' + (params.length + 1)); params.push(entity_id); }
  }
  const rows = await db.many(base + ' AND ' + conds.join(' AND ') + ' ORDER BY d.created_at DESC LIMIT 500', params);
  res.json({ documents: rows.map(clean) });
}));

function clean(doc) {
  const { permissions, ...rest } = doc;
  return { ...rest, permissions };
}

// ---------- Détail / téléchargement ----------
router.get('/:id', requireAuth, wrap(async (req, res) => {
  const doc = await loadDoc(req);
  const { storage_path, ...safe } = doc;
  res.json({ document: safe, download_url: '/api/documents/' + doc.id + '/download' });
}));

async function serveDoc(res, doc) {
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Disposition', 'inline; filename="' + (doc.original_name || 'document').replace(/["\\]/g, '') + '"');
  const open = await storage.open('documents', path.basename(doc.storage_path));
  if (!open) throw new HttpError(404, 'Fichier stocké introuvable');
  if (open.type === 'file') {
    return res.sendFile(open.abs);
  }
  // Mode S3 : contournement de l'objet vers le client (reste same-origin).
  if (open.size) res.setHeader('Content-Length', open.size);
  open.stream.on('error', () => res.end());
  open.stream.pipe(res);
}

router.get('/:id/download', requireAuth, wrap(async (req, res) => {
  const doc = await loadDoc(req);
  await serveDoc(res, doc);
}));

// Variante publique (sans authentification) : réservée aux documents `visibility='public'`
// (ex. photos de pièces du catalogue affichées directement dans des <img>).
router.get('/:id/public', wrap(async (req, res) => {
  const doc = await db.one('SELECT * FROM document_storage WHERE id=$1', [req.params.id]).catch(() => null);
  if (!doc || doc.visibility !== 'public') throw new HttpError(404, 'Document introuvable');
  await serveDoc(res, doc);
}));

// ---------- Mise à jour (visibilité / permissions / nom) ----------
const updateSchema = z.object({
  visibility: VISIBILITY.optional(),
  permissions: z.object({ read: z.array(z.string().max(80)).optional(), write: z.array(z.string().max(80)).optional() }).optional(),
  name: z.string().max(200).optional()
});
router.patch('/:id', requireAuth, validate(updateSchema), wrap(async (req, res) => {
  const doc = await loadDoc(req);
  if (doc.owner_id !== req.user.sub && req.user.role !== 'ADMIN') throw new HttpError(403, 'Seul le propriétaire modifie ce document');
  const sets = []; const params = []; let i = 1;
  if (req.body.visibility) { sets.push('visibility=$' + i++); params.push(req.body.visibility); }
  if (req.body.permissions) { sets.push('permissions=$' + i++); params.push(JSON.stringify(req.body.permissions)); }
  if (req.body.name) { sets.push('name=$' + i++); params.push(req.body.name.trim()); }
  sets.push('updated_at=now()');
  params.push(doc.id);
  const updated = await db.one('UPDATE document_storage SET ' + sets.join(', ') + ' WHERE id=$' + i + ' RETURNING *', params);
  await auditChange(req, 'document.update', 'document', doc.id, simp(doc), simp(updated));
  const { storage_path, ...safe } = updated;
  res.json({ document: safe });
}));

// ---------- Suppression ----------
router.delete('/:id', requireAuth, wrap(async (req, res) => {
  const doc = await loadDoc(req);
  if (doc.owner_id !== req.user.sub && req.user.role !== 'ADMIN') throw new HttpError(403, 'Seul le propriétaire supprime ce document');
  await storage.remove('documents', path.basename(doc.storage_path));
  const before = simp(doc);
  await db.query('DELETE FROM document_storage WHERE id=$1', [doc.id]);
  await auditChange(req, 'document.delete', 'document', doc.id, before, null);
  res.json({ message: 'Document supprimé' });
}));

function simp(doc) {
  if (!doc) return null;
  const o = { ...doc };
  delete o.storage_path;
  return o;
}

module.exports = router;