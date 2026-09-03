-- =====================================================================
-- MODULE 37/38/39 : services paiement, GPS, notifications
-- Portefeuilles C-AUTO, agrégats de livraison de notifications,
-- consentement GPS + sessions de suivi, colonne method sur payments.
-- =====================================================================

-- ---- 37. Méthode de paiement sur les paiements existants -------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method text;
UPDATE payments SET method = 'CARD' WHERE method IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments (method);

-- ---- 37. Portefeuille C-AUTO (CAUTO_WALLET) --------------------------
CREATE TABLE IF NOT EXISTS cauto_wallets (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---- 39. Traçabilité des livraisons / fallback de notifications -------
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         text NOT NULL,
  status          text NOT NULL DEFAULT 'ATTEMPTED',
  attempt         smallint NOT NULL DEFAULT 1,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_user ON notification_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_notif ON notification_deliveries (notification_id);

-- ---- 38. Consentement GPS + sessions de suivi -------------------------
CREATE TABLE IF NOT EXISTS gps_consents (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  consent     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS gps_tracking_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id    uuid REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  started_by   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interval_sec integer NOT NULL DEFAULT 30,
  status       text NOT NULL DEFAULT 'ACTIVE',
  started_at   timestamptz NOT NULL DEFAULT now(),
  stopped_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gps_sessions_vehicle_status ON gps_tracking_sessions (vehicle_id, status);

-- ---- 38. Bonus : zones de service couvertes (dashboard géo) -----------
-- (la table service_zones existe déjà ; on s'assure de l'index de recherche)
CREATE INDEX IF NOT EXISTS idx_service_zones_country ON service_zones (country, is_active);

-- ---- Portefeuilles initiaux (client de test pré-financé pour e2e) ----
INSERT INTO cauto_wallets (user_id, balance_cents)
SELECT u.id, CASE WHEN u.email = 'client.test@cauto.local' THEN 50000 ELSE 0 END
FROM users u
ON CONFLICT (user_id) DO NOTHING;

SELECT 'MIGRATION_V12_OK' AS status;