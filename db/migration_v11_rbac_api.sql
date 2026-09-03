-- =====================================================================
-- MODULE 35 : RBAC
-- Nouveaux rôles : LIVREUR, FLEET_MANAGER, SUPER_ADMIN (FOURNISSEUR = SUPPLIER).
-- Permissions contrôlées côté backend uniquement (jamais le frontend).
-- =====================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LIVREUR';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'FLEET_MANAGER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

INSERT INTO roles (code, name, description) VALUES
  ('EMPLOYEE', 'Employe', 'Employe de plateforme'),            -- réservé pour rappel (non exposé)
  ('LIVREUR', 'Livreur', 'Livraison de pièces au client'),
  ('FLEET_MANAGER', 'Gestionnaire de flotte', 'Pilote la flotte véhicules'),
  ('SUPER_ADMIN', 'Super administrateur', 'Accès total à la plateforme')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, module, description) VALUES
  ('fleet.manage', 'fleet', 'Gérer la flotte et les conducteurs'),
  ('supplier.deliver', 'supplier', 'Gérer les livraisons'),
  ('users.roles.assign', 'admin', 'Assigner des rôles aux utilisateurs')
ON CONFLICT (code) DO NOTHING;

-- Effectifs: qui a quoi (contrôles côté backend via user_roles/role_permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('ADMIN', 'SUPER_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('client.vehicles.manage', 'client.sr.manage')
WHERE r.code IN ('CLIENT', 'GARAGE', 'MECANICIEN', 'FLEET_MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('pro.sr.manage', 'client.sr.manage', 'client.vehicles.manage')
WHERE r.code IN ('GARAGE', 'MECANICIEN', 'EXPERT')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('supplier.catalog.manage', 'supplier.deliver')
WHERE r.code = 'SUPPLIER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code = 'supplier.deliver'
WHERE r.code = 'LIVREUR'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('fleet.manage', 'client.vehicles.manage', 'client.sr.manage')
WHERE r.code = 'FLEET_MANAGER'
ON CONFLICT DO NOTHING;

-- Compte SUPER_ADMIN de démonstration (même mot de passe que l'admin principal)
INSERT INTO users (name, email, phone, password_hash, role, status)
SELECT 'Super Admin', 'superadmin@cauto.local', phone, password_hash, 'SUPER_ADMIN', 'ACTIVE'
FROM users WHERE email = 'admin@cauto.local'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'superadmin@cauto.local');

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code = u.role::text
WHERE u.email = 'superadmin@cauto.local'
ON CONFLICT DO NOTHING;

-- Lier les rôles existants aux comptes (idempotent)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code = u.role::text
ON CONFLICT DO NOTHING;

SELECT 'MIGRATION_V11_OK' AS status;