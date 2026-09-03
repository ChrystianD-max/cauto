/* =============================================================================
   C-AUTO — MODULE 49 : DONNÉES DE DÉMONSTRATION
   -----------------------------------------------------------------------------
   Seed réaliste et entier pour explorer toute la plateforme :
     1 admin · 1 client · 3 professionnels (2 garages + 1 expert) ·
     2 fournisseurs · 1 flotte · + véhicules / entretiens / diagnostics /
     devis / réparations / pièces.

   Véhicules représentatifs : Toyota Prado, Toyota Corolla, Mercedes-Benz,
   Peugeot, Hyundai (+ 2 utilitaires de flotte).

   Idempotent : réexécutable sans dupliquer. Comptes depuis longtemps en base
   restent accessibles (mot de passe Test1234! vérifié/réparé si nécessaire).
   OK < 60 s sur la base staging.
   =========================================================================== */

const bcrypt = require('bcryptjs');
const db = require('../src/db');
// Module 80 : le seed lit .env (racine du dépôt) pour les identifiants du
// compte admin de développement — jamais un mot de passe en dur dans le repo.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const DEMO_PASSWORD = 'Test1234!';
const BCRYPT_ROUNDS = 12;

/* ---------------------------------------------------------------------------
   Petites requêtes sur le client de transaction
   ------------------------------------------------------------------------- */
async function q(c, text, params) { return (await c.query(text, params)).rows; }
async function q1(c, text, params) { const r = await c.query(text, params); return r.rows[0] || null; }

/* ---------------------------------------------------------------------------
   UTILISATEURS
   ------------------------------------------------------------------------- */
async function upsertUser(c, name, email, phone, role) {
  let u = await q1(c, 'SELECT * FROM users WHERE email=$1', [email]);
  if (!u) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    u = await q1(c,
      `INSERT INTO users (name,email,phone,password_hash,role,status)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE') RETURNING id,name,email,role`,
      [name, email, phone, hash, role]);
  }
  return u;
}

/* Garantit qu'un compte se connecte avec le mot de passe démo (sans casser
   ceux qui fonctionnent déjà). */
async function ensureDemoPassword(c, email) {
  const u = await q1(c, 'SELECT id,password_hash FROM users WHERE email=$1', [email]);
  if (!u) return;
  let match = false;
  try { match = bcrypt.compareSync(DEMO_PASSWORD, u.password_hash); } catch (_) { match = false; }
  if (!match) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    await c.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, u.id]);
  }
}

/* ---------------------------------------------------------------------------
   MODULE 80 - COMPTE ADMIN DE DEVELOPPEMENT (env uniquement).
   Cree uniquement HORS production, a partir de SEED_ADMIN_* (jamais de
   mot de passe reel dans le repository). SEED_ADMIN_PASSWORD vide ou laisse
   a sa valeur de modele => aucun compte n'est cree ni modifie.
   ------------------------------------------------------------------------- */
async function seedEnvAdmin(c) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  if (isProd) {
    console.log('- compte admin de developpement ignore (environnement production).');
    return null;
  }
  const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  if (!email || !password || password === 'CHANGE_ME') {
    console.log('! SEED_ADMIN_* non renseignes (modele) - aucun admin de developpement cree.');
    return null;
  }
  const name = String(process.env.SEED_ADMIN_NAME || 'Admin Developpement').trim();
  const phone = String(process.env.SEED_ADMIN_PHONE || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SEED_ADMIN_EMAIL invalide : ' + email);
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existing = await q1(c, 'SELECT id FROM users WHERE email=$1', [email]);
  if (existing) {
    await c.query('UPDATE users SET name=$1, phone=$2, role=$3, status=$4, password_hash=$5 WHERE id=$6',
      [name, phone, 'ADMIN', 'ACTIVE', hash, existing.id]);
  } else {
    await c.query(
      `INSERT INTO users (name,email,phone,password_hash,role,status)
       VALUES ($1,$2,$3,$4,'ADMIN','ACTIVE')`,
      [name, email, phone, hash]);
  }
  console.log('+ compte admin de developpement cree/mis a jour : ' + email);
  return { email, name };
}

/* ---------------------------------------------------------------------------
   GARAGES / PROFESSIONNELS
   ------------------------------------------------------------------------- */
async function upsertGarage(c, name, city, address, ownerId) {
  let g = await q1(c, 'SELECT * FROM garages WHERE name=$1', [name]);
  if (!g) {
    g = await q1(c,
      'INSERT INTO garages (name,city,address,owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, city, address, ownerId]);
  }
  return g;
}

async function upsertProfessional(c, data) {
  let p = await q1(c, 'SELECT * FROM professionals WHERE user_id=$1', [data.userId]);
  if (!p) {
    p = await q1(c,
      `INSERT INTO professionals
         (user_id, garage_id, specialty, city, rating, rating_count,
          phone, address, latitude, longitude, opening_hours, equipment,
          experience_years, satisfaction_rate, return_rate, complaint_rate,
          avg_delay_days, profile_type, is_active, is_available,
          verification_status, is_certified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [data.userId, data.garageId, data.specialty, data.city, data.rating,
       data.ratingCount, data.phone, data.address, data.lat, data.lng,
       JSON.stringify(data.openingHours || {}), JSON.stringify(data.equipment || []),
       data.experienceYears, data.satisfaction, data.returnRate, data.complaintRate,
       data.avgDelayDays, data.profileType, data.isActive !== false, data.isAvailable !== false,
       data.verificationStatus || 'VERIFIED', !!data.isCertified]);
  }
  return p;
}

async function upsertService(c, professionalId, label, category, priceCents, duration, desc) {
  const exists = await q1(c,
    'SELECT id FROM professional_services WHERE professional_id=$1 AND label=$2', [professionalId, label]);
  if (!exists) {
    await c.query(
      `INSERT INTO professional_services (professional_id,label,category,price_cents,duration_minutes,description)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [professionalId, label, category, priceCents, duration, desc]);
  }
}

async function upsertBrand(c, professionalId, brand) {
  await c.query(
    `INSERT INTO professional_brands (professional_id,brand) VALUES ($1,$2)
     ON CONFLICT (professional_id,brand) DO NOTHING`, [professionalId, brand]);
}

async function upsertCert(c, professionalId, name, issuer, obtainedAt) {
  const exists = await q1(c,
    'SELECT id FROM professional_certifications WHERE professional_id=$1 AND name=$2',
    [professionalId, name]);
  if (!exists) {
    await c.query(
      `INSERT INTO professional_certifications (professional_id,name,issuer,obtained_at)
       VALUES ($1,$2,$3,$4)`, [professionalId, name, issuer, obtainedAt]);
  }
}

async function upsertAvailability(c, professionalId, dayOfWeek, start, end, maxAppts) {
  const exists = await q1(c,
    'SELECT id FROM professional_availability WHERE professional_id=$1 AND day_of_week=$2',
    [professionalId, dayOfWeek]);
  if (!exists) {
    await c.query(
      `INSERT INTO professional_availability (professional_id,day_of_week,start_time,end_time,max_appointments)
       VALUES ($1,$2,$3,$4,$5)`,
      [professionalId, dayOfWeek, start, end, maxAppts]);
  }
}

/* ---------------------------------------------------------------------------
   VÉHICULES
   ------------------------------------------------------------------------- */
async function upsertVehicle(c, v) {
  let veh = await q1(c, 'SELECT * FROM vehicles WHERE plate=$1', [v.plate]);
  if (!veh) {
    veh = await q1(c,
      `INSERT INTO vehicles (owner_id, make, model, year, plate, vin, mileage, initial_mileage,
                             generation, engine_name, displacement_cc, fuel_type, gearbox, transmission, first_registration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [v.ownerId, v.make, v.model, v.year, v.plate, v.vin, v.mileage, v.initialMileage,
       v.generation || '', v.engineName || '', v.displacementCc || 0, v.fuelType || 'ESSENCE',
       v.gearbox || 'MANUELLE', v.transmission || 'TWD', v.firstRegistration || null]);
  }
  return veh;
}

async function historyEntry(c, vehicleId, type, title, details, createdBy) {
  const exists = await q1(c,
    'SELECT id FROM history_entries WHERE vehicle_id=$1 AND entry_type=$2 AND title=$3',
    [vehicleId, type, title]);
  if (!exists) {
    await c.query(
      `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [vehicleId, type, title, JSON.stringify(details || {}), createdBy]);
  }
}

/* ---------------------------------------------------------------------------
   ENTRETIEN (règles + jalons)
   ------------------------------------------------------------------------- */
async function rule(c, make, model, label, intervalKm, intervalMonths, source) {
  let r = await q1(c,
    'SELECT id FROM maintenance_rules WHERE make=$1 AND model=$2 AND label=$3',
    [make, model, label]);
  if (!r) {
    r = await q1(c,
      `INSERT INTO maintenance_rules (make,model,label,interval_km,interval_months,source)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [make, model, label, intervalKm, intervalMonths, source || 'CAUTO']);
  }
  return r.id;
}

async function maintenanceRecord(c, vehicleId, ruleId, type, label, doneAt, odometer, createdBy) {
  const exists = await q1(c,
    'SELECT id FROM maintenance_records WHERE vehicle_id=$1 AND label=$2 AND done_at=$3 AND odometer_km=$4',
    [vehicleId, label, doneAt, odometer]);
  if (!exists) {
    await c.query(
      `INSERT INTO maintenance_records (vehicle_id,rule_id,type,label,done_at,odometer_km,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [vehicleId, ruleId, type, label, doneAt, odometer, createdBy]);
  }
}

/* ---------------------------------------------------------------------------
   WORKFLOW (demande → rendez-vous → intervention → diagnostic → devis → chantier)
   ------------------------------------------------------------------------- */
async function serviceRequest(c, data) {
  let sr = await q1(c,
    'SELECT * FROM service_requests WHERE user_id=$1 AND vehicle_id=$2 AND problem_description=$3 AND status=$4',
    [data.userId, data.vehicleId, data.problemDescription, data.status]);
  if (!sr) {
    [sr] = await q(c,
      `INSERT INTO service_requests
         (user_id, vehicle_id, professional_id, status, problem_description, category, urgency,
          preferred_date, matched_professionals, selected_professional_at, diagnosis_notes,
          intervention_id, completed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
      [data.userId, data.vehicleId, data.professionalId || null, data.status,
       data.problemDescription, data.category || null, data.urgency || 'NORMAL',
       data.preferredDate || null, JSON.stringify(data.matched || []),
       data.selectedProAt || null, data.diagnosisNotes || null,
       data.interventionId || null, data.completedAt || null, data.createdAt]);
    if (data.history && data.history.length) {
      for (const h of data.history) {
        await c.query(
          `INSERT INTO service_request_history (service_request_id,old_status,new_status,notes,changed_by,created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [sr.id, h.old, h.new, h.notes, h.by || null, h.at || data.createdAt]);
      }
    }
  }
  return sr;
}

async function appointment(c, data) {
  const a = await q1(c,
    'SELECT * FROM appointments WHERE vehicle_id=$1 AND professional_id=$2 AND scheduled_at=$3',
    [data.vehicleId, data.professionalId, data.scheduledAt]);
  if (a) return a;
  return q1(c,
    `INSERT INTO appointments (vehicle_id,professional_id,scheduled_at,status,created_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.vehicleId, data.professionalId, data.scheduledAt, data.status, data.createdAt]);
}

async function intervention(c, data) {
  let i = await q1(c, 'SELECT * FROM interventions WHERE appointment_id=$1', [data.appointmentId]);
  if (!i) {
    i = await q1(c,
      `INSERT INTO interventions (appointment_id,vehicle_id,professional_id,status,created_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.appointmentId, data.vehicleId, data.professionalId, data.status, data.createdAt]);
  }
  return i;
}

