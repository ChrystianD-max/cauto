-- v18 : Image de pièce (fournisseur) + supports médias du chat.
--   - `parts.image_doc_id` : photo de la pièce publiée (document_storage, visibilité
--     publique pour l'affichage dans le catalogue) ;
--   - la messagerie n'a pas besoin de nouvelle colonne : `messages.attachments`
--     (jsonb), `messages.read_at` et `messages.delivered_at` existent déjà (v10).

ALTER TABLE parts ADD COLUMN IF NOT EXISTS image_doc_id UUID REFERENCES document_storage(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_parts_image ON parts(image_doc_id);