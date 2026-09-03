-- ====== MODULE 57 : PERFORMANCE — INDEX PAGINATION / JOINTURES CHAUDES ======

-- Carnet véhicule : tri descendant paginé (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_history_vehicle_time ON history_entries(vehicle_id, created_at DESC);

-- Service_requests -> intervention (approbation devis, mise à jour statut)
CREATE INDEX IF NOT EXISTS idx_sr_intervention ON service_requests(intervention_id);

-- Interventions : listes par véhicule / par professionnel / filtres statut
CREATE INDEX IF NOT EXISTS idx_interventions_vehicle ON interventions(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_pro ON interventions(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);

-- Diagnostics d'un véhicule triés par date (complète idx_diag_vehicle v2)
CREATE INDEX IF NOT EXISTS idx_diag_vehicle_time ON diagnostic_sessions(vehicle_id, created_at DESC);

-- User roles : lookup par user_id (complète idx_user_roles_role v10)
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);