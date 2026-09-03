-- SEED V4: Professionals and related data
-- Uses existing user accounts created via API or migration

DO $$
DECLARE
  u1 UUID; u2 UUID; u3 UUID; u4 UUID; u5 UUID;
  g1 UUID; g2 UUID; g3 UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
BEGIN
  SELECT id INTO u1 FROM users WHERE email = 'pro.garage@cauto.local';
  SELECT id INTO u2 FROM users WHERE email = 'pro.meca@cauto.local';
  SELECT id INTO u3 FROM users WHERE email = 'pro.diag@cauto.local';
  SELECT id INTO u4 FROM users WHERE email = 'pro.mobile@cauto.local';
  SELECT id INTO u5 FROM users WHERE email = 'pro.bmw@cauto.local';

  IF u1 IS NULL OR u2 IS NULL OR u3 IS NULL OR u4 IS NULL OR u5 IS NULL THEN
    RAISE NOTICE 'Some pro users missing, skipping seed';
    RETURN;
  END IF;

  INSERT INTO garages (name, city, address, owner_id)
  VALUES ('AutoPro Garage', 'Paris', '15 Rue de la Republique 75011 Paris', u1)
  ON CONFLICT DO NOTHING RETURNING id INTO g1;
  IF g1 IS NULL THEN SELECT id INTO g1 FROM garages WHERE owner_id = u1 LIMIT 1; END IF;

  INSERT INTO garages (name, city, address, owner_id)
  VALUES ('MecaExpert', 'Lyon', '8 Avenue des Facteurs 69007 Lyon', u2)
  ON CONFLICT DO NOTHING RETURNING id INTO g2;
  IF g2 IS NULL THEN SELECT id INTO g2 FROM garages WHERE owner_id = u2 LIMIT 1; END IF;

  INSERT INTO garages (name, city, address, owner_id)
  VALUES ('DiagPlus', 'Marseille', '22 Boulevard du Roi Rene 13001 Marseille', u3)
  ON CONFLICT DO NOTHING RETURNING id INTO g3;
  IF g3 IS NULL THEN SELECT id INTO g3 FROM garages WHERE owner_id = u3 LIMIT 1; END IF;

  -- Professional 1: AutoPro Garage
  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES (u1, g1, 'Mecanique generale', 'Paris', 4.7, 128, '0145678900', '15 Rue de la Republique 75011 Paris', 48.8566, 2.3522, 15, 92.5, 35.0, 2.1, 3, 'STANDARD', '{"lundi":"08:00-18:00","mardi":"08:00-18:00","mercredi":"08:00-18:00","jeudi":"08:00-18:00","vendredi":"08:00-17:00"}')
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.7, rating_count = 128, profile_type = 'STANDARD', city = 'Paris'
  RETURNING id INTO p1;

  -- Professional 2: MecaExpert
  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES (u2, g2, 'Mecanique generale et electrique', 'Lyon', 4.5, 89, '0145678901', '8 Avenue des Facteurs 69007 Lyon', 45.7578, 4.8320, 12, 88.0, 28.0, 3.5, 4, 'STANDARD', '{"lundi":"08:30-18:00","mardi":"08:30-18:00","mercredi":"08:30-18:00","jeudi":"08:30-18:00","vendredi":"08:30-17:30"}')
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.5, rating_count = 89, profile_type = 'STANDARD', city = 'Lyon'
  RETURNING id INTO p2;

  -- Professional 3: DiagPlus
  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES (u3, g3, 'Diagnostic electronique avance', 'Marseille', 4.8, 203, '0145678902', '22 Boulevard du Roi Rene 13001 Marseille', 43.2965, 5.3698, 20, 95.0, 40.0, 1.5, 2, 'DIAGNOSTIC', '{"lundi":"08:00-19:00","mardi":"08:00-19:00","mercredi":"08:00-19:00","jeudi":"08:00-19:00","vendredi":"08:00-18:00"}')
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.8, rating_count = 203, profile_type = 'DIAGNOSTIC', city = 'Marseille'
  RETURNING id INTO p3;

  -- Professional 4: MobileMeca
  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES (u4, NULL, 'Depannage mobile et mecanique', 'Paris', 4.3, 56, '0145678903', 'Deplacement a domicile', 48.8500, 2.3400, 8, 82.0, 20.0, 5.0, 1, 'MOBILE', '{"lundi":"07:00-20:00","mardi":"07:00-20:00","mercredi":"07:00-20:00","jeudi":"07:00-20:00","vendredi":"07:00-20:00","samedi":"08:00-14:00"}')
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.3, rating_count = 56, profile_type = 'MOBILE', city = 'Paris'
  RETURNING id INTO p4;

  -- Professional 5: SpecialisteBMW
  INSERT INTO professionals (user_id, garage_id, specialty, city, rating, rating_count, phone, address, latitude, longitude, experience_years, satisfaction_rate, return_rate, complaint_rate, avg_delay_days, profile_type, opening_hours)
  VALUES (u5, NULL, 'Specialiste BMW et premium', 'Paris', 4.9, 312, '0145678904', '33 Avenue des Champs 75008 Paris', 48.8700, 2.3100, 25, 97.0, 45.0, 0.8, 5, 'SPECIALIST', '{"lundi":"08:00-18:00","mardi":"08:00-18:00","mercredi":"08:00-18:00","jeudi":"08:00-18:00","vendredi":"08:00-17:00"}')
  ON CONFLICT (user_id) DO UPDATE SET rating = 4.9, rating_count = 312, profile_type = 'SPECIALIST', city = 'Paris'
  RETURNING id INTO p5;

  -- Services
  INSERT INTO professional_services (professional_id, label, category, price_cents, duration_minutes, description) VALUES
    (p1, 'Revision complete', 'Entretien', 15000, 120, 'Revision complete selon constructeur'),
    (p1, 'Pneus - montage et equilibrage', 'Pneumatique', 8000, 60, 'Montage, equilibrage et parallelsime'),
    (p1, 'Freins - disques et plaquettes', 'Freinage', 12000, 90, 'Remplacement disques et plaquettes'),
    (p2, 'Diagnostic electronique', 'Diagnostic', 6000, 30, 'Scan complet des calculateurs'),
    (p2, 'Reparation alternateur / demarreur', 'Electrique', 9000, 120, 'Replacement ou reparation'),
    (p3, 'Diagnostic avance OBD2', 'Diagnostic', 8000, 45, 'Analyse complete code defaut et oscilloscope'),
    (p3, 'Depannage calculateurs', 'Electrique', 25000, 180, 'Reprogrammation et reparation calculateurs'),
    (p4, 'Depannage sur place', 'Depannage', 7000, 60, 'Intervention a domicile du client'),
    (p4, 'Demarrage batterie', 'Depannage', 3500, 15, 'Demmarage d urgence et diagnostic batterie'),
    (p5, 'Entretien BMW programme', 'Entretien', 22000, 150, 'Entretien complet selon programme BMW'),
    (p5, 'Diagnostic BMW ISTA', 'Diagnostic', 12000, 60, 'Diagnostic officiel BMW avec ISTA');

  -- Brands
  INSERT INTO professional_brands (professional_id, brand) VALUES
    (p1, 'Toyota'), (p1, 'Renault'), (p1, 'Peugeot'), (p1, 'Citroen'), (p1, 'Volkswagen'),
    (p2, 'Audi'), (p2, 'Volkswagen'), (p2, 'Seat'), (p2, 'Skoda'),
    (p3, 'Toutes marques'), (p3, 'BMW'), (p3, 'Mercedes'), (p3, 'Audi'),
    (p4, 'Toutes marques'),
    (p5, 'BMW'), (p5, 'Mercedes'), (p5, 'Audi'), (p5, 'Porsche')
  ON CONFLICT (professional_id, brand) DO NOTHING;

  -- Certifications
  INSERT INTO professional_certifications (professional_id, name, issuer, obtained_at) VALUES
    (p1, 'Certification Qualibat', 'Qualibat', '2019-03-15'),
    (p1, 'Certification professionnelle mecanique', 'AFPA', '2015-06-20'),
    (p2, 'Certification VAG', 'Volkswagen Group', '2020-09-10'),
    (p3, 'Certification Bosch Diagnostics', 'Bosch', '2018-01-25'),
    (p3, 'Certification Lexia / Diagbox', 'Citroen', '2017-11-12'),
    (p5, 'BMW Certified Technician', 'BMW AG', '2021-05-01'),
    (p5, 'ISTA Certified', 'BMW AG', '2022-02-15');

  -- Availability: weekdays for all
  INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
  SELECT p1, d, '08:00'::time, '18:00'::time, 6 FROM generate_series(0,4) d
  ON CONFLICT DO NOTHING;

  INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
  SELECT p2, d, '08:30'::time, '18:00'::time, 5 FROM generate_series(0,4) d
  ON CONFLICT DO NOTHING;

  INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
  SELECT p3, d, '08:00'::time, '19:00'::time, 8 FROM generate_series(0,4) d
  ON CONFLICT DO NOTHING;

  INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
  SELECT p4, d, '07:00'::time, '20:00'::time, 10 FROM generate_series(0,4) d
  ON CONFLICT DO NOTHING;

  INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
  VALUES (p4, 5, '08:00'::time, '14:00'::time, 5)
  ON CONFLICT DO NOTHING;

  INSERT INTO professional_availability (professional_id, day_of_week, start_time, end_time, max_appointments)
  SELECT p5, d, '08:00'::time, '18:00'::time, 4 FROM generate_series(0,4) d
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seed v4 complete: 5 professionals, services, brands, certifications, availability';

END $$;
