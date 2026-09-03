-- =====================================================================
-- MODULE 86 — STATUTS PIÈCES + SYNTHÈSE PROFILS
--   • enum part_status : DRAFT / PENDING / ACTIVE / REJECTED
--   • colonne status sur parts (défaut ACTIVE pour rétro-compat)
--   • colonne synthesis (JSONB) sur parts, professionals, suppliers
--     → agrégat structuré des informations pour revue admin
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE part_status AS ENUM ('DRAFT','PENDING','ACTIVE','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parts : ajout colonnes status + synthesis
ALTER TABLE parts ADD COLUMN IF NOT EXISTS status part_status NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE parts ADD COLUMN IF NOT EXISTS synthesis JSONB;

-- Professionals : ajout colonne synthesis
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS synthesis JSONB;

-- Suppliers : ajout colonne synthesis
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS synthesis JSONB;
