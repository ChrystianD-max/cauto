#!/usr/bin/env node
/* =============================================================================
   C-AUTO — Envoi d'une sauvegarde PostgreSQL vers le stockage externe
   (S3-compatible : AWS S3, R2, MinIO, Supabase, Backblaze B2, …)
   -----------------------------------------------------------------------------
   Utilisé par deploy/backup.sh (module 64) :
     cat <dump> | docker compose exec -T backend node scripts/upload-backup.js \
       <basename.dump> <sha256> [remoteKeep]

   Lit la configuration STORAGE_* (mêmes variables que la passerelle objet des
   modules 59/60) et VÉRIFIE l'objet après le PUT :
     - HeadObject : existence + ContentLength == taille lue sur stdin ;
     - checksum SHA256 demandé au serveur (ChecksumAlgorithm=SHA256).
   Applique ensuite la rétention distante (garde les N plus récents objets
   sous <prefix>/backups/).

   Exit ≠ 0 si l'upload ou la vérification échoue.
   ============================================================================= */
'use strict';

const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const prefix = `${process.env.STORAGE_PREFIX || 'cauto'}/backups/`;
const key = `${prefix}${process.argv[2] || ''}`;
const sha256 = process.argv[3] || '';
const remoteKeep = parseInt(process.argv[4] || process.env.BACKUP_REMOTE_KEEP || '30', 10);

const required = {
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
};
for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`[upload-backup] ECHEC : ${name} absent — stockage externe non configuré`);
    process.exit(1);
  }
}

async function readStdin() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    total += chunk.length;
  }
  return { body: Buffer.concat(chunks), total };
}

(async () => {
  const client = new S3Client({
    region: process.env.STORAGE_REGION || 'auto',
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: String(process.env.STORAGE_FORCE_PATH_STYLE) === 'true',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.STORAGE_SECRET_KEY,
    },
  });

  const { body, total } = await readStdin();
  if (total === 0) {
    console.error('[upload-backup] ECHEC : stdin vide — rien à pousser');
    process.exit(1);
  }

  console.log(`[upload-backup] PUT s3://${process.env.STORAGE_BUCKET}/${key} (${total} octets)`);
  const put = await client.send(new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'application/octet-stream',
    Metadata: { cauto_backup_sha256: sha256 || 'unknown' },
    ChecksumAlgorithm: 'SHA256',
  }));

  // --- Vérification POST-PUT : l'objet existe ET la taille correspond -------
  const head = await client.send(new HeadObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: key,
  }));
  if (head.ContentLength !== total) {
    console.error(`[upload-backup] ECHEC : taille distante ${head.ContentLength} != locale ${total}`);
    process.exit(1);
  }
  console.log(`[upload-backup] vérifié : taille=${head.ContentLength}, etag=${head.ETag}, checksum SHA256 demandé`);

  // --- Rétention distante (conservation historique) -------------------------
  let keys = [];
  let token;
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket: process.env.STORAGE_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    keys = keys.concat(list.Contents || []);
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);

  keys.sort((a, b) => new Date(a.LastModified || 0) - new Date(b.LastModified || 0));
  const toDelete = keys.slice(0, Math.max(0, keys.length - remoteKeep));
  for (const obj of toDelete) {
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: obj.Key,
    }));
    console.log(`[upload-backup] rétention distante : suppression ${obj.Key}`);
  }
  console.log(`[upload-backup] TERMINE OK : ${keys.length} objet(s) distant(s), ${toDelete.length} purgé(s) — keep ${remoteKeep}`);
})().catch((err) => {
  console.error(`[upload-backup] ECHEC : ${err && err.message ? err.message : err}`);
  process.exit(1);
});