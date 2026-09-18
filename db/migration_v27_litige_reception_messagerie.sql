-- v27 144�?" Litige reception : resolution par le pro (resolution_kind
--       'REPAIR' = reparation materielle | 'COMPENSATION' = compensation
--       financiere plafonnee au solde restant = total - acompte, soit les
--       20 % restants), confirmation des DEUX cotes (pro + client) avant
--       cloture, escalade admin avec notification immediate + suivi et
--       resolution par l admin ; messagerie liee aux entites
--       (demande / devis / intervention). Migration appliquee par
--       db-migrate.js, idempotente (IF NOT EXISTS / IF NULL / checks).
--       ==========================================
--       > cartes tests : vue pro "-acompte", vue client, console admin
-- ===========================================================
-- 1) Devis refuse : autoriser sa re-emission par le pro apres un refus
--    du client. reissue_count = nombre de re-emissions (audit tracable).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reissue_count INT NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS last_pro_note TEXT;

-- 2) Litige reception : extensions
--    * resolution_kind  : 'REPAIR' (reparation du desordre) | 'COMPENSATION'
--                         (avance sur le solde = les 20 % restants)
--    * compensation_cents : plafonne au solde restant (total - acompte)
--    * confirmation des DEUX cotes (pro + client) avant cloture
--    * escalade admin : notification immediate + suivi + resolution admin
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS resolution_kind TEXT
    CHECK (resolution_kind IS NULL OR resolution_kind IN ('REPAIR', 'COMPENSATION'));
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS compensation_cents INT
    CHECK (compensation_cents IS NULL OR compensation_cents >= 0);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS compensation_note TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS pro_resolved_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS pro_confirmed_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS repair_intervention_id UUID
    REFERENCES interventions(id) ON DELETE SET NULL;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES users(id);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES users(id);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMPTZ;
