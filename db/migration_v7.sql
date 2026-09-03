-- migration_v7.sql — Nouvelle étape "validation client de la réception"
-- Le contrôle qualité validé place l'intervention en CLIENT_VALIDATION ;
-- le client doit confirmer la bonne réception du véhicule avant la clôture.

ALTER TYPE intervention_status ADD VALUE IF NOT EXISTS 'CLIENT_VALIDATION' AFTER 'QUALITY_CHECK';