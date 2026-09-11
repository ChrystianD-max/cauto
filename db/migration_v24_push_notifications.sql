-- Module 67 — Notifications push navigateur (Web Push / VAPID).
-- push_subscriptions   : appareils abonnés d'un utilisateur (endpoint unique).
-- push_outbox          : file d'attente alimentée par un trigger sur
--                        notifications ; drainée par le serveur (WebPushService).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS push_outbox (
  id BIGSERIAL PRIMARY KEY,
  notification_id UUID,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'C-AUTO',
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/app',
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON push_outbox(status, id) WHERE status = 'PENDING';

-- Trigger : chaque nouvelle notification (canal CHAT C-AUTO) met la ligne en
-- file push dès que l'utilisateur possède au moins un abonnement actif.
CREATE OR REPLACE FUNCTION enqueue_push() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.user_id) THEN
    INSERT INTO push_outbox (notification_id, user_id, body)
    VALUES (NEW.id, NEW.user_id, NEW.message);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notifications_push ON notifications;
CREATE TRIGGER trg_notifications_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enqueue_push();