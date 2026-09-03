-- =====================================================================
-- MODULE 34 : BASE DE DONNEES
-- Complete la modelisation relationnelle : RBAC, profils, catalogues,
-- documents, historique, alertes, metiers, facturation, logistique,
-- messagerie, geo, flotte, matching + vues d'alignement + index/FK.
-- PostgreSQL 16
-- =====================================================================

-- Le role EXPERT manquait a l'enum user_role (utilise par experts).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'EXPERT';

/* ============================== RBAC ============================== */

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  module      text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

/* ========================= USER PROFILS =========================== */

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url             text,
  phone                  text,
  address                text,
  city                   text,
  country                text DEFAULT 'FR',
  locale                 text DEFAULT 'fr',
  timezone               text DEFAULT 'Europe/Paris',
  birth_date             date,
  gender                 text CHECK (gender IN ('M', 'F', 'OTHER')),
  emergency_contact_name text,
  emergency_contact_phone text,
  params                 jsonb DEFAULT '{}'::jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

/* ========================= CATALOGUES AUTO ========================= */

CREATE TABLE IF NOT EXISTS fuel_types (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  icon text
);

CREATE TABLE IF NOT EXISTS transmissions (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE
);

INSERT INTO fuel_types (code, name, icon) VALUES
  ('DIESEL','Diesel','fuel'), ('PETROL','Essence','flame'), ('HYBRID','Hybride','zap'),
  ('ELECTRIC','Électrique','plug'), ('LPG','GPL','zap'), ('E85','E85','flame'), ('HYDROGEN','Hydrogène','wind')
ON CONFLICT (code) DO NOTHING;

INSERT INTO transmissions (code, name) VALUES
  ('MANUAL','Manuelle'), ('AUTO','Automatique'), ('SEMI','Semi-automatique'),
  ('CVT','CVT'), ('DCT','Double embrayage')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type_id uuid REFERENCES fuel_types(id) ON DELETE SET NULL;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS transmission_id uuid REFERENCES transmissions(id) ON DELETE SET NULL;

UPDATE vehicles v SET fuel_type_id = f.id
  FROM fuel_types f WHERE v.fuel_type_id IS NULL AND f.name = v.fuel_type;
UPDATE vehicles v SET transmission_id = t.id
  FROM transmissions t WHERE v.transmission_id IS NULL AND t.name = v.transmission;
