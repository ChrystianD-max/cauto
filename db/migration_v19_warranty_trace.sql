-- Module 73-74 — GARANTIE (liens complets + anti-modification silencieuse)
--            et TRAÇABILITÉ (journal de réparation immutable).
--
-- Module 73 : la garantie doit être liée à repair_order, professional, vehicle,
--             parts, dates, conditions, et être NON mutable (append-only).
-- Module 74 : pour chaque réparation, un enregistrement immutable couvrant
--             QUI/QUOI/QUAND/VÉHICULE/KILOMÉTRAGE/PIÈCE/RÉFÉRENCE/PRIX/RÉSULTAT/GARANTIE.

-- ===== Module 73 : enrichissement de la table warranties =====
ALTER TABLE warranties
  ADD COLUMN IF NOT EXISTS repair_order_id UUID REFERENCES repair_orders(id),
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Backfill AVANT l'immutabilité : véhicule et professional depuis l'intervention.
UPDATE warranties w
SET vehicle_id = i.vehicle_id
FROM interventions i
WHERE w.intervention_id = i.id AND w.vehicle_id IS NULL;

UPDATE warranties w
SET professional_id = i.professional_id
FROM interventions i
WHERE w.intervention_id = i.id AND w.professional_id IS NULL;

-- Immuabilité : une garantie ne peut JAMAIS être modifiée ou supprimée en
-- silence. Toute correction doit passer par une nouvelle entrée.
DROP TRIGGER IF EXISTS trg_warranty_immutable ON warranties;
CREATE TRIGGER trg_warranty_immutable
  BEFORE UPDATE OR DELETE ON warranties
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ===== Module 74 : journal de traçabilité des réparations =====
CREATE TABLE IF NOT EXISTS repair_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id UUID REFERENCES repair_orders(id),
  intervention_id UUID NOT NULL REFERENCES interventions(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  professional_id UUID REFERENCES professionals(id),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  odometer_km INTEGER,
  part_label TEXT,
  part_reference TEXT,
  part_qty NUMERIC(10,2),
  unit_price_cents INTEGER,
  total_price_cents INTEGER,
  result TEXT,
  warranty_id UUID REFERENCES warranties(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repair_trace_vehicle ON repair_trace(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_repair_trace_intervention ON repair_trace(intervention_id);
CREATE INDEX IF NOT EXISTS idx_repair_trace_repair_order ON repair_trace(repair_order_id);

-- Immuabilité du journal de traçabilité (append-only, écriture seule).
DROP TRIGGER IF EXISTS trg_repair_trace_immutable ON repair_trace;
CREATE TRIGGER trg_repair_trace_immutable
  BEFORE UPDATE OR DELETE ON repair_trace
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();