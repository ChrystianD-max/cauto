const db = require('../db');

// ===== MODULE 75 — ARCHITECTURE MULTI-TENANT =====
// Règles d'isolation centralisées côté backend.
// Tenants supports : CLIENT (individuel = owner du véhicule),
// GARAGE, ENTREPRISE (flotte partagée), FOURNISSEUR.

// Liste des tenants (id, type, name, role) pour un utilisateur.
async function resolveTenants(userId) {
  return db.many(
    `SELECT t.id, t.type, t.name, tm.role
     FROM tenant_memberships tm
     JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1
     ORDER BY t.type, t.name`,
    [userId]
  );
}

// Identifiants des tenants d'un type donné pour un utilisateur.
async function tenantIdsFor(userId, type) {
  const rows = await db.many(
    `SELECT t.id FROM tenant_memberships tm
     JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1 AND t.type = $2`,
    [userId, type]
  );
  return rows.map((r) => r.id);
}

// Profils (professional_id) d'un utilisateur — pour le lien pro ⇄ véhicule.
async function professionalIdsFor(userId) {
  const rows = await db.many('SELECT id FROM professionals WHERE user_id=$1', [userId]);
  return rows.map((r) => r.id);
}

// Un utilisateur peut-il lire ce véhicule ?
//   - propriétaire du véhicule (CLIENT individuel / tenant CLIENT) : oui
//   - admin / super-admin : oui
//   - membre d'un tenant ENTREPRISE qui possède le véhicule (tenant_id) : oui
//   - professionnel (GARAGE/MECANICIEN) : oui SEULEMENT si le véhicule lui est
//     rattaché via une demande de service, un rendez-vous ou une intervention.
//   - fournisseur : non (jamais d'accès aux véhicules des tiers).
async function canAccessVehicle(userId, role, vehicle) {
  if (vehicle.owner_id === userId) return true;
  if (role === 'ADMIN') return true;

  if (vehicle.tenant_id) {
    const mine = await db.one(
      'SELECT 1 FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',
      [vehicle.tenant_id, userId]
    );
    if (mine) return true;
  }

  if (['GARAGE', 'MECANICIEN'].includes(role)) {
    const proIds = await professionalIdsFor(userId);
    if (proIds.length > 0) {
      const link = await db.one(
        `SELECT 1 FROM (
           SELECT 1 FROM service_requests sr
           WHERE sr.vehicle_id=$1 AND sr.professional_id = ANY($2::uuid[])
           UNION ALL
           SELECT 1 FROM appointments a
           WHERE a.vehicle_id=$1 AND a.professional_id = ANY($2::uuid[])
           UNION ALL
           SELECT 1 FROM interventions i
           WHERE i.vehicle_id=$1 AND i.professional_id = ANY($2::uuid[])
         ) l LIMIT 1`,
        [vehicle.id, proIds]
      );
      if (link) return true;
    }
  }

  return false;
}

// Clause SQL de scoping pour lister les véhicules visibles d'un utilisateur.
// Retourne { sql, params } à injecter dans WHERE (alias véhicule : v).
async function vehicleScope(userId, role) {
  if (role === 'ADMIN') return { sql: 'TRUE', params: [] };

  const tenantIds = await tenantIdsFor(userId, 'ENTREPRISE');
  const proIds = await professionalIdsFor(userId);
  const params = [userId];

  const parts = ['v.owner_id = $1'];

  if (tenantIds.length > 0) {
    params.push(tenantIds);
    parts.push(`v.tenant_id = ANY($${params.length}::uuid[])`);
  }

  if (['GARAGE', 'MECANICIEN'].includes(role) && proIds.length > 0) {
    params.push(proIds);
    parts.push(
      `EXISTS (SELECT 1 FROM service_requests sr WHERE sr.vehicle_id=v.id AND sr.professional_id = ANY($${params.length}::uuid[]))
       OR EXISTS (SELECT 1 FROM appointments a WHERE a.vehicle_id=v.id AND a.professional_id = ANY($${params.length}::uuid[]))
       OR EXISTS (SELECT 1 FROM interventions i WHERE i.vehicle_id=v.id AND i.professional_id = ANY($${params.length}::uuid[]))`
    );
  }

  return { sql: parts.join(' OR '), params };
}

module.exports = { resolveTenants, tenantIdsFor, professionalIdsFor, canAccessVehicle, vehicleScope };