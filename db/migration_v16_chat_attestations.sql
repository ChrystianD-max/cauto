-- =============================================================================
-- MIGRATION v16 — Modules 61/62 : messagerie interne, VIN à la réception,
-- attestations des professionnels/fournisseurs, passeports.
-- -----------------------------------------------------------------------------
-- 1. VIN : plus obligatoire à la création d'un véhicule (le professionnel le
--    saisit à la réception). La contrainte UNIQUE reste (NULL autorisé en PG).
-- =============================================================================

ALTER TABLE vehicles ALTER COLUMN vin DROP NOT NULL;

-- =============================================================================
-- 2. Messagerie interne C-AUTO (chat tous rôles).
--    La table `messages` (migration v10) est réutilisée avec message_type='CHAT'.
--    Les conversations gèrent les dernières lectures par membre (last_read_at)
--    pour le comptage de non-lus (direct ET groupes).
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL DEFAULT 'DIRECT' CHECK (kind IN ('DIRECT', 'GROUP')),
  title       TEXT NOT NULL DEFAULT '',
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);

-- =============================================================================
-- 3. Attestations professionnels : documents (ids) fournis au moment de
--    l'inscription / de la mise à jour du profil — l'admin vérifie le compte.
--    Le badge de certification (is_certified) reste DÉCERNÉ PAR L'ADMIN,
--    distinct de la vérification du compte (verification_status).
-- =============================================================================
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS attestation_doc_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Fournisseurs : même mécanique + statut de vérification explicite.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS attestation_doc_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED'));