async function diagnostic(c, interventionId, authorId, content, createdAt) {
  const exists = await q1(c, 'SELECT id FROM diagnostics WHERE intervention_id=$1', [interventionId]);
  if (!exists) {
    await c.query(
      `INSERT INTO diagnostics (intervention_id,author_id,content,created_at) VALUES ($1,$2,$3,$4)`,
      [interventionId, authorId, content, createdAt]);
  }
}

async function quote(c, data) {
  let t = await q1(c, 'SELECT * FROM quotes WHERE intervention_id=$1', [data.interventionId]);
  if (!t) {
    [t] = await q(c,
      `INSERT INTO quotes
         (intervention_id, service_request_id, status, total_cents, created_by,
          delay_days, warranty_months, notes, valid_until, decided_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.interventionId, data.srId || null, data.status, data.totalCents, data.createdBy,
       data.delayDays || 1, data.warrantyMonths || 12, data.notes || '', data.validUntil || null,
       data.decidedAt || null, data.createdAt]);
    for (const it of data.items) {
      await c.query(
        `INSERT INTO quote_items (quote_id,label,kind,qty,unit_price_cents) VALUES ($1,$2,$3,$4,$5)`,
        [t.id, it.label, it.kind, it.qty || 1, it.price]);
    }
  }
  return t;
}

async function repairOrder(c, interventionId, status, createdAt, tasks) {
  let ro = await q1(c, 'SELECT * FROM repair_orders WHERE intervention_id=$1', [interventionId]);
  if (!ro) {
    [ro] = await q(c,
      `INSERT INTO repair_orders (intervention_id,status,created_at) VALUES ($1,$2,$3) RETURNING *`,
      [interventionId, status, createdAt]);
    for (const tsk of tasks) {
      await c.query(
        `INSERT INTO tasks (repair_order_id,label,done,created_at) VALUES ($1,$2,$3,$4)`,
        [ro.id, tsk.label, tsk.done, tsk.at || createdAt]);
    }
  }
  return ro;
}

async function qualityCheck(c, data) {
  const exists = await q1(c, 'SELECT id FROM quality_checks WHERE intervention_id=$1', [data.interventionId]);
  if (!exists) {
    await c.query(
      `INSERT INTO quality_checks
         (intervention_id, checked_by, passed, notes, checklist, odometer_km,
          replaced_parts, references_used, measures, photos, codes_before, codes_after,
          road_test_ok, road_test_notes, result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [data.interventionId, data.checkedBy, data.passed, data.notes || '',
       JSON.stringify(data.checklist || {}), data.odometerKm || null,
       JSON.stringify(data.replacedParts || []), JSON.stringify(data.refs || []),
       JSON.stringify(data.measures || {}), data.photos || [],
       data.codesBefore || [], data.codesAfter || [],
       typeof data.roadTestOk === 'boolean' ? data.roadTestOk : true,
       data.roadTestNotes || null, data.result || 'OK']);
  }
}

async function payment(c, data) {
  await c.query(
    `INSERT INTO payments (intervention_id, amount_cents, provider, status, idempotency_key)
     VALUES ($1,$2,'sandbox',$3,$4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [data.interventionId, data.amountCents, data.status || 'SUCCEEDED', data.idempotencyKey]);
}

async function warranty(c, data) {
  const exists = await q1(c, 'SELECT id FROM warranties WHERE intervention_id=$1', [data.interventionId]);
  if (!exists) {
    await c.query(
      `INSERT INTO warranties
         (intervention_id, months, starts_on, ends_on, terms, professional_id,
          covered_parts, conditions, odometer_km, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [data.interventionId, data.months, data.startsOn, data.endsOn, data.terms,
       data.professionalId || null, JSON.stringify(data.coveredParts || []),
       data.conditions || 'Garantie pièces et main-d\'œuvre', data.odometerKm || null,
       data.isActive !== false]);
  }
}

async function rating(c, interventionId, authorId, stars, comment) {
  const exists = await q1(c, 'SELECT id FROM ratings WHERE intervention_id=$1', [interventionId]);
  if (!exists) {
    await c.query(
      `INSERT INTO ratings (intervention_id,author_id,stars,comment) VALUES ($1,$2,$3,$4)`,
      [interventionId, authorId, stars, comment]);
  }
}

async function notify(c, userId, message, key) {
  await c.query(
    `INSERT INTO notifications (user_id,message,dedupe_key) VALUES ($1,$2,$3)
     ON CONFLICT (dedupe_key) DO NOTHING`, [userId, message, key]);
}

/* ---------------------------------------------------------------------------
   FOURNISSEURS / PIÈCES
   ------------------------------------------------------------------------- */
async function upsertSupplier(c, data) {
  let s = await q1(c, 'SELECT * FROM suppliers WHERE name=$1', [data.name]);
  if (!s) {
    s = await q1(c,
      `INSERT INTO suppliers (name,user_id,contact_name,email,phone,address,description,rating,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
      [data.name, data.userId, data.contactName, data.email, data.phone,
       data.address, data.description, data.rating]);
  }
  return s;
}

async function upsertPart(c, data) {
  let p = await q1(c, 'SELECT * FROM parts WHERE reference=$1', [data.reference]);
  if (!p) {
    p = await q1(c,
      `INSERT INTO parts (reference,name,brand,category,description,unit_price_cents,stock_quantity,min_stock,supplier_id,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.reference, data.name, data.brand, data.category, data.description,
       data.priceCents, data.stock, data.minStock, data.supplierId, data.active !== false]);
  }
  return p;
}

async function partCompat(c, partId, make, model, yearFrom, yearTo) {
  await c.query(
    `INSERT INTO part_compatibility (part_id,make,model,year_from,year_to)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (part_id,make,model,year_from,year_to) DO NOTHING`,
    [partId, make, model, yearFrom, yearTo]);
}

async function partOrder(c, data) {
  const exists = await q1(c,
    'SELECT id FROM part_orders WHERE user_id=$1 AND part_reference=$2 AND status=$3 AND total_cents=$4',
    [data.userId, data.reference, data.status, data.totalCents]);
  if (!exists) {
    await c.query(
      `INSERT INTO part_orders (user_id,supplier_id,part_id,part_reference,part_name,quantity,unit_price_cents,total_cents,vehicle_id,address,notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [data.userId, data.supplierId, data.partId || null, data.reference, data.name,
       data.qty, data.unitPriceCents, data.totalCents, data.vehicleId || null,
       data.address || '', data.notes || '', data.status]);
  }
}

/* ---------------------------------------------------------------------------
   FLOTTE
   ------------------------------------------------------------------------- */
async function upsertDriver(c, ownerId, name, email, phone, license) {
  let d = await q1(c, 'SELECT * FROM fleet_drivers WHERE owner_id=$1 AND name=$2', [ownerId, name]);
  if (!d) {
    d = await q1(c,
      `INSERT INTO fleet_drivers (owner_id,name,email,phone,license) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ownerId, name, email, phone, license]);
  }
  return d;
}

