/* =============================================
   MIGRATION V4 — Professionals, Matching, Service Requests,
   Quotes v2, Repairs v2, QC, Warranties v2, Ratings v2, Disputes
   ============================================= */

-- ====== ENUMS ======

DO $$ BEGIN
  CREATE TYPE service_request_status AS ENUM (
    'CREATED','MATCHING','PROFESSIONAL_SELECTED','APPOINTMENT_CONFIRMED',
    'VEHICLE_RECEIVED','DIAGNOSIS','QUOTE_PENDING','QUOTE_SENT',
    'QUOTE_APPROVED','REPAIRING','QUALITY_CONTROL','COMPLETED',
    'PAID','WARRANTY_ACTIVE','CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE matching_profile_type AS ENUM (
    'STANDARD','DIAGNOSTIC','EMERGENCY','MAINTENANCE','MOBILE','SPECIALIST','FLEET'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status AS ENUM (
    'OPEN','IN_REVIEW','RESOLVED','ESCALATED','CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE additional_work_action AS ENUM (
    'PENDING','ACCEPTED','REFUSED','SECOND_OPINION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE professional_profile_type AS ENUM (
    'STANDARD','DIAGNOSTIC','EMERGENCY','MAINTENANCE','MOBILE','SPECIALIST','FLEET'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ====== EXTEND PROFESSIONALS ======

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}';
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS equipment JSONB DEFAULT '[]';
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS satisfaction_rate DOUBLE PRECISION DEFAULT 0;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS return_rate DOUBLE PRECISION DEFAULT 0;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS complaint_rate DOUBLE PRECISION DEFAULT 0;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS avg_delay_days INTEGER DEFAULT 3;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS profile_type professional_profile_type DEFAULT 'STANDARD';
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ====== PROFESSIONAL SERVICES ======

CREATE TABLE IF NOT EXISTS professional_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT,
  price_cents INTEGER,
  duration_minutes INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prof_services_prof ON professional_services(professional_id);

-- ====== PROFESSIONAL BRANDS ======

CREATE TABLE IF NOT EXISTS professional_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prof_brands_prof ON professional_brands(professional_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prof_brands_unique ON professional_brands(professional_id, brand);

-- ====== PROFESSIONAL CERTIFICATIONS ======

CREATE TABLE IF NOT EXISTS professional_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  obtained_at DATE,
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prof_certs_prof ON professional_certifications(professional_id);

-- ====== MATCHING PROFILES ======

CREATE TABLE IF NOT EXISTS matching_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name matching_profile_type NOT NULL UNIQUE,
  weight_brand DOUBLE PRECISION DEFAULT 0.15,
  weight_problem DOUBLE PRECISION DEFAULT 0.15,
  weight_quality DOUBLE PRECISION DEFAULT 0.20,
  weight_satisfaction DOUBLE PRECISION DEFAULT 0.20,
  weight_delay DOUBLE PRECISION DEFAULT 0.10,
  weight_price DOUBLE PRECISION DEFAULT 0.05,
  weight_distance DOUBLE PRECISION DEFAULT 0.15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====== SERVICE REQUESTS ======

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  professional_id UUID REFERENCES professionals(id),
  status service_request_status DEFAULT 'CREATED',
  problem_description TEXT NOT NULL,
  category TEXT,
  urgency TEXT DEFAULT 'NORMAL',
  preferred_date TIMESTAMPTZ,
  photos TEXT[] DEFAULT '{}',
  video_url TEXT,
  matched_professionals JSONB DEFAULT '[]',
  selected_professional_at TIMESTAMPTZ,
  diagnosis_notes TEXT,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sr_user ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_sr_vehicle ON service_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sr_professional ON service_requests(professional_id);
CREATE INDEX IF NOT EXISTS idx_sr_status ON service_requests(status);

-- ====== SERVICE REQUEST STATUS HISTORY ======

CREATE TABLE IF NOT EXISTS service_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  old_status service_request_status,
  new_status service_request_status NOT NULL,
  notes TEXT,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_srh_sr ON service_request_history(service_request_id);

-- ====== EXTEND QUOTES (additional columns) ======

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES service_requests(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delay_days INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS warranty_months INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- ====== QUOTE EVIDENCES ======

CREATE TABLE IF NOT EXISTS quote_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qe_quote ON quote_evidences(quote_id);

-- ====== EXTEND EXTRA_WORK_REQUESTS ======

ALTER TABLE extra_work_requests ADD COLUMN IF NOT EXISTS action additional_work_action DEFAULT 'PENDING';
ALTER TABLE extra_work_requests ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';
ALTER TABLE extra_work_requests ADD COLUMN IF NOT EXISTS videos TEXT[] DEFAULT '{}';
ALTER TABLE extra_work_requests ADD COLUMN IF NOT EXISTS customer_notes TEXT;
ALTER TABLE extra_work_requests ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id);

-- ====== EXTEND QUALITY_CHECKS ======

ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS odometer_km INTEGER;
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS replaced_parts JSONB DEFAULT '[]';
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS references_used JSONB DEFAULT '[]';
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS measures JSONB DEFAULT '{}';
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS codes_before TEXT[] DEFAULT '{}';
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS codes_after TEXT[] DEFAULT '{}';
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS road_test_ok BOOLEAN;
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS road_test_notes TEXT;
ALTER TABLE quality_checks ADD COLUMN IF NOT EXISTS result TEXT;

-- ====== EXTEND WARRANTIES ======

ALTER TABLE warranties ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES professionals(id);
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS covered_parts JSONB DEFAULT '[]';
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS odometer_km INTEGER;
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ====== EXTEND RATINGS ======

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_intervention_id_key;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES professionals(id);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES service_requests(id);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS quality_stars INTEGER CHECK (quality_stars BETWEEN 1 AND 5);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS delay_stars INTEGER CHECK (delay_stars BETWEEN 1 AND 5);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS communication_stars INTEGER CHECK (communication_stars BETWEEN 1 AND 5);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS price_stars INTEGER CHECK (price_stars BETWEEN 1 AND 5);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS transparency_stars INTEGER CHECK (transparency_stars BETWEEN 1 AND 5);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS overall_stars INTEGER CHECK (overall_stars BETWEEN 1 AND 5);

-- ====== DISPUTES ======

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID REFERENCES service_requests(id),
  intervention_id UUID REFERENCES interventions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  professional_id UUID REFERENCES professionals(id),
  status dispute_status DEFAULT 'OPEN',
  subject TEXT NOT NULL,
  description TEXT,
  quote_data JSONB,
  messages_data JSONB DEFAULT '[]',
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  invoices JSONB DEFAULT '[]',
  payments_data JSONB DEFAULT '[]',
  reports JSONB DEFAULT '[]',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_professional ON disputes(professional_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- ====== DISPUTE MESSAGES ======

CREATE TABLE IF NOT EXISTS dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  attachment_url TEXT,
  attachment_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_dispute ON dispute_messages(dispute_id);

-- ====== SECOND OPINIONS ======

CREATE TABLE IF NOT EXISTS second_opinions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  service_request_id UUID REFERENCES service_requests(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  status TEXT DEFAULT 'PENDING',
  diagnostic TEXT,
  first_quote_data JSONB,
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  dtc_codes TEXT[] DEFAULT '{}',
  symptoms TEXT,
  second_opinion_data JSONB,
  agreement_points JSONB DEFAULT '[]',
  divergence_points JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_so_user ON second_opinions(user_id);

-- ====== PROFESSIONAL AVAILABILITY ======

CREATE TABLE IF NOT EXISTS professional_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_appointments INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pa_prof ON professional_availability(professional_id);

-- ====== SEED DEFAULT MATCHING PROFILES ======

INSERT INTO matching_profiles (name, weight_brand, weight_problem, weight_quality, weight_satisfaction, weight_delay, weight_price, weight_distance)
VALUES
  ('STANDARD',    0.15, 0.15, 0.20, 0.20, 0.10, 0.05, 0.15),
  ('DIAGNOSTIC',  0.10, 0.25, 0.25, 0.20, 0.10, 0.05, 0.05),
  ('EMERGENCY',   0.05, 0.15, 0.15, 0.15, 0.30, 0.05, 0.15),
  ('MAINTENANCE', 0.20, 0.10, 0.15, 0.20, 0.15, 0.10, 0.10),
  ('MOBILE',      0.10, 0.10, 0.15, 0.15, 0.15, 0.10, 0.25),
  ('SPECIALIST',  0.25, 0.25, 0.20, 0.15, 0.05, 0.05, 0.05),
  ('FLEET',       0.10, 0.10, 0.15, 0.15, 0.20, 0.20, 0.10)
ON CONFLICT (name) DO NOTHING;

-- ====== SEED SAMPLE PROFESSIONALS ======

DO $$
DECLARE
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
  u1 UUID; u2 UUID; u3 UUID; u4 UUID; u5 UUID;
  g1 UUID; g2 UUID; g3 UUID;
BEGIN
  -- Create user accounts for professionals
  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES
    ('AutoPro Garage', 'pro.garage@cauto.local', '0145678900', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'GARAGE')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO u1;

  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES
    ('MecaExpert', 'pro.meca@cauto.local', '0145678901', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'GARAGE')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO u2;

  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES
    ('DiagPlus', 'pro.diag@cauto.local', '0145678902', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'GARAGE')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO u3;

  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES
    ('MobileMeca', 'pro.mobile@cauto.local', '0145678903', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'MECANICIEN')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO u4;

  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES
    ('SpecialisteBMW', 'pro.bmw@cauto.local', '0145678904', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'GARAGE')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO u5;

  -- Create garages
  INSERT INTO garages (name, city, address, owner_id)
  VALUES ('AutoPro Garage', 'Paris', '15 Rue de la Republique, 75011 Paris', u1)
  ON CONFLICT DO NOTHING RETURNING id INTO g1;
  IF g1 IS NULL THEN SELECT id INTO g1 FROM garages WHERE owner_id = u1; END IF;

  INSERT INTO garages (name, city, address, owner_id)
  VALUES ('MecaExpert', 'Lyon', '8 Avenue des Facteurs, 69007 Lyon', u2)
  ON CONFLICT DO NOTHING RETURNING id INTO g2;
  IF g2 IS NULL THEN SELECT id INTO g2 FROM garages WHERE owner_id = u2; END IF;

  INSERT INTO garages (name, city, address, owner_id)
  VALUES ('DiagPlus', 'Marseille', '22 Boulevard du Roi Rene, 13001 Marseille', u3)
  ON CONFLICT DO NOTHING RETURNING id INTO g3;
  IF g3 IS NULL THEN SELECT id INTO g3 FROM garages WHERE owner_id = u3; END IF;

  -- Create professional profiles
  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, logo_url, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES
    (u1, g1, 'Mecanique generale', 'Paris', 4.7, 128, '/img/pro-garage.svg', '0145678900', '15 Rue de la Republique, 75011 Paris', 48.8566, 2.3522, 15, 92.5, 35.0, 2.1, 3, 'STANDARD', '{"lundi":{"open":"08:00","close":"18:00"},"mardi":{"open":"08:00","close":"18:00"},"mercredi":{"open":"08:00","close":"18:00"},"jeudi":{"open":"08:00","close":"18:00"},"vendredi":{"open":"08:00","close":"17:00"}}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.7, rating_count = 128, profile_type = 'STANDARD'
  RETURNING id INTO p1;

  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, logo_url, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES
    (u2, g2, 'Mecanique generale et electrique', 'Lyon', 4.5, 89, '/img/pro-meca.svg', '0145678901', '8 Avenue des Facteurs, 69007 Lyon', 45.7578, 4.8320, 12, 88.0, 28.0, 3.5, 4, 'STANDARD', '{"lundi":{"open":"08:30","close":"18:00"},"mardi":{"open":"08:30","close":"18:00"},"mercredi":{"open":"08:30","close":"18:00"},"jeudi":{"open":"08:30","close":"18:00"},"vendredi":{"open":"08:30","close":"17:30"}}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.5, rating_count = 89, profile_type = 'STANDARD'
  RETURNING id INTO p2;

  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, logo_url, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES
    (u3, g3, 'Diagnostic electronique avance', 'Marseille', 4.8, 203, '/img/pro-diag.svg', '0145678902', '22 Boulevard du Roi Rene, 13001 Marseille', 43.2965, 5.3698, 20, 95.0, 40.0, 1.5, 2, 'DIAGNOSTIC', '{"lundi":{"open":"08:00","close":"19:00"},"mardi":{"open":"08:00","close":"19:00"},"mercredi":{"open":"08:00","close":"19:00"},"jeudi":{"open":"08:00","close":"19:00"},"vendredi":{"open":"08:00","close":"18:00"}}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.8, rating_count = 203, profile_type = 'DIAGNOSTIC'
  RETURNING id INTO p3;

  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, logo_url, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES
    (u4, NULL, 'Depannage mobile et mecanique', 'Paris', 4.3, 56, '/img/pro-mobile.svg', '0145678903', 'Deplacement a domicile', 48.8500, 2.3400, 8, 82.0, 20.0, 5.0, 1, 'MOBILE', '{"lundi":{"open":"07:00","close":"20:00"},"mardi":{"open":"07:00","close":"20:00"},"mercredi":{"open":"07:00","close":"20:00"},"jeudi":{"open":"07:00","close":"20:00"},"vendredi":{"open":"07:00","close":"20:00"},"samedi":{"open":"08:00","close":"14:00"}}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.3, rating_count = 56, profile_type = 'MOBILE'
  RETURNING id INTO p4;

  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, logo_url, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES
    (u5, NULL, 'Specialiste BMW et premium', 'Paris', 4.9, 312, '/img/pro-bmw.svg', '0145678904', '33 Avenue des Champs, 75008 Paris', 48.8700, 2.3100, 25, 97.0, 45.0, 0.8, 5, 'SPECIALIST', '{"lundi":{"open":"08:00","close":"18:00"},"mardi":{"open":"08:00","close":"18:00"},"mercredi":{"open":"08:00","close":"18:00"},"jeudi":{"open":"08:00","close":"18:00"},"vendredi":{"open":"08:00","close":"17:00"}}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.9, rating_count = 312, profile_type = 'SPECIALIST'
  RETURNING id INTO p5;

  -- Seed professional services
  INSERT INTO professional_services (professional_id, label, category, price_cents, duration_minutes, description) VALUES
    (p1, 'Revision complete', 'Entretien', 15000, 120, 'Revision complete selon constructeur'),
    (p1, 'Pneus - montage et equilibrage', 'Pneumatique', 8000, 60, 'Montage, equilibrage et parallélisme'),
    (p1, 'Freins - disques et plaquettes', 'Freinage', 12000, 90, 'Remplacement disques et plaquettes avant ou arriere'),
    (p2, 'Diagnostic electronique', 'Diagnostic', 6000, 30, 'Scan complet des calculateurs'),
    (p2, 'Reparation alternateur / demarreur', 'Electrique', 9000, 120, 'Replacement ou reparation'),
    (p3, 'Diagnostic avance OBD2', 'Diagnostic', 8000, 45, 'Analyse complete code defaut et oscilloscope'),
    (p3, 'Depannage calculateurs', 'Electrique', 25000, 180, 'Reprogrammation et reparation calculateurs'),
    (p4, 'Depannage sur place', 'Depannage', 7000, 60, 'Intervention a domicile du client'),
    (p4, 'Demarrage batterie', 'Depannage', 3500, 15, 'Demmarage d''urgence et diagnostic batterie'),
    (p5, 'Entretien BMW programme', 'Entretien', 22000, 150, 'Entretien complet selon programme BMW'),
    (p5, 'Diagnostic BMW ISTA', 'Diagnostic', 12000, 60, 'Diagnostic officiel BMW avec ISTA');

  -- Seed professional brands
  INSERT INTO professional_brands (professional_id, brand) VALUES
    (p1, 'Toyota'), (p1, 'Renault'), (p1, 'Peugeot'), (p1, 'Citroen'), (p1, 'Volkswagen'),
    (p2, 'Audi'), (p2, 'Volkswagen'), (p2, 'Seat'), (p2, 'Skoda'),
    (p3, 'Toutes marques'), (p3, 'BMW'), (p3, 'Mercedes'), (p3, 'Audi'),
    (p4, 'Toutes marques'),
    (p5, 'BMW'), (p5, 'Mercedes'), (p5, 'Audi'), (p5, 'Porsche');

  -- Seed professional certifications
  INSERT INTO professional_certifications (professional_id, name, issuer, obtained_at) VALUES
    (p1, 'Certification Qualibat', 'Qualibat', '2019-03-15'),
    (p1, 'Certification professionnelle mecanique', 'AFPA', '2015-06-20'),
    (p2, 'Certification VAG', 'Volkswagen Group', '2020-09-10'),
    (p3, 'Certification Bosch Diagnostics', 'Bosch', '2018-01-25'),
    (p3, 'Certification Lexia / Diagbox', 'Citroen', '2017-11-12'),
    (p5, 'BMW Certified Technician', 'BMW AG', '2021-05-01'),
    (p5, 'ISTA Certified', 'BMW AG', '2022-02-15');

  -- Seed availability for each professional
  FOR i IN 0..4 LOOP
    IF p1 IS NOT NULL THEN
      INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
      VALUES (p1, i, '08:00', '18:00', 6) ON CONFLICT DO NOTHING;
    END IF;
    IF p2 IS NOT NULL THEN
      INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
      VALUES (p2, i, '08:30', '18:00', 5) ON CONFLICT DO NOTHING;
    END IF;
    IF p3 IS NOT NULL THEN
      INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
      VALUES (p3, i, '08:00', '19:00', 8) ON CONFLICT DO NOTHING;
    END IF;
    IF p5 IS NOT NULL THEN
      INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
      VALUES (p5, i, '08:00', '18:00', 4) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Saturday for mobile
  IF p4 IS NOT NULL THEN
    INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
    VALUES (p4, 0, '07:00', '20:00', 10),
           (p4, 1, '07:00', '20:00', 10),
           (p4, 2, '07:00', '20:00', 10),
           (p4, 3, '07:00', '20:00', 10),
           (p4, 4, '07:00', '20:00', 10),
           (p4, 5, '08:00', '14:00', 5)
    ON CONFLICT DO NOTHING;
  END IF;

END $$;
