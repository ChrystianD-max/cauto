-- =====================================================================
-- MODULE 75 — ARCHITECTURE MULTI-TENANT
-- CLIENT / GARAGE / ENTREPRISE / FOURNISSEUR avec isolation des données.
--   • tenants : entité top-level qui possède des utilisateurs (membres).
--   • tenant_memberships : qui appartient à quel tenant, avec un rôle
--     (OWNER = propriétaire, ADMIN = gestion des membres, MEMBER = accès).
--   • vehicles.tenant_id : véhicule possédé par un tenant ENTREPRISE
--     (flotte partagée entre plusieurs comptes) ; NULL = véhicule
--     individuel scopé par owner_id.
-- Backfill : les garages → tenants GARAGE, les fournisseurs → tenants
-- FOURNISSEUR, les comptes FLEET_MANAGER → tenants ENTREPRISE. Les
-- clients individuels restent scopés par owner_id (tenant CLIENT implicite
-- = compte propriétaire) — on ne crée pas un tenant par particulier.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE tenant_type AS ENUM ('CLIENT','GARAGE','ENTREPRISE','FOURNISSEUR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type tenant_type NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','ADMIN','MEMBER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id);

-- -------- BACKFILL GARAGES → tenants GARAGE --------
-- Un tenant GARAGE par garage. Le propriétaire du garage (garages.owner_id)
-- devient OWNER ; chaque professionnel rattaché au garage devient MEMBER.
DO $$
DECLARE g RECORD; t UUID;
BEGIN
  FOR g IN SELECT id, name, owner_id FROM garages LOOP
    INSERT INTO tenants (type, name) VALUES ('GARAGE', g.name) RETURNING id INTO t;
    IF g.owner_id IS NOT NULL THEN
      INSERT INTO tenant_memberships (tenant_id, user_id, role)
      VALUES (t, g.owner_id, 'OWNER') ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO tenant_memberships (tenant_id, user_id, role)
    SELECT t, p.user_id, 'MEMBER' FROM professionals p
    WHERE p.garage_id = g.id AND g.owner_id IS DISTINCT FROM p.user_id
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- -------- BACKFILL FOURNISSEURS → tenants FOURNISSEUR --------
DO $$
DECLARE s RECORD; t UUID;
BEGIN
  FOR s IN SELECT id, name, user_id FROM suppliers LOOP
    INSERT INTO tenants (type, name) VALUES ('FOURNISSEUR', s.name) RETURNING id INTO t;
    INSERT INTO tenant_memberships (tenant_id, user_id, role)
    VALUES (t, s.user_id, 'OWNER') ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- -------- BACKFILL ENTREPRISES → tenants ENTREPRISE --------
-- Un compte FLEET_MANAGER possède sa flotte : un tenant ENTREPRISE est créé
-- et ses véhicules (owner_id = compte) sont reliés au tenant pour une flotte
-- partagée entre les membres de l'entreprise.
DO $$
DECLARE u RECORD; t UUID;
BEGIN
  FOR u IN SELECT id, name FROM users WHERE role = 'FLEET_MANAGER' LOOP
    INSERT INTO tenants (type, name) VALUES ('ENTREPRISE', u.name) RETURNING id INTO t;
    INSERT INTO tenant_memberships (tenant_id, user_id, role)
    VALUES (t, u.id, 'OWNER') ON CONFLICT DO NOTHING;
    UPDATE vehicles SET tenant_id = t WHERE owner_id = u.id AND tenant_id IS NULL;
  END LOOP;
END $$;