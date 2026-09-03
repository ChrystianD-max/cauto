-- Migration: Ajout colonnes étendues vehicles + DiagnosticService
-- Exécuter après init.sql

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS generation TEXT DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_name TEXT DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS displacement_cc INTEGER DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'ESSENCE';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS gearbox TEXT DEFAULT 'MANUELLE';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS transmission TEXT DEFAULT 'TWD';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS first_registration DATE DEFAULT NULL;

-- Table diagnostic_sessions pour l'IA
CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  symptom_text TEXT NOT NULL DEFAULT '',
  symptom_photos TEXT[] DEFAULT '{}',
  symptom_video_url TEXT DEFAULT '',
  symptom_audio_url TEXT DEFAULT '',
  dtc_codes TEXT[] DEFAULT '{}',
  result_comprehension TEXT DEFAULT '',
  result_hypotheses JSONB DEFAULT '[]',
  result_causes JSONB DEFAULT '[]',
  result_controls JSONB DEFAULT '[]',
  result_urgency TEXT DEFAULT 'BASSE',
  result_confidence TEXT DEFAULT 'FAIBLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diag_vehicle ON diagnostic_sessions(vehicle_id);
