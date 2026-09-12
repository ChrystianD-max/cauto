-- v25 — Réceptions illustrées + notification lues.
-- Permet d'attacher des photos d'inspection (extérieur / intérieur) à la fiche
-- de réception d'un véhicule, et de distinguer les notifications lues / non lues
-- (badge + marquage sans suppression, préparation du centre de notif cliquable).

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_photo_note text;

-- Distinction lu / non-lu : NULL = non lu.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_seen ON notifications(user_id, seen_at) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_entity_sr ON document_storage(entity_type, entity_id) WHERE entity_type = 'SERVICE_REQUEST';
