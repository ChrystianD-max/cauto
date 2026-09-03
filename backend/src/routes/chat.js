// C-AUTO — Messagerie interne (modules 61/62)
// -----------------------------------------------------------------------------
// Chat collaboratif accessible à tous les rôles (client, pro, fournisseur).
// Le stockage réutilise la table `messages` (migration v10) avec
// message_type='CHAT' ; les conversations (directes ou de groupe) et leurs
// participants vivent dans `conversations` / `conversation_members`
// (migration v16). Les non-lus sont calculés par <dernier message > last_read_at>
// du membre, ce qui fonctionne en direct comme en groupe, sans WebSocket :
// le frontend rafraîchit par polling.

const express = require('express');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { validate } = require('../utils/validate');
const uploadLib = require('../utils/upload');

const router = express.Router();
router.use(requireAuth);

const PARTICIPANT_LIMIT = 20;

// Types de médias du chat → catégories de stockage documents.
const KIND_CATEGORY = { IMAGE: 'PHOTO', VIDEO: 'VIDEO', AUDIO: 'AUDIO', FILE: 'DOCUMENT' };
// Le conteneur webm / mp4 est partagé entre audio et vidéo.
function sameMediaFamily(a, b) {
  return a === b ||
    (a === 'video/webm' && b === 'audio/webm') ||
    (a === 'audio/webm' && b === 'video/webm') ||
    (a === 'video/mp4' && b === 'audio/mp4') ||
    (a === 'audio/mp4' && b === 'video/mp4');
}

const MESSAGE_FIELDS = `m.id, m.sender_id, u.name AS sender_name, m.body, m.message_type,
   m.read_at, m.delivered_at, m.attachments, m.created_at`;

function insertChatMessage(convId, userId, body, attachments, message_type) {
  return db.one(
    `INSERT INTO messages (sender_id, conversation_id, body, message_type, attachments)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, sender_id, body, message_type, read_at, delivered_at, attachments, created_at`,
    [userId, convId, body, message_type || 'CHAT', JSON.stringify(attachments || [])]
  );
}

async function notifyOthers(convId, excludeUserId, label) {
  const members = await db.many(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
    [convId, excludeUserId]
  );
  const user = await db.one('SELECT name FROM users WHERE id=$1', [excludeUserId]);
  for (const m of members) {
    await db.query(
      `INSERT INTO notifications (user_id, message, dedupe_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [m.user_id, label + user.name, `chat:${convId}:${excludeUserId}:${m.user_id}:${Date.now()}`]
    ).catch(() => {});
  }
}

function participantsFor(cid) {
  return db.many(
    `SELECT cm.user_id AS id, u.name, u.role, u.email
     FROM conversation_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = $1`, [cid]
  );
}

async function loadConversationForMe(cid, userId) {
  const conv = await db.one('SELECT * FROM conversations WHERE id=$1', [cid]).catch(() => null);
  if (!conv) throw new HttpError(404, 'Conversation introuvable');
  const member = await db.one(
    'SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [cid, userId]
  ).catch(() => null);
  if (!member) throw new HttpError(403, 'Accès refusé à cette conversation');
  return conv;
}

// ------ Annuaire : à qui puis-je écrire ? (tous les rôles non-admin, hors soi) ------
router.get('/directory', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT u.id, u.name, u.role, u.email,
       ( (SELECT COUNT(*) FROM service_requests sr
           WHERE sr.user_id = u.id
             AND (sr.user_id = $1 OR sr.professional_id IN
               (SELECT p.id FROM professionals p WHERE p.user_id = $1))) )::int
       +
( (SELECT COUNT(*) FROM part_orders po
            WHERE po.user_id = $1 AND po.supplier_id IN
              (SELECT s.id FROM suppliers s WHERE s.user_id = u.id)) )::int
       AS shared_context
     FROM users u
     WHERE u.id <> $1 AND u.role <> 'ADMIN' AND u.role <> 'SUPER_ADMIN'
     ORDER BY shared_context DESC, u.name ASC`, [req.user.sub]
  );
  res.json({ users: rows });
}));

