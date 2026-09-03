-- ============================================================
-- v15 : INDEX COMPOSITES POUR LES LISTES ORDONNÉES (PERF)
-- "Mes demandes" (client) et files de travail (pro) trient par created_at DESC.
-- Un index composite évite le tri complet + le retour à la table.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sr_user_created
  ON service_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sr_professional_created
  ON service_requests(professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_vehicle_created
  ON history_entries(vehicle_id, created_at DESC);