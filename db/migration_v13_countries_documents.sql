-- ============================================================================
-- MIGRATION v13 -- Modules 40 (Stockage) / 44 (Pays) / 45 (Devises)
--                41 (Sécurité : refresh/OTP) / 43 (Audit avant/après) / 46 (i18n)
-- Idempotente. Rôle : -- MIGRATION_V13_OK
-- ============================================================================

-- ---------- Module 44/45 : GÉOGRAPHIE MULTI-PAYS ----------
CREATE TABLE IF NOT EXISTS currencies (
  code       text PRIMARY KEY,           -- XOF, GNF, XAF, NGN, CDF...
  name       text NOT NULL,
  symbol     text NOT NULL,              -- 'F CFA', 'GNF', 'FCFA'...
  decimals   int  NOT NULL DEFAULT 0,
  iso_number text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS countries (
  code           text PRIMARY KEY,       -- 'BJ', 'TG', 'CI'...
  name           text NOT NULL,
  name_fr        text NOT NULL,
  region         text NOT NULL,          -- 'AFRIQUE_OUEST', 'AFRIQUE_CENTRALE'
  phone_code     text,
  currency_code  text NOT NULL REFERENCES currencies(code),
  default_locale text NOT NULL DEFAULT 'fr',   -- module 46
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     int  NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code),
  code         text NOT NULL,
  name         text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  CONSTRAINT uk_region UNIQUE (country_code, code)
);

CREATE TABLE IF NOT EXISTS cities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code),
  region_code  text,
  name         text NOT NULL,
  lat          double precision,
  lng          double precision,
  is_active    boolean NOT NULL DEFAULT true,
  CONSTRAINT uk_city UNIQUE (country_code, name),
  CONSTRAINT fk_cities_region FOREIGN KEY (country_code, region_code) REFERENCES regions(country_code, code)
);

-- Méthodes de paiement acceptées PAR PAYS (module 45 : config, pas de hardcode).
CREATE TABLE IF NOT EXISTS payment_methods (
  code         text PRIMARY KEY,          -- MOBILE_MONEY / CARD / CASH / CAUTO_WALLET
  name         text NOT NULL,
  name_fr      text NOT NULL,
  countries    text[] NOT NULL DEFAULT '{}',
  params       jsonb NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true
);

-- ---------- Module 41 : SÉCURITÉ ----------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,      -- sha256 du refresh token (jamais stocké en clair)
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      text NOT NULL DEFAULT '2FA',          -- LOGIN / PASSWORD_RESET / EMAIL_VERIFY
  code_hash    text NOT NULL,                        -- sha256(code) — jamais en clair
  medium       text NOT NULL DEFAULT 'sms',
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  attempts     int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_codes(user_id, created_at);

