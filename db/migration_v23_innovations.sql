-- =====================================================================
-- MODULE 87 — INNOVATIONS C-AUTO (7 fonctionnalités)
--   1. Avis photo/vidéo vérifiés        (review_media, verified flag)
--   2. Rappels maintenance proactifs    (maintenance_reminders)
--   3. Assistance SOS / dépannage       (sos_requests)
--   4. Forfaits d'entretien garanti     (service_plans, plan_subscriptions)
--   5. Passeport auto partageable QR    (vehicle_passport_shares)
--   6. Recharge électrique & mobilité   (charging_stations, charging_diagnostics)
--   7. Estimation valeur de revente     (vehicle_valuations, cote_market)
-- =====================================================================

-- Extensions géospatiales pour la recherche à proximité (SOS, bornes, dépanneurs)
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- ---------- 1. Avis photo/vidéo vérifiés ----------
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS media JSONB;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS intervention_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- 2. Rappels maintenance proactifs ----------
DO $$ BEGIN
  CREATE TYPE reminder_status AS ENUM ('PENDING','SENT','DELIVERED','FAILED','DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS maintenance_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_id UUID,
  op_key TEXT,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  status reminder_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON maintenance_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON maintenance_reminders(status, due_at);

-- ---------- 3. Assistance SOS / dépannage ----------
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
DO $$ BEGIN
  CREATE TYPE sos_status AS ENUM ('ACTIVE','FOUND','ACCEPTED','RESOLVED','CANCELLED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS sos_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  problem TEXT,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 20,
  status sos_status NOT NULL DEFAULT 'ACTIVE',
  matched_professional_id UUID,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sos_active ON sos_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sos_user ON sos_requests(user_id);

CREATE TABLE IF NOT EXISTS sos_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id UUID NOT NULL REFERENCES sos_requests(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  distance_km DOUBLE PRECISION,
  score DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'SUGGESTED',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sos_matches_sos ON sos_matches(sos_id);

-- ---------- 4. Forfaits d'entretien / garantie prolongée ----------
DO $$ BEGIN
  CREATE TYPE plan_period AS ENUM ('MONTH','YEAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS service_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'SILVER',
  description TEXT,
  price_cents INTEGER NOT NULL,
  period plan_period NOT NULL DEFAULT 'YEAR',
  includes_checks BOOLEAN NOT NULL DEFAULT TRUE,
  emergency_towing BOOLEAN NOT NULL DEFAULT FALSE,
  extended_warranty_months INTEGER NOT NULL DEFAULT 0,
  priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES service_plans(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plansub_user ON plan_subscriptions(user_id, status);

-- ---------- 5. Passeport auto partageable QR ----------
CREATE TABLE IF NOT EXISTS vehicle_passport_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  purpose TEXT,
  expires_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passport_shares_vehicle ON vehicle_passport_shares(vehicle_id);

-- ---------- 6. Recharge électrique & mobilité verte ----------
CREATE TABLE IF NOT EXISTS charging_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city TEXT,
  address TEXT,
  connector_types TEXT[] NOT NULL DEFAULT '{}',
  power_kw DOUBLE PRECISION,
  price_per_kwh_cents INTEGER,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  open_24h BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_charging_stations_loc ON charging_stations(latitude, longitude);

CREATE TABLE IF NOT EXISTS vehicle_charging_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  battery_kwh DOUBLE PRECISION,
  connector_type TEXT,
  avg_consumption_kwh_per_100km DOUBLE PRECISION,
  home_charge_price_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_charging_vehicle ON vehicle_charging_profile(vehicle_id);

CREATE TABLE IF NOT EXISTS charging_sessions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  station_id UUID REFERENCES charging_stations(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_min INTEGER,
  energy_kwh DOUBLE PRECISION,
  cost_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 7. Estimation valeur de revente ----------
CREATE TABLE IF NOT EXISTS vehicle_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  estimated_value_cents INTEGER NOT NULL,
  market_min_cents INTEGER,
  market_max_cents INTEGER,
  health_factor DOUBLE PRECISION NOT NULL DEFAULT 1,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  factors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_valuations_vehicle ON vehicle_valuations(vehicle_id);

CREATE TABLE IF NOT EXISTS cote_market (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  base_value_cents INTEGER NOT NULL,
  depreciation_per_year_pct DOUBLE PRECISION NOT NULL DEFAULT 12,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cote_market ON cote_market(make, model, year);