async function assignVehicle(c, vehicleId, driverId) {
  await c.query(
    `INSERT INTO fleet_vehicle_assignments (vehicle_id,driver_id) VALUES ($1,$2)
     ON CONFLICT (vehicle_id) DO UPDATE SET driver_id=EXCLUDED.driver_id`,
    [vehicleId, driverId]);
}

async function fleetIncident(c, data) {
  const exists = await q1(c,
    'SELECT id FROM fleet_incidents WHERE owner_id=$1 AND vehicle_id=$2 AND type=$3 AND description=$4',
    [data.ownerId, data.vehicleId, data.type, data.description]);
  if (!exists) {
    await c.query(
      `INSERT INTO fleet_incidents (owner_id,vehicle_id,driver_id,type,description,location,occurred_at,cost_cents,resolved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [data.ownerId, data.vehicleId, data.driverId || null, data.type, data.description,
       data.location, data.occurredAt, data.costCents, !!data.resolved]);
  }
}

async function fleetCost(c, data) {
  const exists = await q1(c,
    'SELECT id FROM fleet_costs WHERE owner_id=$1 AND vehicle_id=$2 AND category=$3 AND amount_cents=$4 AND occurred_at=$5',
    [data.ownerId, data.vehicleId || null, data.category, data.amountCents, data.occurredAt]);
  if (!exists) {
    await c.query(
      `INSERT INTO fleet_costs (owner_id,vehicle_id,category,amount_cents,description,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [data.ownerId, data.vehicleId || null, data.category, data.amountCents, data.description, data.occurredAt]);
  }
}

/* ---------------------------------------------------------------------------
   MAIN
   ------------------------------------------------------------------------- */
async function main() {
  await db.tx(async (c) => {
    /* === ÉTAPE 1 : comptes critiques existants = accès garanti === */
    for (const email of ['client.test@cauto.local','technicien.test@cauto.local',
                         'admin.test@cauto.local','admin@cauto.local','superadmin@cauto.local',
                         'pro.garage@cauto.local','pro.meca@cauto.local','pro.diag@cauto.local',
                         'pro.mobile@cauto.local','pro.bmw@cauto.local']) {
      await ensureDemoPassword(c, email);
    }

    /* === ÉTAPE 2 : utilisateurs de démonstration === */
    const admin = await upsertUser(c, 'Dossou Elvira', 'admin.demo@cauto.local', '+22997000001', 'ADMIN');
    const client = await upsertUser(c, 'Adama Kone', 'client.demo@cauto.local', '+22997000002', 'CLIENT');
    const ga = await upsertUser(c, 'Sophie Agbodji', 'garage.auto@cauto.local', '+22997000003', 'GARAGE');
    const gm = await upsertUser(c, 'Jean-Baptiste Hounsou', 'garage.meca@cauto.local', '+22997000004', 'GARAGE');
    const exp = await upsertUser(c, 'Marcel Aholoukpe', 'expert.diag@cauto.local', '+22997000005', 'EXPERT');
    const s1 = await upsertUser(c, 'Fatou Ndiaye', 'supplier.pieces@cauto.local', '+22997000006', 'SUPPLIER');
    const s2 = await upsertUser(c, 'Koffi Assogba', 'supplier.moteur@cauto.local', '+22997000007', 'SUPPLIER');
    const fleetMgr = await upsertUser(c, 'Ramata Diallo', 'fleet.transit@cauto.local', '+22997000008', 'FLEET_MANAGER');
    for (const u of [admin, client, ga, gm, exp, s1, s2, fleetMgr]) {
      await ensureDemoPassword(c, u.email);
    }

    /* === ÉTAPE 2bis : tenants multi-tenants (mirror auth.register) === */
    for (const [user, type] of [[ga, 'GARAGE'], [gm, 'GARAGE'], [s1, 'FOURNISSEUR'], [s2, 'FOURNISSEUR'], [fleetMgr, 'ENTREPRISE']]) {
      const exists = await q1(c, 'SELECT 1 FROM tenant_memberships WHERE user_id=$1 LIMIT 1', [user.id]);
      if (!exists) {
        const t = await c.query('INSERT INTO tenants (type, name) VALUES ($1,$2) RETURNING id', [type, user.name]);
        await c.query('INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [t.rows[0].id, user.id, 'OWNER']);
      }
    }

    /* === ÉTAPE 3 : 2 garages + 3 professionnels (2 garages + 1 expert) === */
    const g1 = await upsertGarage(c, 'AutoFlash Cotonou', 'Cotonou', 'Akpakpa, Rue 12 avenue', admin.id);
    const g2 = await upsertGarage(c, 'MecaStar Garage', 'Cotonou', 'Haie Vive, Boulevard du Canada', admin.id);

    const p1 = await upsertProfessional(c, {
      userId: ga.id, garageId: g1.id, specialty: 'Mecanique generale', city: 'Cotonou',
      rating: 4.6, ratingCount: 154, phone: '+22997112233',
      address: 'Akpakpa, Rue 12 avenue', lat: 6.3703, lng: 2.3912,
      openingHours: { lundi: '08:00-18:00', mardi: '08:00-18:00', mercredi: '08:00-18:00', jeudi: '08:00-18:00', vendredi: '08:00-18:00', samedi: '09:00-13:00' },
      equipment: ['Pont élévateur 2 colonnes', 'Valise diagnostic', 'Machine à purge freins', 'Décodeur OBD2'],
      experienceYears: 12, satisfaction: 91.5, returnRate: 36.0, complaintRate: 2.2, avgDelayDays: 2,
      profileType: 'STANDARD', isCertified: true, verificationStatus: 'VERIFIED'
    });
    const p2 = await upsertProfessional(c, {
      userId: gm.id, garageId: g2.id, specialty: 'Mecanique et electricite', city: 'Cotonou',
      rating: 4.4, ratingCount: 73, phone: '+22997114455',
      address: 'Haie Vive, Boulevard du Canada', lat: 6.3467, lng: 2.3856,
      openingHours: { lundi: '08:30-18:30', mardi: '08:30-18:30', mercredi: '08:30-18:30', jeudi: '08:30-18:30', vendredi: '08:30-18:00' },
      equipment: ['Pont 4 colonnes', 'Banc de freinage', 'Analyseur de gaz', 'Multimètre pro'],
      experienceYears: 9, satisfaction: 87.2, returnRate: 29.0, complaintRate: 3.1, avgDelayDays: 3,
      profileType: 'MAINTENANCE', isCertified: true, verificationStatus: 'VERIFIED'
    });
    const p3 = await upsertProfessional(c, {
      userId: exp.id, garageId: null, specialty: 'Expert diagnostic electronique', city: 'Cotonou',
      rating: 4.9, ratingCount: 231, phone: '+22997116677',
      address: 'Fidjrosse, Route des Pylones', lat: 6.3557, lng: 2.3901,
      openingHours: { lundi: '08:00-19:00', mardi: '08:00-19:00', mercredi: '08:00-19:00', jeudi: '08:00-19:00', vendredi: '08:00-18:00' },
      equipment: ['Valise multiplexage', 'Oscilloscope', 'Caméra endoscopique', 'Station GDI'],
      experienceYears: 16, satisfaction: 95.1, returnRate: 41.0, complaintRate: 1.1, avgDelayDays: 1,
      profileType: 'DIAGNOSTIC', isCertified: true, verificationStatus: 'VERIFIED'
    });

    for (const p of [p1, p2, p3]) {
      await upsertAvailability(c, p.id, 0, '08:00', '18:00', 8);
      await upsertAvailability(c, p.id, 1, '08:00', '18:00', 8);
      await upsertAvailability(c, p.id, 2, '08:00', '18:00', 8);
      await upsertAvailability(c, p.id, 3, '08:00', '18:00', 8);
      await upsertAvailability(c, p.id, 4, '08:00', '18:00', 8);
    }
    await upsertService(c, p1.id, 'Pose d emplatures de frein', 'Freinage', 8000, 90, 'Remplacement plaquettes + purge');
    await upsertService(c, p1.id, 'Vidange moteur complete', 'Entretien', 5000, 45, 'Huile, filtre, contrle niveaux');
    await upsertService(c, p1.id, 'Remplacement embrayage', 'Mecanique', 100000, 480, 'Kit complet remplace');
    await upsertService(c, p2.id, 'Diagnostic OBD2', 'Diagnostic', 6000, 30, 'Lecture et effacement codes');
    await upsertService(c, p2.id, 'Recharge climatisation', 'Climatisation', 15000, 60, 'Contrle etat, recharge R134a');
    await upsertService(c, p3.id, 'Diagnostic electronique avance', 'Diagnostic', 12000, 45, 'Oscilloscope + multiplexage');
    await upsertService(c, p3.id, 'Reprogrammation calculateur', 'Electronique', 40000, 120, 'Mise a jour et parametrage');

    await upsertBrand(c, p1.id, 'Toyota'); await upsertBrand(c, p1.id, 'Peugeot'); await upsertBrand(c, p1.id, 'Hyundai');
    await upsertBrand(c, p2.id, 'Toyota'); await upsertBrand(c, p2.id, 'Mercedes'); await upsertBrand(c, p2.id, 'Renault');
    await upsertBrand(c, p3.id, 'Toutes marques'); await upsertBrand(c, p3.id, 'Mercedes'); await upsertBrand(c, p3.id, 'BMW');

    await upsertCert(c, p1.id, 'Certification mecanique auto', 'AFRECA', '2019-06-15');
    await upsertCert(c, p2.id, 'Certification electricite auto', 'ISO TECH', '2020-03-10');
    await upsertCert(c, p3.id, 'Certification Bosch Diagnostics', 'Bosch', '2018-09-20');
    await upsertCert(c, p3.id, 'Expertise Delphi / VCI', 'Delphi', '2021-04-05');

    /* === ÉTAPE 4 : véhicules représentatifs === */
    const v_prado = await upsertVehicle(c, {
      ownerId: client.id, make: 'Toyota', model: 'Land Cruiser Prado', year: 2016,
      plate: 'AB 1234 CE', vin: 'JTEBV71J080000100', mileage: 124300, initialMileage: 120000,
      generation: '150', engineName: '2.8 D-4D', displacementCc: 2755, fuelType: 'DIESEL',
      gearbox: 'AUTOMATIQUE', transmission: 'AWD', firstRegistration: '2016-03-15'
    });
    const v_corolla = await upsertVehicle(c, {
      ownerId: client.id, make: 'Toyota', model: 'Corolla', year: 2021,
      plate: 'AB 5678 CE', vin: 'SB1BR51L000001250', mileage: 32500, initialMileage: 20000,
      generation: 'E210', engineName: '1.8 VVT-i', displacementCc: 1798, fuelType: 'ESSENCE',
      gearbox: 'MANUELLE', transmission: 'TWD', firstRegistration: '2021-07-02'
    });
    const v_merc = await upsertVehicle(c, {
      ownerId: client.id, make: 'Mercedes-Benz', model: 'Classe C 220', year: 2019,
      plate: 'AB 2468 CE', vin: 'WDD2050421R012345', mileage: 88400, initialMileage: 80000,
      generation: 'W205 FL', engineName: '220d', displacementCc: 1950, fuelType: 'DIESEL',
      gearbox: 'AUTOMATIQUE', transmission: 'RWD', firstRegistration: '2019-01-20'
    });
    const v_308 = await upsertVehicle(c, {
      ownerId: client.id, make: 'Peugeot', model: '308', year: 2017,
      plate: 'AB 1357 CE', vin: 'VF3L5CVC0HS123456', mileage: 61500, initialMileage: 52000,
      generation: 'T9', engineName: '1.6 BlueHDi', displacementCc: 1560, fuelType: 'DIESEL',
      gearbox: 'MANUELLE', transmission: 'TWD', firstRegistration: '2017-05-11'
    });
    const v_tucson = await upsertVehicle(c, {
      ownerId: client.id, make: 'Hyundai', model: 'Tucson', year: 2022,
      plate: 'AB 9753 CE', vin: 'KMHJ281ABLU987654', mileage: 23800, initialMileage: 0,
      generation: 'NX4', engineName: '1.6 T-GDi', displacementCc: 1598, fuelType: 'ESSENCE',
      gearbox: 'AUTOMATIQUE', transmission: 'AWD', firstRegistration: '2022-02-08'
    });
    const v_hilux = await upsertVehicle(c, {
      ownerId: fleetMgr.id, make: 'Toyota', model: 'Hilux', year: 2020,
      plate: 'BF 1422 PG', vin: 'MR0FA8CD60001092', mileage: 95800, initialMileage: 40000,
      generation: 'AN120', engineName: '2.4 D-4D', displacementCc: 2393, fuelType: 'DIESEL',
      gearbox: 'MANUELLE', transmission: 'AWD', firstRegistration: '2020-09-03'
    });
    const v_partner = await upsertVehicle(c, {
      ownerId: fleetMgr.id, make: 'Peugeot', model: 'Partner', year: 2018,
      plate: 'BF 7788 PG', vin: 'VF3X7XHP8KS234587', mileage: 72100, initialMileage: 35000,
      generation: 'B9', engineName: '1.6 HDi', displacementCc: 1560, fuelType: 'DIESEL',
      gearbox: 'MANUELLE', transmission: 'TWD', firstRegistration: '2018-11-14'
    });

    for (const v of [[v_prado,'Le Land Cruiser du client'],[v_corolla,'La Corolla du client'],
                     [v_merc,'La Mercedes du client'],[v_308,'La 308 du client'],
                     [v_tucson,'Le Tucson du client'],[v_hilux,'Le Hilux de la flotte'],
                     [v_partner,'Le Partner de la flotte']]) {
      await historyEntry(c, v[0].id, 'VEHICLE', 'Creation de la fiche vehicule', { plate: v[0].plate }, client.id);
    }

    /* === ÉTAPE 5 : entretiens (règles + jalons + réalisés) === */
    const rPradoOil = await rule(c, 'Toyota', 'Land Cruiser Prado', 'Vidange moteur + filtre', 10000, 12, 'CONSTRUCTOR');
    const rPradoBrakes = await rule(c, 'Toyota', 'Land Cruiser Prado', 'Contrôle freins', 20000, 24, 'CONSTRUCTOR');
    const rPradoTires = await rule(c, 'Toyota', 'Land Cruiser Prado', 'Rotation des pneus', 10000, 12, 'CAUTO');
    const rCorollaOil = await rule(c, 'Toyota', 'Corolla', 'Vidange moteur + filtre', 15000, 12, 'CONSTRUCTOR');
    const rCorollaBrakes = await rule(c, 'Toyota', 'Corolla', 'Freins avant (plaquettes)', 30000, 24, 'CONSTRUCTOR');
    const rCorollaSpark = await rule(c, 'Toyota', 'Corolla', 'Bougies d\'allumage', 60000, 60, 'CAUTO');
    const rMercOil = await rule(c, 'Mercedes-Benz', 'Classe C 220', 'Vidange moteur + filtre', 20000, 12, 'CONSTRUCTOR');
    const rMercBrakes = await rule(c, 'Mercedes-Benz', 'Classe C 220', 'Freins avant (plaquettes)', 40000, 24, 'CONSTRUCTOR');
    const r308Oil = await rule(c, 'Peugeot', '308', 'Vidange moteur + filtre', 15000, 12, 'CONSTRUCTOR');
    const r308Belt = await rule(c, 'Peugeot', '308', 'Courroie de distribution', 100000, 96, 'CONSTRUCTOR');
    const rTucsonOil = await rule(c, 'Hyundai', 'Tucson', 'Vidange moteur + filtre', 15000, 12, 'CONSTRUCTOR');
    const rTucsonService = await rule(c, 'Hyundai', 'Tucson', 'Revision programmée 30 000 km', 30000, 36, 'CAUTO');
    const rGeneric = await rule(c, null, null, 'Revision generale annuelle', 15000, 12, 'CAUTO');

    /* Jalons constructeur (prise en charge) */
    await maintenanceRecord(c, v_prado.id, rPradoOil, 'CONSTRUCTOR', 'Jalon constructeur', '2025-02-10', 120000, ga.id);
    await maintenanceRecord(c, v_corolla.id, rCorollaOil, 'CONSTRUCTOR', 'Jalon constructeur', '2025-03-01', 20000, gm.id);
    await maintenanceRecord(c, v_merc.id, rMercOil, 'CONSTRUCTOR', 'Jalon constructeur', '2025-03-20', 80000, gm.id);
    await maintenanceRecord(c, v_308.id, r308Oil, 'CONSTRUCTOR', 'Jalon constructeur', '2025-01-12', 52000, ga.id);
    await maintenanceRecord(c, v_hilux.id, rPradoOil, 'CONSTRUCTOR', 'Jalon constructeur', '2025-02-01', 40000, ga.id);
    await maintenanceRecord(c, v_partner.id, r308Oil, 'CONSTRUCTOR', 'Jalon constructeur', '2025-01-25', 35000, ga.id);

    /* Entretiens réellement effectués */
    await maintenanceRecord(c, v_prado.id, rPradoOil, 'ACTUAL', 'Vidange moteur + filtre', '2025-11-14', 114000, ga.id);
    await maintenanceRecord(c, v_prado.id, rPradoBrakes, 'ACTUAL', 'Contrôle des freins', '2025-11-18', 114500, ga.id);
    await maintenanceRecord(c, v_prado.id, rPradoTires, 'ACTUAL', 'Rotation des pneus', '2025-11-14', 114000, ga.id);
    await maintenanceRecord(c, v_corolla.id, rCorollaOil, 'ACTUAL', 'Vidange moteur + filtre', '2025-10-02', 21000, gm.id);
    await maintenanceRecord(c, v_corolla.id, rCorollaBrakes, 'ACTUAL', 'Freins avant (plaquettes)', '2025-10-02', 21200, gm.id);
    await maintenanceRecord(c, v_merc.id, rMercOil, 'ACTUAL', 'Vidange moteur + filtre', '2025-12-05', 81500, gm.id);
    await maintenanceRecord(c, v_merc.id, rMercBrakes, 'ACTUAL', 'Freins avant (plaquettes)', '2025-12-06', 81600, gm.id);
    await maintenanceRecord(c, v_308.id, r308Oil, 'ACTUAL', 'Vidange moteur + filtre', '2025-04-18', 53000, ga.id);
    await maintenanceRecord(c, v_tucson.id, rTucsonOil, 'ACTUAL', 'Vidange moteur + filtre', '2025-08-22', 15500, ga.id);
    await maintenanceRecord(c, v_hilux.id, rPradoOil, 'ACTUAL', 'Vidange moteur + filtre', '2025-11-30', 87000, ga.id);

    /* === ÉTAPE 6 : symptômes pré-diagnostiqués === */
    async function issue(c, vehicleId, description, prediag) {
      let it = await q1(c, 'SELECT * FROM issues WHERE vehicle_id=$1 AND description=$2', [vehicleId, description]);
      if (!it) {
        [it] = await q(c, 'INSERT INTO issues (vehicle_id,description) VALUES ($1,$2) RETURNING *', [vehicleId, description]);
        await c.query(
          `INSERT INTO prediagnostics (issue_id,severity,summary,causes,recommendations)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (issue_id) DO NOTHING`,
          [it.id, prediag.severity, prediag.summary,
           JSON.stringify(prediag.causes), JSON.stringify(prediag.recommendations)]);
      }
    }
    await issue(c, v_prado.id, 'Bruit de freinage a l avant', {
      severity: 'HAUTE',
      summary: 'Sifflement metallique au freinage, surtout a froid.',
      causes: ['Plaquettes usees', 'Disques marques', 'Piston d etrier bloque'],
      recommendations: ['Controle plaquettes et disques', 'Purge du circuit de frein']
    });
    await issue(c, v_corolla.id, 'Temoin moteur allume', {
      severity: 'MOYENNE',
      summary: 'Temoin check engine, leger ralenti instable a chaud.',
      causes: ['Melange trop pauvre (P0171)', 'Debitmetre d air encrasse', 'Fuite admission'],
      recommendations: ['Lecture OBD2', 'Nettoyage ou remplacement debimetre', 'Controle des durites']
    });
    await issue(c, v_merc.id, 'Voyant liquide de refroidissement', {
      severity: 'ELEVEE',
      summary: 'Temoin niveau bas intermittents, petite fuite observee sous le vehicule.',
      causes: ['Fuite durite radiateur', 'Bocal de liquide fayele', 'Calorstat'],
      recommendations: ['Controle du circuit complet', 'Test etancheite sous pression']
    });
    await issue(c, v_tucson.id, 'Vibrations au ralenti', {
      severity: 'MOYENNE',
      summary: 'Vibrations transmises dans l habitacle au ralenti, a froid surtout.',
      causes: ['Rat e allumage cyl.1 (P0301)', 'Bougie usee', 'Bobine d allumage faible'],
      recommendations: ['Diagnostic par cylindre', 'Remplacement bougies', 'Test bobines']
    });

    /* === ÉTAPE 7 : demandes de service (fil conducteur) === */
    const srA = await serviceRequest(c, {
      userId: client.id, vehicleId: v_prado.id, professionalId: p1.id, status: 'COMPLETED',
      problemDescription: 'Bruit de freinage a l avant sur Land Cruiser',
      category: 'FREINAGE', urgency: 'URGENT', preferredDate: '2025-11-05T08:30:00Z',
      matched: [p1.id], selectedProAt: '2025-11-04T17:00:00Z',
      interventionId: null, completedAt: '2025-11-18T17:30:00Z', createdAt: '2025-11-03T09:15:00Z',
      history: [
        { old: 'CREATED', new: 'PROFESSIONAL_SELECTED', notes: 'AutoFlash Cotonou selectionne', at: '2025-11-04T17:00:00Z' },
        { old: 'PROFESSIONAL_SELECTED', new: 'APPOINTMENT_CONFIRMED', notes: 'RDV fixe le 05/11 a 08h30', at: '2025-11-04T18:00:00Z' },
        { old: 'QUOTE_APPROVED', new: 'REPAIRING', notes: 'Debut des travaux', at: '2025-11-08T09:00:00Z' },
        { old: 'QUALITY_CONTROL', new: 'COMPLETED', notes: 'Client a confirme la bonne reception', at: '2025-11-18T17:30:00Z' }
      ]
    });
    const srB = await serviceRequest(c, {
      userId: client.id, vehicleId: v_corolla.id, professionalId: p2.id, status: 'REPAIRING',
      problemDescription: 'Temoin moteur allume, ralenti instable',
      category: 'DIAGNOSTIC', urgency: 'NORMAL', preferredDate: '2026-07-22T09:00:00Z',
      matched: [p3.id, p2.id], selectedProAt: '2026-07-20T11:30:00Z',
      interventionId: null, completedAt: null, createdAt: '2026-07-20T08:45:00Z',
      history: [
        { old: 'CREATED', new: 'PROFESSIONAL_SELECTED', notes: 'MecaStar Garage selectionne', at: '2026-07-20T11:30:00Z' },
        { old: 'QUOTE_APPROVED', new: 'REPAIRING', notes: 'Travaux en cours', at: '2026-07-23T10:00:00Z' }
      ]
    });
    const srC = await serviceRequest(c, {
      userId: client.id, vehicleId: v_tucson.id, professionalId: p3.id, status: 'QUOTE_SENT',
      problemDescription: 'Vibrations au ralenti sur Hyundai Tucson',
      category: 'DIAGNOSTIC', urgency: 'NORMAL', preferredDate: '2026-08-05T14:00:00Z',
      matched: [p3.id], selectedProAt: '2026-08-04T16:00:00Z',
      interventionId: null, completedAt: null, createdAt: '2026-08-04T10:20:00Z',
      history: [
        { old: 'CREATED', new: 'PROFESSIONAL_SELECTED', notes: 'Expert diagnostic assigne', at: '2026-08-04T16:00:00Z' },
        { old: 'DIAGNOSIS', new: 'QUOTE_SENT', notes: 'Devis transmis au client', at: '2026-08-06T15:00:00Z' }
      ]
    });
    const srD = await serviceRequest(c, {
      userId: fleetMgr.id, vehicleId: v_hilux.id, professionalId: p1.id, status: 'COMPLETED',
      problemDescription: 'Perte de puissance sur Toyota Hilux (flotte)',
      category: 'MOTEUR', urgency: 'URGENT', preferredDate: '2026-02-10T08:00:00Z',
      matched: [p1.id], selectedProAt: '2026-02-09T09:00:00Z',
      interventionId: null, completedAt: '2026-02-14T12:00:00Z', createdAt: '2026-02-08T15:30:00Z',
      history: [
        { old: 'CREATED', new: 'PROFESSIONAL_SELECTED', notes: 'AutoFlash Cotonou', at: '2026-02-09T09:00:00Z' },
        { old: 'QUALITY_CONTROL', new: 'COMPLETED', notes: 'Vehicule restitue a la flotte', at: '2026-02-14T12:00:00Z' }
      ]
    });
    const srE = await serviceRequest(c, {
      userId: client.id, vehicleId: v_merc.id, professionalId: null, status: 'MATCHING',
      problemDescription: 'Voyant liquide de refroidissement, fuite suspectee',
      category: 'REFROIDISSEMENT', urgency: 'URGENT', preferredDate: null,
      matched: [p2.id, p3.id], selectedProAt: null, interventionId: null,
      completedAt: null, createdAt: '2026-08-20T07:10:00Z'
    });
    const srF = await serviceRequest(c, {
      userId: client.id, vehicleId: v_prado.id, professionalId: p1.id, status: 'APPOINTMENT_CONFIRMED',
      problemDescription: 'Entretien programme vidange + rotation pneus',
      category: 'ENTRETIEN', urgency: 'NORMAL', preferredDate: '2026-09-10T07:45:00Z',
      matched: [p1.id], selectedProAt: '2026-08-25T10:00:00Z', interventionId: null,
      completedAt: null, createdAt: '2026-08-24T18:00:00Z',
      history: [{ old: 'CREATED', new: 'APPOINTMENT_CONFIRMED', notes: 'RDV confirme le 10/09', at: '2026-08-25T10:00:00Z' }]
    });
    const srG = await serviceRequest(c, {
      userId: client.id, vehicleId: v_308.id, professionalId: null, status: 'CREATED',
      problemDescription: 'Claquement avant gauche sur Peugeot 308',
      category: 'SUSPENSION', urgency: 'NORMAL', preferredDate: null,
      matched: [], selectedProAt: null, interventionId: null, completedAt: null,
      createdAt: '2026-08-25T09:00:00Z'
    });

    /* === ÉTAPE 8 : chaînes complètes (réparations + devis + diagnostics) === */

    /* ---- Chaîne A : Prado — freins (CLOSED, payé, garanti, noté) ---- */
    const appA = await appointment(c, { vehicleId: v_prado.id, professionalId: p1.id, scheduledAt: '2025-11-05T08:30:00Z', status: 'DONE', createdAt: '2025-11-04T18:10:00Z' });
    const intA = await intervention(c, { appointmentId: appA.id, vehicleId: v_prado.id, professionalId: p1.id, status: 'CLOSED', createdAt: '2025-11-05T08:35:00Z' });
    await diagnostic(c, intA.id, ga.id, 'Usure severe des plaquettes avant (2 mm restants). Disques ondules et marques. Piston d etrier droit inetanche (fui). Recommandation : remplacement plaquettes + disques avant, controle etriers, purge du circuit.', '2025-11-05T09:40:00Z');
    const quoteA = await quote(c, {
      interventionId: intA.id, srId: srA.id, status: 'APPROVED', totalCents: 118500, createdBy: ga.id,
      delayDays: 3, warrantyMonths: 12, notes: 'Pieces constructeur - delai 3 jours ouvrés',
      validUntil: '2025-11-20T00:00:00Z', decidedAt: '2025-11-07T09:00:00Z', createdAt: '2025-11-06T10:00:00Z',
      items: [
        { label: 'Remplacement plaquettes + disques avant', kind: 'LABOR', qty: 2, price: 11000 },
        { label: 'Kit plaquettes de frein avant Toyota', kind: 'PARTS', qty: 1, price: 18500 },
        { label: 'Disques de frein avant (ventiles)', kind: 'PARTS', qty: 2, price: 26000 },
        { label: 'Liquide de frein dot 4 (1L)', kind: 'PARTS', qty: 1, price: 6500 },
        { label: 'Control etrier droit + joints', kind: 'PARTS', qty: 1, price: 18500 }
      ]
    });
    await repairOrder(c, intA.id, 'CLOSED', '2025-11-05T09:45:00Z', [
      { label: 'Controle etat des freins (avalant)', done: true, at: '2025-11-05T09:00:00Z' },
      { label: 'Demonn et replacement pieces', done: true, at: '2025-11-08T10:00:00Z' },
      { label: 'Purge + test circuit', done: true, at: '2025-11-08T11:40:00Z' },
      { label: 'Essai routier final', done: true, at: '2025-11-18T16:00:00Z' }
    ]);
    await qualityCheck(c, {
      interventionId: intA.id, checkedBy: ga.id, passed: true,
      odometerKm: 124150, checklist: { freins: 'OK', niveaux: 'OK', etan: 'OK' },
      replacedParts: [{ ref: 'PRA-PLQ-001', label: 'Plaquettes avant' }, { ref: 'PRA-FR-001', label: 'Disques avant' }],
      measures: { epaisseur_plaquettes_apres: 12, course_pedale_mm: 45 },
      codesBefore: [], codesAfter: [], roadTestOk: true, roadTestNotes: 'Freinage franc, pas de vibration', result: 'OK',
      notes: 'Controle qualite valide'
    });
    await payment(c, { interventionId: intA.id, amountCents: 118500, status: 'SUCCEEDED', idempotencyKey: 'seed:prado-brakes:2025' });
    await warranty(c, {
      interventionId: intA.id, months: 12, startsOn: '2025-11-18', endsOn: '2026-11-18',
      terms: "Garantie pieces et main-d'oeuvre", professionalId: p1.id,
      coveredParts: ['Plaquettes avant', 'Disques avant'], odometerKm: 124150, isActive: true
    });
    await rating(c, intA.id, client.id, 5, 'Excellent travail, vehicule restitue a l heure avec les pieces constructeur.');
    await historyEntry(c, v_prado.id, 'INTERVENTION', 'Intervention clôturée — freins avant remplaces', { intervention_id: intA.id, total: 118500 }, client.id);

    /* ---- Chaîne B : Corolla — témoin moteur (REPAIRING) ---- */
    const appB = await appointment(c, { vehicleId: v_corolla.id, professionalId: p2.id, scheduledAt: '2026-07-22T09:00:00Z', status: 'VEHICLE_RECEIVED', createdAt: '2026-07-20T12:00:00Z' });
    const intB = await intervention(c, { appointmentId: appB.id, vehicleId: v_corolla.id, professionalId: p2.id, status: 'REPAIRING', createdAt: '2026-07-22T09:10:00Z' });
    await diagnostic(c, intB.id, gm.id, 'Code P0171 : melange trop pauvre. Debimetre d air massique encrasse, fuite d admission detectee sur la durite de la vanne PCV. Tension du capteur instable au ralenti. Recommandation : remplacement debimetre, controle reseau de durites.', '2026-07-22T10:30:00Z');
    const quoteB = await quote(c, {
      interventionId: intB.id, srId: srB.id, status: 'APPROVED', totalCents: 163000, createdBy: gm.id,
      delayDays: 2, warrantyMonths: 12, notes: 'Debimetre d origine constructeur',
      validUntil: '2026-08-05T00:00:00Z', decidedAt: '2026-07-23T10:00:00Z', createdAt: '2026-07-22T11:00:00Z',
      items: [
        { label: 'Diagnostic + remplacement debimetre', kind: 'LABOR', qty: 1, price: 18000 },
        { label: 'Debimetre d air massique Toyota', kind: 'PARTS', qty: 1, price: 145000 }
      ]
    });
    await repairOrder(c, intB.id, 'OPEN', '2026-07-22T10:35:00Z', [
      { label: 'Confirmation diagnostic', done: true, at: '2026-07-22T11:05:00Z' },
      { label: 'Remplacement debimetre', done: false, at: '2026-07-23T09:00:00Z' },
      { label: 'Controle fuites admission', done: false, at: null },
      { label: 'Essai routier', done: false, at: null }
    ]);
    await notify(c, client.id, 'Les travaux ont commence sur votre Toyota Corolla', 'seed:repair:corolla:repairing');
    await historyEntry(c, v_corolla.id, 'INTERVENTION', 'Intervention en cours — debimetre remplace', { intervention_id: intB.id, total: 163000 }, gm.id);

    /* ---- Chaîne C : Tucson — vibrations (QUOTE_SENT, devis en attente) ---- */
    const appC = await appointment(c, { vehicleId: v_tucson.id, professionalId: p3.id, scheduledAt: '2026-08-05T14:00:00Z', status: 'VEHICLE_RECEIVED', createdAt: '2026-08-04T16:30:00Z' });
    const intC = await intervention(c, { appointmentId: appC.id, vehicleId: v_tucson.id, professionalId: p3.id, status: 'QUOTE_SENT', createdAt: '2026-08-05T14:10:00Z' });
    await diagnostic(c, intC.id, exp.id, 'Code P0301 : rate d allumage cylindre 1. Bougie d allumage n°1 fortement encrassee. Bobine d allumage cylindre 1 avec courant de fuite. Oscilloscope : tension d injection OK. Recommandation : remplacement des 4 bougies + bobine n°1.', '2026-08-06T09:20:00Z');
    const quoteC = await quote(c, {
      interventionId: intC.id, srId: srC.id, status: 'PENDING', totalCents: 94000, createdBy: exp.id,
      delayDays: 1, warrantyMonths: 12, notes: 'Nous attendons votre approbation pour lancer les travaux',
      validUntil: '2026-08-30T00:00:00Z', decidedAt: null, createdAt: '2026-08-06T12:00:00Z',
      items: [
        { label: 'Remplacement bougies + bobine n°1', kind: 'LABOR', qty: 1, price: 16000 },
        { label: 'Bougies iridium (x4)', kind: 'PARTS', qty: 4, price: 9000 },
        { label: 'Bobine d allumage Hyundai', kind: 'PARTS', qty: 1, price: 42000 }
      ]
    });
    await notify(c, client.id, 'Devis envoye pour votre Hyundai Tucson', 'seed:devis:tucson');

    /* ---- Chaîne D : Hilux (flotte) — injecteur (CLOSED, payé, garanti, noté) ---- */
    const appD = await appointment(c, { vehicleId: v_hilux.id, professionalId: p1.id, scheduledAt: '2026-02-10T08:00:00Z', status: 'DONE', createdAt: '2026-02-09T09:30:00Z' });
    const intD = await intervention(c, { appointmentId: appD.id, vehicleId: v_hilux.id, professionalId: p1.id, status: 'CLOSED', createdAt: '2026-02-10T08:05:00Z' });
    await diagnostic(c, intD.id, ga.id, 'Perte de puissance : code P0087 (pression rampe insuffisante) et P0263 (injecteur 3). Injecteur n°3 fuit au retour, rampe de pression instable. Recommandation : remplacement injecteur n°3 + kit joints, purge du circuit haut débit.', '2026-02-10T10:15:00Z');
    const quoteD = await quote(c, {
      interventionId: intD.id, srId: srD.id, status: 'APPROVED', totalCents: 248000, createdBy: ga.id,
      delayDays: 2, warrantyMonths: 12, notes: 'Injecteur d origine Bosch',
      validUntil: '2026-02-20T00:00:00Z', decidedAt: '2026-02-10T15:00:00Z', createdAt: '2026-02-10T11:00:00Z',
      items: [
        { label: 'Remplacement injecteur + purge circuit', kind: 'LABOR', qty: 1, price: 45000 },
        { label: 'Injecteur diesel Bosch', kind: 'PARTS', qty: 1, price: 185000 },
        { label: 'Kit joints rampe d injection', kind: 'PARTS', qty: 1, price: 18000 }
      ]
    });
    await repairOrder(c, intD.id, 'CLOSED', '2026-02-10T10:20:00Z', [
      { label: 'Diagnostic rampe + injecteur', done: true, at: '2026-02-10T10:20:00Z' },
      { label: 'Remplacement injecteur n°3', done: true, at: '2026-02-11T09:00:00Z' },
      { label: 'Purge + essai de pression', done: true, at: '2026-02-11T11:30:00Z' },
      { label: 'Essai routier flotte', done: true, at: '2026-02-14T11:00:00Z' }
    ]);
    await qualityCheck(c, {
      interventionId: intD.id, checkedBy: ga.id, passed: true,
      odometerKm: 94200, checklist: { pression: 'OK', fuites: 'OK', codes: 'OK' },
      replacedParts: [{ ref: 'PRA-CGR-001', label: 'Injecteur n°3' }],
      measures: { pression_rampe_bar: 1600 },
      codesBefore: ['P0087', 'P0263'], codesAfter: [], roadTestOk: true, roadTestNotes: 'Reprise de puissance normale', result: 'OK',
      notes: 'Controle qualite valide — plus de codes'
    });
    await payment(c, { interventionId: intD.id, amountCents: 248000, status: 'SUCCEEDED', idempotencyKey: 'seed:hilux-injector:2026' });
    await warranty(c, {
      interventionId: intD.id, months: 12, startsOn: '2026-02-14', endsOn: '2027-02-14',
      terms: "Garantie pieces et main-d'oeuvre", professionalId: p1.id,
      coveredParts: ['Injecteur n°3'], odometerKm: 94200, isActive: true
    });
    await rating(c, intD.id, fleetMgr.id, 4, 'Bon suivi et vehicule restitue rapidement pour la flotte.');
    await historyEntry(c, v_hilux.id, 'INTERVENTION', 'Intervention clôturée — injecteur remplace', { intervention_id: intD.id, total: 248000 }, fleetMgr.id);

    /* Liaison demandes <-> interventions (le workflow de réparation s'appuie dessus) */
    for (const [sr, iv] of [[srA, intA], [srB, intB], [srC, intC], [srD, intD]]) {
      await c.query('UPDATE service_requests SET intervention_id=$1 WHERE id=$2', [iv.id, sr.id]);
    }

    /* === ÉTAPE 9 : fournisseurs + pièces + commandes === */
    const sup1 = await upsertSupplier(c, {
      name: 'Pieces Auto Premium Benin', userId: s1.id, contactName: 'Fatou Ndiaye',
      email: s1.email, phone: '+22997000006', address: 'Marché Dantokpa, allée 12, Cotonou',
      description: 'Pieces premium et accessoires pour vehicules europeens et asiatiques', rating: 4.8
    });
    const sup2 = await upsertSupplier(c, {
      name: 'Top Moteur Import', userId: s2.id, contactName: 'Koffi Assogba',
      email: s2.email, phone: '+22997000007', address: 'Zone industrielle d Akpakpa, Cotonou',
      description: 'Moteurs, injecteurs et electronique d origine', rating: 4.6
    });

    const parts = [];
    parts.push(await upsertPart(c, { reference: 'PRA-PLQ-001', name: 'Plaquettes de frein avant (kit)', brand: 'Toyota Genuine', category: 'OEM', priceCents: 18500, stock: 24, minStock: 8, supplierId: sup1.id, description: 'Kit plaquettes avant referencées constructeur' }));
    parts.push(await upsertPart(c, { reference: 'PRA-FR-001', name: 'Disques de frein avant (ventilés)', brand: 'Bosch', category: 'PREMIUM', priceCents: 26000, stock: 12, minStock: 6, supplierId: sup1.id, description: 'Disques avant ventiles haute resistance' }));
    parts.push(await upsertPart(c, { reference: 'PRA-VID-001', name: 'Kit vidange 5W30 (4L)', brand: 'Motul', category: 'PREMIUM', priceCents: 22000, stock: 40, minStock: 15, supplierId: sup1.id, description: 'Huile 5W30 + filtre a huile' }));
    parts.push(await upsertPart(c, { reference: 'PRA-FLT-AIR', name: 'Filtre a air moteur (universel)', brand: 'Champion', category: 'ALTERNATIVE', priceCents: 6000, stock: 35, minStock: 10, supplierId: sup1.id, description: 'Filtre a air, adapte a la gamme courante' }));
    parts.push(await upsertPart(c, { reference: 'PRA-BRT-001', name: 'Bougies d allumage iridium', brand: 'NGK', category: 'PREMIUM', priceCents: 9000, stock: 50, minStock: 20, supplierId: sup1.id, description: 'Bougies iridium pour moteurs essence' }));
    parts.push(await upsertPart(c, { reference: 'PRA-CPL-001', name: 'Kit embrayage complet', brand: 'Valeo', category: 'PREMIUM', priceCents: 210000, stock: 4, minStock: 2, supplierId: sup1.id, description: 'Kit volant + disque + butee' }));
    parts.push(await upsertPart(c, { reference: 'PRA-AMO-001', name: 'Amortisseur avant', brand: 'KYB', category: 'PREMIUM', priceCents: 75000, stock: 9, minStock: 4, supplierId: sup1.id, description: 'Amortisseur avant gaz premium' }));
    parts.push(await upsertPart(c, { reference: 'PRA-CRM-001', name: 'Courroie de distribution + galets', brand: 'Continental', category: 'PREMIUM', priceCents: 95000, stock: 8, minStock: 3, supplierId: sup1.id, description: 'Kit complet courroie + galets + pompe a eau' }));
    parts.push(await upsertPart(c, { reference: 'PRA-FLT-HUI', name: 'Filtre a huile (universel)', brand: 'Mann Filter', category: 'ALTERNATIVE', priceCents: 4500, stock: 60, minStock: 20, supplierId: sup1.id, description: 'Filtre a huile compatible large parc' }));
    parts.push(await upsertPart(c, { reference: 'PRA-CGR-001', name: 'Injecteur diesel (CR)', brand: 'Bosch', category: 'OEM', priceCents: 185000, stock: 6, minStock: 2, supplierId: sup2.id, description: 'Injecteur common rail d origine' }));
    parts.push(await upsertPart(c, { reference: 'PRA-DEB-001', name: 'Debimetre d air massique', brand: 'Denso', category: 'OEM', priceCents: 145000, stock: 5, minStock: 2, supplierId: sup2.id, description: 'Debimetre d air massique d origine' }));
    parts.push(await upsertPart(c, { reference: 'PRA-ALT-001', name: 'Alternateur 150A', brand: 'Valeo', category: 'PREMIUM', priceCents: 165000, stock: 5, minStock: 2, supplierId: sup2.id, description: 'Alternateur 150A reconstruction neuve' }));
    parts.push(await upsertPart(c, { reference: 'PRA-BOB-001', name: 'Bobine d allumage (par module)', brand: 'NGK', category: 'PREMIUM', priceCents: 42000, stock: 12, minStock: 4, supplierId: sup2.id, description: 'Bobine d allumage module, direct' }));
    parts.push(await upsertPart(c, { reference: 'PRA-CLI-001', name: 'Compresseur de climatisation', brand: 'Denso', category: 'OEM', priceCents: 245000, stock: 3, minStock: 1, supplierId: sup2.id, description: 'Compresseur climatisation d origine' }));
    parts.push(await upsertPart(c, { reference: 'PRA-ECH-001', name: 'Echappement collecteur', brand: 'Walker', category: 'PREMIUM', priceCents: 85000, stock: 7, minStock: 2, supplierId: sup1.id, description: 'Collecteur d echappement avant inox' }));
    parts.push(await upsertPart(c, { reference: 'PRA-GEO-001', name: 'Geometrie de direction', brand: 'Febi Bilstein', category: 'PREMIUM', priceCents: 55000, stock: 10, minStock: 3, supplierId: sup1.id, description: 'Kit geometrie avant complet' }));
    parts.push(await upsertPart(c, { reference: 'PRA-HUI-002', name: 'Huile de boite de vitesse', brand: 'Motul', category: 'PREMIUM', priceCents: 12000, stock: 30, minStock: 10, supplierId: sup2.id, description: 'Huile ATF synthetique 1L' }));
    parts.push(await upsertPart(c, { reference: 'PRA-JNT-001', name: 'Joint de culasse', brand: 'Victor Reinz', category: 'OEM', priceCents: 32000, stock: 8, minStock: 3, supplierId: sup1.id, description: 'Joint culasse multilayer pare-feu' }));
    parts.push(await upsertPart(c, { reference: 'PRA-LUM-001', name: 'Lumiere de phare avant', brand: 'Hella', category: 'PREMIUM', priceCents: 68000, stock: 6, minStock: 2, supplierId: sup2.id, description: 'Projecteur avant LED bi-xenon' }));
    parts.push(await upsertPart(c, { reference: 'PRA-MOT-001', name: 'Moteur de lave-glace', brand: 'Valeo', category: 'ALTERNATIVE', priceCents: 8500, stock: 20, minStock: 8, supplierId: sup1.id, description: 'Pompe lave-glace 12V universelle' }));

    for (const [part, make, model, y1, y2] of [
      ['PRA-PLQ-001', 'Toyota', 'Land Cruiser Prado', 2014, 2022],
      ['PRA-PLQ-001', 'Toyota', 'Corolla', 2019, 2024],
      ['PRA-FR-001', 'Toyota', 'Land Cruiser Prado', 2014, 2022],
      ['PRA-FR-001', 'Mercedes-Benz', 'Classe C 220', 2017, 2022],
      ['PRA-BRT-001', 'Peugeot', '308', 2017, 2021],
      ['PRA-BRT-001', 'Hyundai', 'Tucson', 2020, 2024],
      ['PRA-CPL-001', 'Peugeot', '308', 2017, 2021],
      ['PRA-AMO-001', 'Hyundai', 'Tucson', 2020, 2024],
      ['PRA-CGR-001', 'Toyota', 'Land Cruiser Prado', 2014, 2022],
      ['PRA-CGR-001', 'Toyota', 'Hilux', 2018, 2022],
      ['PRA-DEB-001', 'Toyota', 'Corolla', 2019, 2024],
      ['PRA-CLI-001', 'Mercedes-Benz', 'Classe C 220', 2017, 2022]
    ]) {
      const pp = parts.find(x => x.reference === part);
      await partCompat(c, pp.id, make, model, y1, y2);
    }

    await partOrder(c, { userId: client.id, supplierId: sup1.id, partId: parts.find(x => x.reference === 'PRA-PLQ-001').id, reference: 'PRA-PLQ-001', name: 'Plaquettes de frein avant (kit)', qty: 1, unitPriceCents: 18500, totalCents: 18500, vehicleId: v_corolla.id, address: 'Cotonou, Av. de la Liberte', notes: 'Commande creee pour entretien', status: 'PENDING' });
    await partOrder(c, { userId: client.id, supplierId: sup1.id, partId: parts.find(x => x.reference === 'PRA-VID-001').id, reference: 'PRA-VID-001', name: 'Kit vidange 5W30 (4L)', qty: 1, unitPriceCents: 22000, totalCents: 22000, vehicleId: v_prado.id, address: 'Cotonou, Av. de la Liberte', notes: 'Commande livree', status: 'DELIVERED' });
    await partOrder(c, { userId: fleetMgr.id, supplierId: sup2.id, partId: parts.find(x => x.reference === 'PRA-CGR-001').id, reference: 'PRA-CGR-001', name: 'Injecteur diesel (CR)', qty: 1, unitPriceCents: 185000, totalCents: 185000, vehicleId: v_hilux.id, address: 'Entrepot TransitLog, Cotonou', notes: 'Injecteur numéro 3', status: 'SHIPPED' });
    await partOrder(c, { userId: client.id, supplierId: sup1.id, partId: parts.find(x => x.reference === 'PRA-AMO-001').id, reference: 'PRA-AMO-001', name: 'Amortisseur avant', qty: 2, unitPriceCents: 75000, totalCents: 150000, vehicleId: v_tucson.id, address: 'Cotonou, Av. de la Liberte', notes: 'Commande annulee de commun accord', status: 'CANCELLED' });
    await partOrder(c, { userId: client.id, supplierId: sup1.id, partId: parts.find(x => x.reference === 'PRA-CPL-001').id, reference: 'PRA-CPL-001', name: 'Kit embrayage complet', qty: 1, unitPriceCents: 210000, totalCents: 210000, vehicleId: v_308.id, address: 'Cotonou, Av. de la Liberte', notes: '', status: 'CONFIRMED' });

    /* === ÉTAPE 10 : flotte (conducteurs, affectations, incidents, coûts) === */
    const d1 = await upsertDriver(c, fleetMgr.id, 'Blaise Ahouansou', 'blaise@transitlog.bj', '+22996111111', 'BEN-AT-12214');
    const d2 = await upsertDriver(c, fleetMgr.id, 'Nadia Kpoviessi', 'nadia@transitlog.bj', '+22996222222', 'BEN-AT-13327');
    const d3 = await upsertDriver(c, fleetMgr.id, 'Rachid Mensah', 'rachid@transitlog.bj', '+22996333333', 'BEN-AT-14451');
    await assignVehicle(c, v_hilux.id, d1.id);
    await assignVehicle(c, v_partner.id, d2.id);

    await fleetIncident(c, { ownerId: fleetMgr.id, vehicleId: v_hilux.id, driverId: d1.id, type: 'ACCIDENT', description: 'Collision legere, pare-choc avant et phare droit', location: 'Carrefour Tokplegbe', occurredAt: '2026-03-18T08:20:00Z', costCents: 65000, resolved: true });
    await fleetIncident(c, { ownerId: fleetMgr.id, vehicleId: v_partner.id, driverId: d2.id, type: 'PANNE', description: 'Panne de demarrage, batterie a remplacer', location: 'Zone Gbodjete', occurredAt: '2026-08-14T07:45:00Z', costCents: 0, resolved: false });

    await fleetCost(c, { ownerId: fleetMgr.id, vehicleId: v_hilux.id, category: 'CARBURANT', amountCents: 85000, description: 'Plein de gazole — juin', occurredAt: '2026-06-05' });
    await fleetCost(c, { ownerId: fleetMgr.id, vehicleId: v_partner.id, category: 'CARBURANT', amountCents: 62000, description: 'Plein de gazole — juin', occurredAt: '2026-06-12' });
    await fleetCost(c, { ownerId: fleetMgr.id, vehicleId: v_hilux.id, category: 'ENTRETIEN', amountCents: 248000, description: 'Remplacement injecteur n°3 (via C-AUTO)', occurredAt: '2026-02-14' });
    await fleetCost(c, { ownerId: fleetMgr.id, vehicleId: null, category: 'ASSURANCE', amountCents: 180000, description: 'Prime annuelle flotte (2 vehicules)', occurredAt: '2026-01-15' });
    await fleetCost(c, { ownerId: fleetMgr.id, vehicleId: v_partner.id, category: 'ACCIDENT', amountCents: 65000, description: 'Reparation pare-choc + phare', occurredAt: '2026-03-25' });
    await fleetCost(c, { ownerId: fleetMgr.id, vehicleId: v_hilux.id, category: 'CARBURANT', amountCents: 90000, description: 'Plein de gazole — juillet', occurredAt: '2026-07-03' });

    /* === ÉTAPE 11 : notifications === */
    await notify(c, client.id, 'Rendez-vous confirme : AutoFlash Cotonou — demain 08h30', 'seed:notif:client:rdv-prado');
    await notify(c, client.id, 'Devis approuvé — travaux en cours sur votre Toyota Corolla', 'seed:notif:client:corolla-travaux');
    await notify(c, exp.id, 'Demande de diagnostic assignee : Hyundai Tucson', 'seed:notif:exp:tucson');
    await notify(c, ga.id, 'Client a confirme la bonne reception — dossier clôturé', 'seed:notif:ga:prado');
    await notify(c, fleetMgr.id, 'Panne signalee sur le Peugeot Partner par Nadia K.', 'seed:notif:fleet:partner');

    /* === ÉTAPE 12 : admin de développement (module 80, env uniquement) === */
    const devAdmin = await seedEnvAdmin(c);

    /* === RÉSUMÉ === */
    const counts = {
      users: 8,
      garages: await (await c.query('SELECT COUNT(*)::int AS n FROM garages')).rows[0].n,
      professionals: await (await c.query('SELECT COUNT(*)::int AS n FROM professionals')).rows[0].n,
      vehicles: await (await c.query('SELECT COUNT(*)::int AS n FROM vehicles')).rows[0].n,
      maintenance_records: await (await c.query('SELECT COUNT(*)::int AS n FROM maintenance_records')).rows[0].n,
      diagnostics: await (await c.query('SELECT COUNT(*)::int AS n FROM diagnostics')).rows[0].n,
      quotes: await (await c.query('SELECT COUNT(*)::int AS n FROM quotes')).rows[0].n,
      interventions: await (await c.query('SELECT COUNT(*)::int AS n FROM interventions')).rows[0].n,
      parts: await (await c.query('SELECT COUNT(*)::int AS n FROM parts')).rows[0].n,
      suppliers: await (await c.query('SELECT COUNT(*)::int AS n FROM suppliers')).rows[0].n,
      part_orders: await (await c.query('SELECT COUNT(*)::int AS n FROM part_orders')).rows[0].n,
      fleet_drivers: await (await c.query('SELECT COUNT(*)::int AS n FROM fleet_drivers')).rows[0].n,
      service_requests: await (await c.query('SELECT COUNT(*)::int AS n FROM service_requests')).rows[0].n
    };

    console.log(JSON.stringify({
      seeded: true,
      password_demo: DEMO_PASSWORD,
      dev_admin: devAdmin ? { email: devAdmin.email, name: devAdmin.name } : null,
      demo_accounts: {
        admin: 'admin.demo@cauto.local',
        client: 'client.demo@cauto.local',
        garage1: 'garage.auto@cauto.local',
        garage2: 'garage.meca@cauto.local',
        expert: 'expert.diag@cauto.local',
        supplier1: 'supplier.pieces@cauto.local',
        supplier2: 'supplier.moteur@cauto.local',
        fleet: 'fleet.transit@cauto.local'
      },
      vehicles: ['Toyota Land Cruiser Prado', 'Toyota Corolla', 'Mercedes-Benz Classe C 220', 'Peugeot 308', 'Hyundai Tucson'],
      fleet_vehicles: ['Toyota Hilux', 'Peugeot Partner'],
      counts
    }, null, 2));
  });
}

main().catch((e) => { console.error(e); process.exit(1); });