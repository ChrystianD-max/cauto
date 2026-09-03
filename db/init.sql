-- C-AUTO — Schéma initial (exécuté automatiquement au premier démarrage de PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('CLIENT','GARAGE','MECANICIEN','ADMIN','SUPPLIER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE record_type AS ENUM ('CONSTRUCTOR','CAUTO','ACTUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('REQUESTED','CONFIRMED','VEHICLE_RECEIVED','DONE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE intervention_status AS ENUM ('DIAGNOSTIC','QUOTE_SENT','QUOTE_APPROVED','REPAIRING','QUALITY_CHECK','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('PENDING','APPROVED','REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE extra_status AS ENUM ('PENDING','APPROVED','REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('PENDING','SUCCEEDED','FAILED','ABORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CLIENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  owner_id UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  garage_id UUID REFERENCES garages(id),
  specialty TEXT NOT NULL DEFAULT 'MECANIQUE',
  city TEXT NOT NULL DEFAULT '',
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1950 AND 2100),
  plate TEXT NOT NULL UNIQUE,
  vin TEXT NOT NULL UNIQUE,
  mileage INTEGER NOT NULL CHECK (mileage >= 0),
  initial_mileage INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Programme d'entretien : règle = intervalle en km OU en mois (l'un OU l'autre suffit)
CREATE TABLE IF NOT EXISTS maintenance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make TEXT,                -- NULL = règle générique toutes marques
  model TEXT,               -- NULL = toutes modèles de la marque
  label TEXT NOT NULL,
  interval_km INTEGER NOT NULL CHECK (interval_km > 0),
  interval_months INTEGER NOT NULL CHECK (interval_months > 0),
  source TEXT NOT NULL DEFAULT 'CAUTO' -- CONSTRUCTOR | CAUTO
);

-- Entretiens réellement effectués + jalons de programme
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES maintenance_rules(id) ON DELETE CASCADE,
  type record_type NOT NULL DEFAULT 'ACTUAL',
  label TEXT NOT NULL,
  done_at DATE NOT NULL DEFAULT CURRENT_DATE,
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maint_rec_vehicle ON maintenance_records(vehicle_id, type);

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prediagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL UNIQUE REFERENCES issues(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  causes JSONB NOT NULL DEFAULT '[]',
  recommendations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professionals(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'REQUESTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  professional_id UUID NOT NULL REFERENCES professionals(id),
  status intervention_status NOT NULL DEFAULT 'DIAGNOSTIC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'PHOTO',   -- PHOTO | DOC
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
  status quote_status NOT NULL DEFAULT 'PENDING',
  total_cents INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- PARTS | LABOR
  qty NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS extra_work_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  explanation TEXT NOT NULL,
  parts_cents INTEGER NOT NULL DEFAULT 0,
  labor_cents INTEGER NOT NULL DEFAULT 0,
  delay_days INTEGER NOT NULL DEFAULT 0,
  evidence_ids JSONB NOT NULL DEFAULT '[]',
  status extra_status NOT NULL DEFAULT 'PENDING',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repair_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id UUID NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  extra_request_id UUID REFERENCES extra_work_requests(id),
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  checklist JSONB NOT NULL DEFAULT '{}',
  checked_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paiements SANDBOX : idempotence via clé unique
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'sandbox',
  status payment_status NOT NULL DEFAULT 'PENDING',
  outcome_requested TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_ref TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhooks : dédupliqués par event_id (livraison double => effet unique)
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  payment_id UUID REFERENCES payments(id),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
  months INTEGER NOT NULL DEFAULT 12,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  terms TEXT NOT NULL DEFAULT 'Garantie pièces et main-d''œuvre'
);

CREATE TABLE IF NOT EXISTS history_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_vehicle ON history_entries(vehicle_id);

-- Immuabilité : historique et audit en écriture seule
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % est immuable (append-only)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_history_immutable ON history_entries;
CREATE TRIGGER trg_history_immutable
  BEFORE UPDATE OR DELETE ON history_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_logs;
CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Règles d'entretien par défaut (dont la règle de test : 10 000 km OU 12 mois)
INSERT INTO maintenance_rules (make, model, label, interval_km, interval_months, source) VALUES
  ('Toyota','Land Cruiser Prado','Vidange moteur + filtre',10000,12,'CONSTRUCTOR'),
  ('Toyota','Land Cruiser Prado','Contrôle freins',20000,24,'CONSTRUCTOR'),
  ('Toyota','Land Cruiser Prado','Rotation des pneus',10000,12,'CAUTO'),
  ('Toyota','Land Cruiser Prado','Filtre à air / habitacle',20000,24,'CAUTO'),
  (NULL,NULL,'Révision générale annuelle',15000,12,'CAUTO')
ON CONFLICT DO NOTHING;
