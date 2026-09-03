-- Migration v3 : Codes Défaut + Programmes Constructeur
-- Exécuter après migration_v2.sql

-- ====== CODES DÉFAUT (DTC) ======

CREATE TABLE IF NOT EXISTS fault_code_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_prefix TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fault_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  system_id UUID REFERENCES fault_code_systems(id),
  interpretation TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'MOYENNE',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fault_code_lookup ON fault_codes(code);

CREATE TABLE IF NOT EXISTS fault_code_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_code_id UUID NOT NULL REFERENCES fault_codes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  probability TEXT DEFAULT 'MOYENNE',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fault_code_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_code_id UUID NOT NULL REFERENCES fault_codes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ====== PROGRAMMES CONSTRUCTEUR ======

CREATE TABLE IF NOT EXISTS manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vehicle_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'BERLINE',
  first_year INTEGER,
  last_year INTEGER,
  UNIQUE(manufacturer_id, name)
);

CREATE TABLE IF NOT EXISTS vehicle_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES vehicle_models(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_year INTEGER,
  end_year INTEGER,
  UNIQUE(model_id, name)
);

CREATE TABLE IF NOT EXISTS engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES vehicle_generations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  displacement_cc INTEGER DEFAULT 0,
  fuel_type TEXT DEFAULT 'ESSENCE',
  power_hp INTEGER DEFAULT 0,
  code TEXT DEFAULT '',
  UNIQUE(generation_id, name)
);

CREATE TABLE IF NOT EXISTS maintenance_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id UUID REFERENCES engines(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id),
  name TEXT NOT NULL DEFAULT 'Programme standard',
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_program_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES maintenance_programs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  effective_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(program_id, version)
);

CREATE TABLE IF NOT EXISTS maintenance_intervals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_version_id UUID NOT NULL REFERENCES maintenance_program_versions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  interval_km INTEGER NOT NULL,
  interval_months INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interval_id UUID NOT NULL REFERENCES maintenance_intervals(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_check_only BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interval_id UUID NOT NULL REFERENCES maintenance_intervals(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  result_type TEXT NOT NULL DEFAULT 'OK_KO',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES maintenance_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  document_ref TEXT NOT NULL DEFAULT '',
  retrieved_at DATE
);
