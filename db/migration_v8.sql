-- migration_v8.sql — Modules Pièces, Fournisseurs, Flotte
-- 28. C-AUTO PIÈCES (catalogue / compatibilité / commandes)
-- 29. FOURNISSEUR (espace fournisseur)
-- 31. C-AUTO FLEET (parc / conducteurs / incidents / coûts / rapports)
-- + disponibilité pro pour 30. C-AUTO MOBILE

CREATE TYPE part_category AS ENUM ('OEM','PREMIUM','ALTERNATIVE');
CREATE TYPE part_order_status AS ENUM ('PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED');

-- Fournisseurs : un espace SUPPLIER= statut lié à un compte utilisateur
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pièces détachées
CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category part_category NOT NULL DEFAULT 'ALTERNATIVE',
  description TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  vin TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parts_ref ON parts(reference);
CREATE INDEX IF NOT EXISTS idx_parts_name ON parts(name);
CREATE INDEX IF NOT EXISTS idx_parts_supplier ON parts(supplier_id);

-- Compatibilité véhicules (contrôlée)
CREATE TABLE IF NOT EXISTS part_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INTEGER NOT NULL,
  year_to INTEGER NOT NULL,
  engine TEXT NOT NULL DEFAULT '',
  fuel_type TEXT NOT NULL DEFAULT '',
  UNIQUE (part_id, make, model, year_from, year_to)
);
CREATE INDEX IF NOT EXISTS idx_part_comp_lookup ON part_compatibility(make, model, year_from, year_to);

-- Commandes de pièces
CREATE TABLE IF NOT EXISTS part_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  part_id UUID REFERENCES parts(id) ON DELETE SET NULL,
  part_reference TEXT NOT NULL,
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status part_order_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_part_orders_user ON part_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_part_orders_supplier ON part_orders(supplier_id, status);

-- ===== FLOTTE =====
-- Conducteurs d'un parc (propriétaire = le compte client/fleet)
CREATE TABLE IF NOT EXISTS fleet_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_drivers_owner ON fleet_drivers(owner_id);

-- Affectation conducteur <-> véhicule du parc
CREATE TABLE IF NOT EXISTS fleet_vehicle_assignments (
  vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Incidents du parc
CREATE TABLE IF NOT EXISTS fleet_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'AUTRE',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_incidents_owner ON fleet_incidents(owner_id, occurred_at);

-- Coûts du parc
CREATE TABLE IF NOT EXISTS fleet_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'AUTRE',
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  description TEXT NOT NULL DEFAULT '',
  occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_costs_owner ON fleet_costs(owner_id, occurred_at);

-- Disponibilité pro (30. MOBILE)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;