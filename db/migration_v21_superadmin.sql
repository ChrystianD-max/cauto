-- =====================================================================
-- MODULE 76 : ADMIN SUPER ADMIN
-- Permissions super_admin.*, table integrations, seed rôles/permissions.
-- Idempotent. Rôle : -- MIGRATION_V21_OK
-- =====================================================================

-- ===== 1. PERMISSIONS SUPER_ADMIN =====
INSERT INTO permissions (code, module, description) VALUES
  ('super_admin.manage_admins',    'admin', 'Gérer les comptes administrateurs'),
  ('super_admin.manage_permissions', 'admin', 'Gérer les rôles et permissions'),
  ('super_admin.critical_settings', 'admin', 'Modifier les paramètres critiques de la plateforme'),
  ('super_admin.manage_countries', 'geo', 'Gérer les pays, régions et villes'),
  ('super_admin.manage_currencies', 'geo', 'Gérer les devises'),
  ('super_admin.manage_integrations', 'admin', 'Gérer les intégrations externes'),
  ('super_admin.view_audit',       'admin', 'Consulter les logs d''audit enrichis')
ON CONFLICT (code) DO NOTHING;

-- ===== 2. ATTRIBUER TOUTES LES PERMISSIONS À SUPER_ADMIN =====
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON true
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- ===== 3. TABLE INTEGRATIONS =====
CREATE TABLE IF NOT EXISTS integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('SMS','PAYMENT','AI','STORAGE','GPS','EMAIL','MAP','OTHER')),
  config      JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 4. SEEDS : PARAMÈTRES CRITIQUES (clés marquées comme critiques) =====
INSERT INTO app_settings (key, value, type) VALUES
  ('fees.commission_rate', '10.0', 'number'),
  ('fees.verification_enabled', 'true', 'boolean'),
  ('security.otp_enabled', 'true', 'boolean'),
  ('security.session_timeout_hours', '2', 'number'),
  ('platform.maintenance_mode', 'false', 'boolean')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, type=EXCLUDED.type;

-- ===== 5. SEEDS : INTÉGRATIONS DE BASE =====
INSERT INTO integrations (code, name, type, config, is_active) VALUES
  ('sms_provider',  'Fournisseur SMS',   'SMS',   '{"provider":"demo","api_url":""}'::jsonb, false),
  ('payment_gateway', 'Passerelle paiement', 'PAYMENT', '{"provider":"demo","api_url":""}'::jsonb, false),
  ('ai_engine',     'Moteur IA',         'AI',    '{"provider":"rules"}'::jsonb, true),
  ('storage_backend', 'Stockage objet',  'STORAGE', '{"mode":"auto"}'::jsonb, true),
  ('gps_tracker',   'Suivi GPS',         'GPS',   '{"provider":"demo"}'::jsonb, false),
  ('email_provider', 'Fournisseur email', 'EMAIL', '{"provider":"demo","api_url":""}'::jsonb, false)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, config=EXCLUDED.config;

SELECT 'MIGRATION_V21_OK' AS status;