-- ---------- Module 40 : STOCKAGE DOCUMENTS ----------
CREATE TABLE IF NOT EXISTS document_storage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  original_name text NOT NULL,
  mime          text NOT NULL,
  size_bytes    integer NOT NULL,
  category      text NOT NULL DEFAULT 'DOCUMENT',   -- PHOTO / VIDEO / PDF / INVOICE / REPORT / VEHICLE / DOCUMENT
  entity_type   text,                                -- VEHICLE / INTERVENTION / QUOTE / PAYMENT / REPAIR / WARRANTY / PROFILE
  entity_id     uuid,
  storage_path  text NOT NULL,                       -- chemin relatif sous UPLOAD_DIR/documents/
  visibility    text NOT NULL DEFAULT 'private',     -- private / professional / public
  permissions   jsonb NOT NULL DEFAULT '{"read":["owner"],"write":["owner"]}',
  scan_status   text NOT NULL DEFAULT 'PENDING',     -- PENDING / CLEAN / INFECTED / DISABLED
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_owner   ON document_storage(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity  ON document_storage(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON document_storage(category);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON document_storage(visibility);

-- ---------- Module 43 : AUDIT — instantanés AVANT / APRÈS ----------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "before" jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "after"  jsonb;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS ip text;

-- ---------- SEEDS : DEVISES ----------
INSERT INTO currencies (code, name, symbol, decimals, iso_number, is_active) VALUES
  ('XOF', 'Franc CFA (UEMOA)', 'F CFA', 0, '952', true),
  ('XAF', 'Franc CFA (CEMAC)', 'F CFA', 0, '950', true),
  ('GNF', 'Franc guinéen', 'GNF', 0, '324', true),
  ('NGN', 'Naira', '₦', 2, '566', true),
  ('CDF', 'Franc congolais', 'FC', 2, '976', true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, decimals=EXCLUDED.decimals;

-- ---------- SEEDS : PAYS (Bénin ACTIF en premier ; autres marchés PRÉPARÉS) ----------
INSERT INTO countries (code, name, name_fr, region, phone_code, currency_code, default_locale, is_active, sort_order) VALUES
  ('BJ', 'Benin', 'Bénin', 'AFRIQUE_OUEST', '+229', 'XOF', 'fr',  true, 1),
  ('TG', 'Togo', 'Togo', 'AFRIQUE_OUEST', '+228', 'XOF', 'fr',  true, 10),
  ('CI', 'Ivory Coast', 'Côte d''Ivoire', 'AFRIQUE_OUEST', '+225', 'XOF', 'fr',  true, 10),
  ('SN', 'Senegal', 'Sénégal', 'AFRIQUE_OUEST', '+221', 'XOF', 'fr', true, 10),
  ('BF', 'Burkina Faso', 'Burkina Faso', 'AFRIQUE_OUEST', '+226', 'XOF', 'fr', true, 10),
  ('NE', 'Niger', 'Niger', 'AFRIQUE_OUEST', '+227', 'XOF', 'fr', true, 10),
  ('GN', 'Guinea', 'Guinée', 'AFRIQUE_OUEST', '+224', 'GNF', 'fr', true, 10)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, name_fr=EXCLUDED.name_fr, region=EXCLUDED.region,
  phone_code=EXCLUDED.phone_code, currency_code=EXCLUDED.currency_code, is_active=EXCLUDED.is_active;

-- ---------- SEEDS : RÉGIONS / VILLES (Bénin d'abord, plus quelques villes préparées) ----------
INSERT INTO regions (country_code, code, name) VALUES
  ('BJ', 'BJA', 'Atlantique'), ('BJ', 'BJL', 'Littoral'), ('BJ', 'BJO', 'Ouémé'),
  ('BJ', 'BJB', 'Borgou'), ('BJ', 'BJK', 'Collines'), ('BJ', 'BJJ', 'Zou'),
  ('BJ', 'BJM', 'Mono'), ('BJ', 'BJP', 'Plateau'), ('BJ', 'BJC', 'Couffo'),
  ('BJ', 'BJD', 'Donga'), ('BJ', 'BJN', 'Alibori'), ('BJ', 'BJA2', 'Atacora')
ON CONFLICT (country_code, code) DO NOTHING;

INSERT INTO cities (country_code, region_code, name, lat, lng) VALUES
  ('BJ', 'BJL', 'Cotonou', 6.3654, 2.4183),
  ('BJ', 'BJO', 'Porto-Novo', 6.4969, 2.6036),
  ('BJ', 'BJB', 'Parakou', 9.3378, 2.6302),
  ('BJ', 'BJA', 'Abomey-Calavi', 6.4391, 2.3558),
  ('BJ', 'BJB', 'N''Dali', 8.8633, 2.7267),
  ('BJ', 'BJK', 'Dassa-Zoumé', 7.7750, 2.1850),
  ('BJ', 'BJJ', 'Abomey', 7.1828, 1.9912),
  ('BJ', 'BJM', 'Lokossa', 6.6387, 1.7159),
  ('BJ', 'BJP', 'Pobè', 6.9743, 2.6777),
  ('BJ', 'BJC', 'Dogbo', 6.8084, 1.7870),
  ('BJ', 'BJD', 'Djougou', 9.7085, 1.6660),
  ('BJ', 'BJN', 'Kandi', 11.1342, 2.9386),
  ('BJ', 'BJA2', 'Natitingou', 10.3042, 1.3792),
  ('TG', NULL, 'Lomé', 6.1319, 1.2228),
  ('CI', NULL, 'Abidjan', 5.3599, -4.0083),
  ('SN', NULL, 'Dakar', 14.7167, -17.4677),
  ('BF', NULL, 'Ouagadougou', 12.3714, -1.5197),
  ('NE', NULL, 'Niamey', 13.5127, 2.1126),
  ('GN', NULL, 'Conakry', 9.6412, -13.5784)
ON CONFLICT (country_code, name) DO NOTHING;

-- ---------- SEEDS : MÉTHODES DE PAIEMENT PAR PAYS ----------
INSERT INTO payment_methods (code, name, name_fr, countries, params) VALUES
  ('MOBILE_MONEY', 'Mobile Money', 'Mobile Money', ARRAY['BJ','TG','CI','SN','BF','NE','GN'],
   '{"provider":true,"note":"MTN MoMo / Moov / Wave / Orange"}'::jsonb),
  ('CARD', 'Bank card', 'Carte bancaire', ARRAY['BJ','TG','CI','SN','BF','NE','GN'],
   '{"provider":true}'::jsonb),
  ('CASH', 'Cash', 'Espèces', ARRAY['BJ','TG','CI','SN','BF','NE','GN'],
   '{}'::jsonb),
  ('CAUTO_WALLET', 'C-AUTO Wallet', 'Portefeuille C-AUTO', ARRAY['BJ','TG','CI','SN','BF','NE','GN'],
   '{"internal":true}'::jsonb)
ON CONFLICT (code) DO UPDATE SET countries=EXCLUDED.countries, name=EXCLUDED.name, name_fr=EXCLUDED.name_fr;

-- ---------- SEEDS : configuration pays par défaut (module 45) ----------
INSERT INTO app_settings (key, value, type) VALUES
  ('country', 'BJ', 'text'),
  ('default_locale', 'fr', 'text')
ON CONFLICT (key) DO NOTHING;