// ------ Mes conversations (avec non-lus, participants, dernier message) ------
router.get('/conversations', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT c.id, c.kind, c.title, c.updated_at,
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id::text AND m.message_type = 'CHAT'
           AND m.sender_id <> $1
           AND m.created_at > COALESCE(cm.last_read_at, '2020-01-01'::timestamptz))
       AS unread_count_raw
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.user_id = $1
     ORDER BY c.updated_at DESC`, [req.user.sub]
  );
  const conversations = await Promise.all(rows.map(async (r) => {
    const participants = (await participantsFor(r.id)).filter(p => p.id !== req.user.sub);
    const last = await db.one(
      `SELECT m.body, m.sender_id, u.name AS sender_name, m.created_at, m.attachments
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 AND m.message_type = 'CHAT'
       ORDER BY m.created_at DESC LIMIT 1`, [r.id]
    ).catch(() => null);
    return {
      id: r.id,
      kind: r.kind,
      title: r.title || (participants.map(p => p.name).join(', ') || 'Conversation'),
      created_at: r.created_at,
      updated_at: r.updated_at,
      unread_count: Number(r.unread_count_raw) || 0,
      participants,
      last_message: last ? {
        body: String(last.body).slice(0, 200), sender_id: last.sender_id, sender_name: last.sender_name, created_at: last.created_at,
        attachments: Array.isArray(last.attachments) ? last.attachments : [],
        attachment_kind: (Array.isArray(last.attachments) && last.attachments[0]) ? last.attachments[0].kind : null
      } : null
    };
  }));
  res.json({ conversations, total_unread: conversations.reduce((n, c) => n + c.unread_count, 0) });
}));

// ------ Créer une conversation (directe ou de groupe) ------
const createConvSchema = z.object({
  participant_ids: z.array(z.string().uuid()).min(1).max(PARTICIPANT_LIMIT),
  title: z.string().max(160).optional()
});
router.post('/conversations', validate(createConvSchema), wrap(async (req, res) => {
  const ids = [...new Set(req.body.participant_ids)];
  if (ids.includes(req.user.sub)) throw new HttpError(400, 'Vous ne pouvez pas discuter avec vous-même');
  if (ids.length !== req.body.participant_ids.length) throw new HttpError(400, 'Participants en doublon');
  const found = await db.one(
    `SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[])`, [ids]
  );
  if (!found || found.n !== ids.length) throw new HttpError(400, 'Certains participants sont inconnus');

  // Direct : réutiliser une conversation existante stricte (2 membres).
  if (ids.length === 1) {
    const existing = await db.one(
      `SELECT c.id FROM conversations c
       WHERE c.kind = 'DIRECT'
         AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
         AND EXISTS (SELECT 1 FROM conversation_members a WHERE a.conversation_id = c.id AND a.user_id = $1)
         AND EXISTS (SELECT 1 FROM conversation_members b WHERE b.conversation_id = c.id AND b.user_id = $2)`,
      [req.user.sub, ids[0]]
    );
    if (existing) {
      const conv = await loadConversationForMe(existing.id, req.user.sub);
      res.status(200).json({ conversation: { id: conv.id, kind: conv.kind, title: conv.title || '', created_at: conv.created_at, updated_at: conv.updated_at, unread_count: 0 } });
      return;
    }
  }

  const other = await db.many('SELECT name FROM users WHERE id = ANY($1::uuid[])', [ids]);
  const autoTitle = req.body.title || other.map(u => u.name).join(', ');
  const conv = await db.tx(async (c) => {
    const r = (await c.query(
      `INSERT INTO conversations (kind, title, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [ids.length === 1 ? 'DIRECT' : 'GROUP', autoTitle, req.user.sub]
    )).rows[0];
    const members = [[r.id, req.user.sub], ...ids.map(id => [r.id, id])];
    for (const [cid, uid] of members) {
      await c.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)', [cid, uid]);
    }
    return r;
  });
  res.status(201).json({ conversation: { id: conv.id, kind: conv.kind, title: conv.title, created_at: conv.created_at, updated_at: conv.updated_at, unread_count: 0 } });
}));

