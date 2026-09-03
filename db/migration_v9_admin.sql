-- migration_v9_admin.sql — Module 32 ADMINISTRATION + 33 PROGRAMMES D'ENTRETIEN
-- Traitement: Get-Content -Raw file | docker exec -i defaultproject-postgres-1 psql -U cauto -d cauto

-- ====== 1. UTILISATEURS : statut ======
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

-- ====== 2. PROFESSIONNELS : vérification & certification (badge bleu) ======
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verification_note TEXT NOT NULL DEFAULT '';
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_certified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS certified_by UUID REFERENCES users(id);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ;

-- ====== 3. FOURNISSEURS : vérification ======
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ====== 4. PROGRAMMES D'ENTRETIEN : cycle de vie ======
ALTER TABLE maintenance_programs ADD COLUMN IF NOT EXISTS admin_status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE maintenance_programs ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE maintenance_programs ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE maintenance_programs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE maintenance_programs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
UPDATE maintenance_programs SET admin_status='PUBLISHED', published_at=COALESCE(published_at, now()) WHERE is_active = true AND admin_status='DRAFT';

-- ====== 5. COMMISSIONS ======
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  intervention_id UUID REFERENCES interventions(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  paid_at TIMESTAMPTZ,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- ====== 6. PARAMÈTRES APPLICATIFS ======
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====== 7. COMPTE ADMINISTRATEUR (admin@cauto.local / Test1234!) ======
INSERT INTO users (name, email, phone, password_hash, role, status)
VALUES ('C-AUTO Admin','admin@cauto.local','+22990000099','$2a$12$fP1khFsbCB5VnQ/nrlD3lOuktNnTaRNV5ZGtpvZC/G2f8/J7goTWW','ADMIN','ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- ====== 8. PARAMÈTRES PAR DÉFAUT ======
INSERT INTO app_settings (key, value, type) VALUES
  ('platform.name','C-AUTO','text'),
  ('platform.support_email','support@cauto.local','text'),
  ('fees.commission_rate','10.0','number'),
  ('fees.verification_enabled','true','boolean'),
  ('maintenance.alert_km','500','number'),
  ('maintenance.alert_days','30','number')
ON CONFLICT (key) DO NOTHING;