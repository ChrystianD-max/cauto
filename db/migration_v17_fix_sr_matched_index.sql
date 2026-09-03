-- v17 : idx_sr_matched (btree v4 sur JSONB `matched_professionals`) échoue dès que
-- la liste de pros candidats grossit : « index row size exceeds btree maximum »
-- -> 500 sur POST /api/service-requests/:id/match. Le champ n'est jamais filtré
-- en requête (uniquement écrit). On retire le btree inutilisable et on lui
-- substitue un GIN JSONB, sans limite de taille de ligne.

DROP INDEX IF EXISTS idx_sr_matched;
CREATE INDEX IF NOT EXISTS idx_sr_matched_gin ON service_requests USING gin (matched_professionals);