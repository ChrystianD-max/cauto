/* =============================================================================
   PROMOTION SUPER_ADMIN — maintenance ponctuelle (PAS un seed).
   -----------------------------------------------------------------------------
   La gestion des admins (ajouter / retirer / suspendre / changer le rôle)
   existe déjà : backend/src/routes/superAdmin.js. Elle n'est accessible qu'aux
   comptes dont req.user.isSuperAdmin est vrai, c'est-à-dire :
     users.role = 'SUPER_ADMIN'  (cf. backend/src/middlewares/auth.js).

   Pour permettre au super admin principal d'ouvrir cette console de gestion
   des admins, ce script promeut UN compte existant en SUPER_ADMIN.

   Garanties :
     - Transactionnel : tout ou rien (BEGIN/COMMIT/ROLLBACK via db.tx).
     - Idempotent : ré-exécutable sans effet de bord (ON CONFLICT DO NOTHING).
     - Aucun mot de passe en dur : ne touche JAMAIS à password_hash.
     - N'ajoute aucune table : le seed backend/seed/seed.js reste 100% intact.
     - Cible lisible : env PROMOTE_EMAIL, sinon SEED_ADMIN_EMAIL, sinon
       admin.dev@cauto.local.

   Usage :
     PROMOTE_EMAIL=ton.email@... node backend/scripts/promote-super-admin.js
   =========================================================================== */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const db = require('../src/db');

const DEFAULT_EMAIL = 'admin.dev@cauto.local';

async function promote(c, email) {
  const find = await c.query('SELECT id, name, email, role, status FROM users WHERE email=$1', [email]);
  const user = find.rows[0];
  if (!user) throw new Error('Aucun compte avec cet email : ' + email);

  const needRole = user.role !== 'SUPER_ADMIN';
  const needStatus = user.status !== 'ACTIVE';

  if (needRole || needStatus) {
    await c.query(
      `UPDATE users SET role='SUPER_ADMIN', status='ACTIVE' WHERE id=$1`, [user.id]);
  }

  // Liaison user_roles comme le fait superAdmin.js (roles.code).
  await c.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, r.id FROM roles r WHERE r.code='SUPER_ADMIN'
     ON CONFLICT DO NOTHING`, [user.id]);

  return { user, needRole, needStatus };
}

async function main() {
  const email = String(
    process.env.PROMOTE_EMAIL || process.env.SEED_ADMIN_EMAIL || DEFAULT_EMAIL
  ).trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email invalide : ' + email);

  const { user, needRole, needStatus } = await db.tx((c) => promote(c, email));

  console.log('✔ Compte promu en SUPER_ADMIN :');
  console.log('   email  : ' + user.email);
  console.log('   nom    : ' + user.name);
  console.log('   rôle   : SUPER_ADMIN' + (needRole ? '' : ' (déjà SUPER_ADMIN)'));
  console.log('   statut : ' + user.status);
  console.log('');
  console.log('La console "super admin" est maintenant accessible avec ce compte :');
  console.log('elle permet de gérer les autres administrateurs (ajouter, retirer,');
  console.log('suspendre, changer le rôle), les paramètres critiques, pays, devises,');
  console.log('intégrations, et l\'audit.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Échec : ' + e.message);
  process.exit(1);
});