// ------ Message : liste + marquage lu / délivré ------
router.get('/conversations/:id/messages', wrap(async (req, res) => {
  const conv = await loadConversationForMe(req.params.id, req.user.sub);
  // Délivrance + lecture : au premier affichage côté receveur, les messages
  // reçus sont marqués delivered_at puis read_at (statut « pastille bleue »).
  await db.query(
    `UPDATE messages SET delivered_at = NOW() WHERE conversation_id = $1 AND message_type = 'CHAT' AND delivered_at IS NULL`,
    [conv.id]
  );
  await db.query(
    `UPDATE messages SET read_at = NOW() WHERE conversation_id = $1 AND message_type = 'CHAT' AND sender_id <> $2 AND read_at IS NULL`,
    [conv.id, req.user.sub]
  );
  const messages = await db.many(
    `SELECT ${MESSAGE_FIELDS}
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 AND m.message_type = 'CHAT'
     ORDER BY m.created_at ASC, m.id ASC`, [conv.id]
  );
  await db.query(
    `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
    [conv.id, req.user.sub]
  );
  const participants = await participantsFor(conv.id);
  res.json({ conversation: { id: conv.id, kind: conv.kind, title: conv.title, created_at: conv.created_at, updated_at: conv.updated_at }, participants, messages });
}));

// ------ Envoi (texte) ------
const sendSchema = z.object({ body: z.string().trim().min(1).max(4000) });
router.post('/conversations/:id/messages', validate(sendSchema), wrap(async (req, res) => {
  const conv = await loadConversationForMe(req.params.id, req.user.sub);
  const msg = await insertChatMessage(conv.id, req.user.sub, req.body.body, [], 'CHAT');
  await db.query('UPDATE conversations SET updated_at = NOW() WHERE id=$1', [conv.id]);
  await notifyOthers(conv.id, req.user.sub, 'Nouveau message de ');
  const { sender_name } = await db.one(
    'SELECT u.name AS sender_name FROM users u WHERE u.id = $1', [req.user.sub]
  );
  res.status(201).json({ message: { ...msg, sender_name } });
}));

// ------ Pièces jointes (image / vidéo / note vocale / fichier) ------
// Multipart : `file` (binaire) + `kind` (IMAGE|VIDEO|AUDIO|FILE) + `body` (légende, option).
router.post('/conversations/:id/attachments', (req, res, next) => {
  const kind = String((req.body && req.body.kind) || 'FILE').toUpperCase();
  const category = KIND_CATEGORY[kind];
  if (!category) return next(new HttpError(400, 'Type de média inconnu : ' + kind));
  const mw = uploadLib.buildUploader(category);
  mw.single('file')(req, res, (err) => (err ? next(err) : next()));
}, wrap(async (req, res) => {
  const conv = await loadConversationForMe(req.params.id, req.user.sub);
  if (!req.file) throw new HttpError(400, 'Fichier manquant (champ multipart "file")');
  const kind = String(req.body.kind || 'FILE').toUpperCase();
  const category = KIND_CATEGORY[kind];
  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch (e) { /* déjà supprimé */ } };
  if (!category) { cleanup(); throw new HttpError(400, 'Type de média inconnu : ' + kind); }

  if (!uploadLib.CATEGORY_MIME[category].includes(req.file.mimetype)) {
    cleanup(); throw new HttpError(415, 'Type de fichier non autorisé pour ' + kind + ' : ' + req.file.mimetype);
  }
  const head = fs.readFileSync(req.file.path);
  const sniffed = uploadLib.sniffMime(head);
  const declared = req.file.mimetype;
  if (sniffed && !sameMediaFamily(sniffed, declared)) { cleanup(); throw new HttpError(415, 'Contenu du fichier ne correspond pas à son type déclaré'); }
  if (!sniffed && (declared === 'application/pdf' || declared.startsWith('image/') || declared.startsWith('video/') || declared.startsWith('audio/'))) {
    cleanup(); throw new HttpError(415, 'Fichier déclaré ' + declared + ' mais signature absente');
  }
  if (req.file.size > uploadLib.MAX_BYTES) { cleanup(); throw new HttpError(413, 'Fichier trop volumineux'); }
  const scan = await uploadLib.scanFile(req.file.path);
  if (uploadLib.isBlocked(scan)) { cleanup(); throw new HttpError(422, 'Fichier signalé par l\u2019antivirus'); }

  const rel = path.relative(uploadLib.documentsDir, req.file.path).split(path.sep).join('/');
  const perms = JSON.stringify({ read: ['owner'], write: ['owner'] });
  const doc = await db.one(
    `INSERT INTO document_storage (owner_id, name, original_name, mime, size_bytes, category, entity_type, entity_id, storage_path, visibility, permissions, scan_status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'CHAT', $7, $8, 'private', $9, $10, $11)
     RETURNING id, name, original_name, mime, size_bytes, category`,
    [req.user.sub, kind + ' — ' + String(req.body.body || '').slice(0, 80) || (req.file.originalname || 'Fichier'),
     req.file.originalname || 'fichier', req.file.mimetype, req.file.size, category, conv.id, rel, perms, scan.status,
     JSON.stringify({ kind, conversation_id: conv.id })]
  )
  const attachments = [{
    id: doc.id,
    name: doc.name,
    mime: doc.mime,
    kind,
    size: doc.size_bytes,
    url: '/api/documents/' + doc.id + '/download'
  }];
  const body = String(req.body.body || '').trim().slice(0, 2000);
  const msg = await insertChatMessage(conv.id, req.user.sub, body, attachments, 'CHAT');
  await db.query('UPDATE conversations SET updated_at = NOW() WHERE id=$1', [conv.id]);
  await notifyOthers(conv.id, req.user.sub, 'Nouveau média de ');
  const { sender_name } = await db.one(
    'SELECT u.name AS sender_name FROM users u WHERE u.id = $1', [req.user.sub]
  );
  res.status(201).json({ message: { ...msg, sender_name } });
}));

module.exports = router;