CREATE INDEX IF NOT EXISTS idx_vehicles_fuel ON vehicles(fuel_type_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_transmission ON vehicles(transmission_id);

/* ==================== DOCUMENTS & HISTORIQUE ====================== */

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title         text,
  document_url  text NOT NULL,
  meta          jsonb DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_type  ON vehicle_documents(vehicle_id, document_type);

CREATE TABLE IF NOT EXISTS vehicle_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  event_date     timestamptz NOT NULL DEFAULT now(),
  mileage        integer,
  description    text,
  reference_type text,
  reference_id   uuid,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_history_vehicle ON vehicle_history(vehicle_id, event_date DESC);

/* ==================== ALERTES D'ENTRETIEN ========================== */

CREATE TABLE IF NOT EXISTS maintenance_alerts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id               uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_interval_id  uuid REFERENCES maintenance_intervals(id) ON DELETE SET NULL,
  professional_id          uuid REFERENCES professionals(id) ON DELETE SET NULL,
  label                    text,
  mileage_due              integer,
  due_date                 date,
  severity                 text DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status                   text DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED','RESOLVED')),
  message                  text,
  alert_date               timestamptz NOT NULL DEFAULT now(),
  triggered_by             text,
  resolved_at              timestamptz,
  resolved_by              uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maint_alerts_vehicle ON maintenance_alerts(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_maint_alerts_due     ON maintenance_alerts(mileage_due);

/* ===================== COMPETENCES & METRIQUES ===================== */

CREATE TABLE IF NOT EXISTS professional_skills (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  category         text NOT NULL,
  skill            text NOT NULL,
  proficiency      text CHECK (proficiency IN ('DEBUTANT','INTERMEDIAIRE','AVANCE','EXPERT')),
  years_experience integer,
  verified         boolean NOT NULL DEFAULT false,
  verified_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pro_skills_pro ON professional_skills(professional_id);

CREATE TABLE IF NOT EXISTS professional_metrics (
  professional_id    uuid PRIMARY KEY REFERENCES professionals(id) ON DELETE CASCADE,
  total_jobs         integer NOT NULL DEFAULT 0,
  completed_jobs     integer NOT NULL DEFAULT 0,
  on_time_rate       numeric(5,2),
  avg_response_minutes integer,
  rework_rate        numeric(5,2),
  complaint_rate     numeric(5,2),
  avg_delay_days     integer,
  satisfaction_rate  numeric(5,2),
  return_rate        numeric(5,2),
  last_updated       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  title         text NOT NULL,
  issuer        text,
  level         text,
  description   text,
  valid_years   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE professional_certifications ADD COLUMN IF NOT EXISTS certifications_id uuid REFERENCES certifications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pro_cert_catalog ON professional_certifications(certifications_id);

/* ======================= INSPECTIONS & FACTURES ==================== */

CREATE TABLE IF NOT EXISTS inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL,
  inspection_type text NOT NULL,
  inspector_name  text,
  mileage         integer,
  findings        jsonb DEFAULT '{}'::jsonb,
  outcome         text,
  report_url      text,
  scheduled_at    timestamptz,
  performed_at    timestamptz,
  status          text DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','PASSED','FAILED','CANCELLED')),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle ON inspections(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_inspections_pro     ON inspections(professional_id);

CREATE TABLE IF NOT EXISTS invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE,
  invoice_type     text NOT NULL DEFAULT 'STANDARD' CHECK (invoice_type IN ('STANDARD','COMMISSION','ORDER')),
  invoice_number   text UNIQUE,
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  professional_id  uuid REFERENCES professionals(id) ON DELETE SET NULL,
  supplier_id      uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  intervention_id  uuid REFERENCES interventions(id) ON DELETE SET NULL,
  quote_id         uuid REFERENCES quotes(id) ON DELETE SET NULL,
  repair_order_id  uuid REFERENCES repair_orders(id) ON DELETE SET NULL,
  part_order_id    uuid REFERENCES part_orders(id) ON DELETE SET NULL,
  payment_id       uuid REFERENCES payments(id) ON DELETE SET NULL,
  client_name      text,
  client_email     text,
  currency         text DEFAULT 'EUR',
  subtotal_cents   integer NOT NULL DEFAULT 0,
  tax_cents        integer NOT NULL DEFAULT 0,
  discount_cents   integer NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL DEFAULT 0,
  status           text DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','PAID','VOID','OVERDUE')),
  issue_date       date DEFAULT CURRENT_DATE,
  due_date         date,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_user    ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_pro     ON invoices(professional_id);
CREATE INDEX IF NOT EXISTS idx_invoices_orders  ON invoices(part_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(status);

CREATE TABLE IF NOT EXISTS repair_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id  uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  item_type        text NOT NULL DEFAULT 'PART' CHECK (item_type IN ('PART','LABOR','OTHER')),
  description      text NOT NULL,
  part_id          uuid REFERENCES parts(id) ON DELETE SET NULL,
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_items_order ON repair_items(repair_order_id);

CREATE TABLE IF NOT EXISTS transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE,
  type             text NOT NULL CHECK (type IN ('PAYMENT','ORDER','COMMISSION','REFUND','ADJUSTMENT')),
  direction        text NOT NULL DEFAULT 'IN' CHECK (direction IN ('IN','OUT')),
  amount_cents     integer NOT NULL CHECK (amount_cents >= 0),
  status           text DEFAULT 'SUCCEEDED' CHECK (status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED')),
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  professional_id  uuid REFERENCES professionals(id) ON DELETE SET NULL,
  supplier_id      uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  part_order_id    uuid REFERENCES part_orders(id) ON DELETE SET NULL,
  payment_id       uuid REFERENCES payments(id) ON DELETE SET NULL,
  commission_id    uuid REFERENCES commissions(id) ON DELETE SET NULL,
  external_ref     text,
  initiated_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_payment ON transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_pro     ON transactions(professional_id);

/* ========================= INVENTAIRE & LIVRAISONS ================= */

CREATE TABLE IF NOT EXISTS inventory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id             uuid NOT NULL UNIQUE REFERENCES parts(id) ON DELETE CASCADE,
  supplier_id         uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  warehouse           text DEFAULT 'MAIN',
  location            text,
  quantity            integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity   integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  min_stock           integer NOT NULL DEFAULT 0,
  max_stock           integer,
  reorder_point       integer NOT NULL DEFAULT 0,
  unit                text DEFAULT 'pcs',
  last_restocked_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lowstock ON inventory(quantity);

CREATE TABLE IF NOT EXISTS deliveries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_order_id            uuid NOT NULL UNIQUE REFERENCES part_orders(id) ON DELETE CASCADE,
  carrier                  text,
  tracking_number          text,
  status                   text DEFAULT 'PENDING' CHECK (status IN ('PENDING','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','FAILED','CANCELLED')),
  shipped_at               timestamptz,
  delivered_at             timestamptz,
  estimated_delivery_date  date,
  address                  text,
  recipient_name           text,
  recipient_phone          text,
  signature_url            text,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);

CREATE TABLE IF NOT EXISTS order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_order_id    uuid NOT NULL REFERENCES part_orders(id) ON DELETE CASCADE,
  part_id          uuid REFERENCES parts(id) ON DELETE SET NULL,
  reference        text,
  name             text,
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(part_order_id);

/* ========================= MESSAGERIE & GEO ======================== */

CREATE TABLE IF NOT EXISTS messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  conversation_id text,
  subject       text,
  body          text NOT NULL,
  message_type  text DEFAULT 'SYSTEM' CHECK (message_type IN ('SMS','EMAIL','PUSH','SYSTEM','CHAT')),
  read_at       timestamptz,
  delivered_at  timestamptz,
  reply_to_id   uuid REFERENCES messages(id) ON DELETE SET NULL,
  related_type  text,
  related_id    uuid,
  attachments   jsonb DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS gps_tracking (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id    uuid REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  altitude_m   double precision,
  speed_kph    double precision,
  heading      double precision,
  accuracy_m   double precision,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  source       text DEFAULT 'DEVICE'
);
CREATE INDEX IF NOT EXISTS idx_gps_vehicle_time ON gps_tracking(vehicle_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS service_zones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  code         text NOT NULL UNIQUE,
  country      text DEFAULT 'FR',
  region       text,
  city         text,
  lat          double precision,
  lng          double precision,
  radius_km    integer NOT NULL DEFAULT 20,
  is_active    boolean NOT NULL DEFAULT true,
  params       jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

/* ============================ FLOTTE =============================== */

CREATE TABLE IF NOT EXISTS fleet_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name       text NOT NULL,
  fleet_size         integer NOT NULL DEFAULT 0,
  contact_name       text,
  contact_phone      text,
  billing_address    text,
  currency           text DEFAULT 'EUR',
  credit_limit_cents integer NOT NULL DEFAULT 0,
  balance_cents      integer NOT NULL DEFAULT 0,
  status             text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  opened_at          date DEFAULT CURRENT_DATE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_account_id uuid NOT NULL REFERENCES fleet_accounts(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  license_plate    text,
  assigned_driver_id uuid REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  status           text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE','RETIRED')),
  purchase_date    date,
  mileage_start    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fleet_account_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_account ON fleet_vehicles(fleet_account_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_driver  ON fleet_vehicles(assigned_driver_id);

CREATE TABLE IF NOT EXISTS fleet_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_account_id uuid REFERENCES fleet_accounts(id) ON DELETE CASCADE,
  vehicle_id       uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id        uuid REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  event_type       text NOT NULL,
  severity         text DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  description      text,
  cost_cents       integer NOT NULL DEFAULT 0,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_events_account ON fleet_events(fleet_account_id, occurred_at DESC);

/* ============================ MATCHING ============================= */

CREATE TABLE IF NOT EXISTS professional_matches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matching_profile_id uuid NOT NULL REFERENCES matching_profiles(id) ON DELETE CASCADE,
  professional_id    uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  match_score        numeric(5,2),
  match_rank         integer,
  status             text DEFAULT 'SUGGESTED' CHECK (status IN ('SUGGESTED','CONTACTED','ACCEPTED','REJECTED')),
  response           jsonb,
  responded_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matching_profile_id, professional_id)
);
CREATE INDEX IF NOT EXISTS idx_pro_matches_pro ON professional_matches(professional_id);

/* ==================== SEEDS & RETRO-REMPLISSAGE ==================== */

INSERT INTO roles (code, name, description) VALUES
  ('ADMIN','Administrateur','Supervise la plateforme'),
  ('CLIENT','Client','Proprietaire de vehicules'),
  ('GARAGE','Garage','Professionnel garage'),
  ('MECANICIEN','Technicien','Mecanicien/technicien'),
  ('EXPERT','Expert','Expert automobile'),
  ('SUPPLIER','Fournisseur','Fournisseur de pieces')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, module, description) VALUES
  ('admin.dashboard', 'admin', 'Acceder au tableau de bord admin'),
  ('admin.users.manage', 'admin', 'Gerer les utilisateurs'),
  ('admin.vehicles.view', 'admin', 'Consulter les vehicules'),
  ('admin.professionals.verify', 'admin', 'Verifier/certifier des professionnels'),
  ('admin.operations.view', 'admin', 'Consulter les operations'),
  ('admin.finance.view', 'admin', 'Consulter les finances'),
  ('admin.catalog.manage', 'admin', 'Gerer les referentiels'),
  ('admin.settings.manage', 'admin', 'Gerer les parametres'),
  ('admin.audit.view', 'admin', 'Consulter le journal d audit'),
  ('client.vehicles.manage', 'client', 'Gerer ses vehicules'),
  ('client.sr.manage', 'client', 'Creer ses demandes'),
  ('pro.sr.manage', 'pro', 'Gerer les demandes recues'),
  ('supplier.catalog.manage', 'supplier', 'Gerer son catalogue de pieces')
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT u.id, r.id, NULL FROM users u JOIN roles r ON u.role::text = r.code
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_profiles (user_id, phone)
SELECT id, phone FROM users WHERE phone IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO professional_metrics (professional_id, satisfaction_rate, return_rate, complaint_rate, avg_delay_days)
SELECT id, satisfaction_rate, return_rate, complaint_rate, avg_delay_days
FROM professionals WHERE satisfaction_rate IS NOT NULL OR return_rate IS NOT NULL
ON CONFLICT (professional_id) DO NOTHING;

INSERT INTO certifications (code, title, issuer, level, description, valid_years) VALUES
  ('OEM_L1','Technicien agre constructeur niveau 1','Constructeur','1','Certification constructeur niveau 1',2),
  ('OEM_L2','Technicien agre constructeur niveau 2','Constructeur','2','Certification constructeur niveau 2',2),
  ('ISO_9001','Qualite ISO 9001','ISO','Certification','Management de la qualite',3),
  ('EV_SAFETY','Vehicules electriques - securite','Organisme','Avance','Intervention haute tension',3)
ON CONFLICT (code) DO NOTHING;

/* ==================== VUES D ALIGNEMENT MODULE 34 ==================
   Entities nommees qui sont implementees par des tables existantes :
   - technicians / experts   -> professionals + role utilisateur
   - reviews                 -> ratings
   - orders                  -> part_orders
   - drivers                 -> fleet_drivers
   - additional_work_requests -> extra_work_requests
   - diagnostic_records      -> diagnostics
===================================================================== */

CREATE OR REPLACE VIEW technicians AS
  SELECT p.*, u.name AS user_name, u.email, u.phone AS user_phone
  FROM professionals p JOIN users u ON u.id = p.user_id
  WHERE u.role::text = 'MECANICIEN';

CREATE OR REPLACE VIEW experts AS
  SELECT p.*, u.name AS user_name, u.email, u.phone AS user_phone
  FROM professionals p JOIN users u ON u.id = p.user_id
  WHERE u.role::text = 'EXPERT';

CREATE OR REPLACE VIEW reviews AS
  SELECT * FROM ratings;

CREATE OR REPLACE VIEW orders AS
  SELECT * FROM part_orders;

CREATE OR REPLACE VIEW drivers AS
  SELECT * FROM fleet_drivers;

CREATE OR REPLACE VIEW additional_work_requests AS
  SELECT * FROM extra_work_requests;

CREATE OR REPLACE VIEW diagnostic_records AS
  SELECT * FROM diagnostics;

/* ================== INDEX SUR LES CHEMINS EXISTANTS ================ */

CREATE INDEX IF NOT EXISTS idx_orders_status   ON part_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_vehicle  ON part_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON part_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_supplier ON part_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_parts_supplier  ON parts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_parts_category  ON parts(category);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner  ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_sr_status       ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_vehicle      ON service_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sr_professional ON service_requests(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_pro ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_vehicle ON appointments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_quotes_intervention ON quotes(intervention_id);
CREATE INDEX IF NOT EXISTS idx_quotes_service_request ON quotes(service_request_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repair_orders(status);
CREATE INDEX IF NOT EXISTS idx_repairs_intervention ON repair_orders(intervention_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_intervention ON payments(intervention_id);
CREATE INDEX IF NOT EXISTS idx_commissions_professional ON commissions(professional_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_warranties_professional ON warranties(professional_id);
CREATE INDEX IF NOT EXISTS idx_warranties_intervention ON warranties(intervention_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_ratings_professional ON ratings(professional_id);
CREATE INDEX IF NOT EXISTS idx_ratings_intervention ON ratings(intervention_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_diagnostics_intervention ON diagnostics(intervention_id);
CREATE INDEX IF NOT EXISTS idx_maint_records_vehicle ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maint_records_rule ON maintenance_records(rule_id);
CREATE INDEX IF NOT EXISTS idx_sr_history_request ON service_request_history(service_request_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_professionals_user ON professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_professionals_garage ON professionals(garage_id);
CREATE INDEX IF NOT EXISTS idx_parts_compat_part ON part_compatibility(part_id);
CREATE INDEX IF NOT EXISTS idx_warranties_parts ON warranties(covered_parts);
CREATE INDEX IF NOT EXISTS idx_sr_matched ON service_requests(matched_professionals);