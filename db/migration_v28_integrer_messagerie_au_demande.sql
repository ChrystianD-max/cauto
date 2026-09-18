-- =============================================================================
-- MIGRATION v28 - Module 74/75 : la messagerie est desormais LIEe A LA DEMANDE.
--
-- Auparavant, une conversation (chat pro<->client) etait un objet transverse :
-- aucune colonne ne la rattachait a une demande de reparation / service_request.
-- Resultat chez l'utilisateur : la messagerie n'apparaissait PAS dans le detail
-- de la demande (il fallait aller dans l'onglet "Messagerie" a part).
--
-- v28 corrige le modele : conversations.service_request_id -> service_requests.
-- Le GET /api/chat/conversations?service_request_id=<uuid> peut alors renvoyer
-- uniquement la/les conversation(s) de CETTE demande, et le frontend (detail
-- demande) affiche un acces messagerie directement dans la demande.
--
-- Idempotente (IF NOT EXISTS) ; executee au boot Render par db/migrations.js.
-- =============================================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conv_service_request
  ON conversations(service_request_id);

COMMENT ON COLUMN conversations.service_request_id IS
  'Lien optionnel de la conversation vers la demande de reparation (electron 74/75) : permet de faire apparaitre la messagerie dans le detail de la demande et non plus seulement dans un onglet separe.';