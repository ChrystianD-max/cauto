-- Seed v3 : Codes défaut DTC + Programmes constructeur

-- SYSTÈMES DTC
INSERT INTO fault_code_systems (code_prefix, name, description) VALUES
  ('P', 'Powertrain (Moteur & Boîte)', 'Codes liés au moteur, transmission, embrayage et systèmes d''émission'),
  ('C', 'Châssis', 'Codes liés au freinage, direction, suspension et ABS'),
  ('B', 'Body (Carrosserie)', 'Codes liés à l''habitacle, sécurité passive, climatisation'),
  ('U', 'Réseau (Communication)', 'Codes liés aux bus CAN, LIN et modules communication')
ON CONFLICT (code_prefix) DO NOTHING;

-- P0100
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'P0100', fcs.id, 'Débitmètre d''air (MAF) - Signal hors plage', 'MOYENNE',
  'Le capteur de débit d''air massique envoie un signal hors des valeurs attendues par le calculateur moteur.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'P' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Capteur MAF défaillant', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'P0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Fuite d''air post-débitmètre', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'P0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Faisceau ou connecteur endommagé', 'BASSE', 3 FROM fault_codes fc WHERE fc.code = 'P0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Vérifier visuellement le capteur MAF', 'Inspection du capteur et de son connecteur', 1 FROM fault_codes fc WHERE fc.code = 'P0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Mesurer la tension du signal MAF', 'Multimètre sur la broche signal', 2 FROM fault_codes fc WHERE fc.code = 'P0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Contrôler les fuites d''air d''admission', 'Vérifier les durites entre débitmètre et corps d''admission', 3 FROM fault_codes fc WHERE fc.code = 'P0100' ON CONFLICT DO NOTHING;

-- P0170
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'P0170', fcs.id, 'Richesse moteur - Correction hors plage', 'MOYENNE',
  'Le calculateur ne parvient pas à maintenir le mélange air/carburant optimal.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'P' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Sonde lambda (O2) défaillante', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'P0170' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Fuite d''air dans le système d''admission', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'P0170' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Injecteur bouché ou fuyard', 'MOYENNE', 3 FROM fault_codes fc WHERE fc.code = 'P0170' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Vérifier les données sonde lambda', 'Lecture temps réel des sons O2 en richesse/pauvreté', 1 FROM fault_codes fc WHERE fc.code = 'P0170' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Test d''étanchéité admission', 'Pressurisation du circuit d''admission', 2 FROM fault_codes fc WHERE fc.code = 'P0170' ON CONFLICT DO NOTHING;

-- P0301
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'P0301', fcs.id, 'Raté d''allumage - Cylindre 1', 'ELEVEE',
  'Le capteur de vilebrequin détecte une irrégularité de vitesse au cylindre 1.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'P' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Bougie d''allumage défectueuse', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Bobine d''allumage défaillante', 'ELEVEE', 2 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Injecteur bouché', 'MOYENNE', 3 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Compression basse cylindre 1', 'BASSE', 4 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'État des bougies', 'Retirer et inspecter la bougie du cylindre 1', 1 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Test de compression', 'Mesurer la compression du cylindre 1', 2 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Croiser bobines entre cylindres', 'Intervertir la bobine 1 avec un autre cylindre', 3 FROM fault_codes fc WHERE fc.code = 'P0301' ON CONFLICT DO NOTHING;

-- P0400
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'P0400', fcs.id, 'Débit EGR (Recirculation gaz d''échappement) Anormal', 'MOYENNE',
  'Le système de recirculation des gaz d''échappement ne fonctionne pas correctement.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'P' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'EGR colmaté par les suies', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'P0400' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Electrovanne EGR défaillante', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'P0400' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Inspection visuelle de la vanne EGR', 'Vérifier l''état de la vanne et des conduits', 1 FROM fault_codes fc WHERE fc.code = 'P0400' ON CONFLICT DO NOTHING;

-- P0500
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'P0500', fcs.id, 'Capteur de vitesse véhicule - Signal absent', 'BASSE',
  'Le calculateur ne reçoit pas le signal de vitesse du capteur correspondant.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'P' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Capteur de vitesse défaillant', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'P0500' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Faisceau endommagé', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'P0500' ON CONFLICT DO NOTHING;

-- P0700
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'P0700', fcs.id, 'Demande d''activation du témoin MIL par le TCM', 'MOYENNE',
  'Le module de contrôle de la transmission demande l''allumage du voyant moteur.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'P' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'DTC en mémoire du TCM', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'P0700' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Lire les codes TCM spécifiques', 'Scanner le module de transmission pour les DTC détaillés', 1 FROM fault_codes fc WHERE fc.code = 'P0700' ON CONFLICT DO NOTHING;

-- C0035
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'C0035', fcs.id, 'Capteur de vitesse ABS roue avant gauche - Signal absent', 'ELEVEE',
  'Le module ABS ne reçoit pas le signal du capteur de vitesse sur la roue avant gauche.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'C' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Capteur ABS défaillant', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'C0035' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Lentille magnétique encrassée', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'C0035' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Faisceau ou connecteur endommagé', 'MOYENNE', 3 FROM fault_codes fc WHERE fc.code = 'C0035' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Nettoyer la lentille du capteur', 'Déposer le capteur et nettoyer la surface magnétique', 1 FROM fault_codes fc WHERE fc.code = 'C0035' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Mesurer la résistance du capteur', 'Vérifier la résistance entre les broches du connecteur', 2 FROM fault_codes fc WHERE fc.code = 'C0035' ON CONFLICT DO NOTHING;

-- B0001
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'B0001', fcs.id, 'Circuit Airbag Conducteur - Résistance excessive', 'CRITIQUE',
  'Le circuit du coussin gonflable de l''airbag conducteur présente une résistance anormalement élevée.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'B' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Connecteur de rochet sous le volant déconnecté', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'B0001' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Spiral clock (racleur) défectueux', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'B0001' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Vérifier le connecteur sous le volant', 'Inspecter la connexion du connecteur jaune', 1 FROM fault_codes fc WHERE fc.code = 'B0001' ON CONFLICT DO NOTHING;

-- U0100
INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
SELECT 'U0100', fcs.id, 'Perte de communication avec le calculateur moteur (ECM/PCM)', 'ELEVEE',
  'Un ou plusieurs modules ne parviennent pas à communiquer avec le calculateur moteur via le bus CAN.'
FROM fault_code_systems fcs WHERE fcs.code_prefix = 'U' ON CONFLICT (code) DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Câble CAN endommagé ou coupé', 'ELEVEE', 1 FROM fault_codes fc WHERE fc.code = 'U0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_causes (fault_code_id, label, probability, sort_order)
SELECT fc.id, 'Masse défectueuse du calculateur', 'MOYENNE', 2 FROM fault_codes fc WHERE fc.code = 'U0100' ON CONFLICT DO NOTHING;
INSERT INTO fault_code_tests (fault_code_id, label, description, sort_order)
SELECT fc.id, 'Mesurer les résistances bus CAN', 'Vérifier la résistance entre CAN-H et CAN-L (60 ohms attendu)', 1 FROM fault_codes fc WHERE fc.code = 'U0100' ON CONFLICT DO NOTHING;

-- MANUFACTURIERS
INSERT INTO manufacturers (name, country, logo_url) VALUES
  ('Toyota', 'Japon', ''),
  ('Renault', 'France', ''),
  ('Peugeot', 'France', ''),
  ('Volkswagen', 'Allemagne', ''),
  ('Mercedes-Benz', 'Allemagne', ''),
  ('BMW', 'Allemagne', ''),
  ('Ford', 'États-Unis', ''),
  ('Hyundai', 'Corée du Sud', '')
ON CONFLICT (name) DO NOTHING;

-- MODÈLES
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'Corolla', 'BERLINE', 1966, 2026 FROM manufacturers m WHERE m.name = 'Toyota' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'Land Cruiser Prado', 'SUV', 1984, 2026 FROM manufacturers m WHERE m.name = 'Toyota' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'RAV4', 'SUV', 1994, 2026 FROM manufacturers m WHERE m.name = 'Toyota' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'Clio', 'CITADINE', 1990, 2026 FROM manufacturers m WHERE m.name = 'Renault' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'Megane', 'BERLINE', 1995, 2026 FROM manufacturers m WHERE m.name = 'Renault' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, '208', 'CITADINE', 2012, 2026 FROM manufacturers m WHERE m.name = 'Peugeot' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, '308', 'BERLINE', 2007, 2026 FROM manufacturers m WHERE m.name = 'Peugeot' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'Golf', 'BERLINE', 1974, 2026 FROM manufacturers m WHERE m.name = 'Volkswagen' ON CONFLICT (manufacturer_id, name) DO NOTHING;
INSERT INTO vehicle_models (manufacturer_id, name, category, first_year, last_year)
SELECT m.id, 'Tiguan', 'SUV', 2007, 2026 FROM manufacturers m WHERE m.name = 'Volkswagen' ON CONFLICT (manufacturer_id, name) DO NOTHING;

-- GÉNÉRATIONS
INSERT INTO vehicle_generations (model_id, name, start_year, end_year)
SELECT vm.id, 'Prado 150', 2009, 2024 FROM vehicle_models vm JOIN manufacturers m ON m.id = vm.manufacturer_id WHERE m.name = 'Toyota' AND vm.name = 'Land Cruiser Prado' ON CONFLICT (model_id, name) DO NOTHING;
INSERT INTO vehicle_generations (model_id, name, start_year, end_year)
SELECT vm.id, 'Corolla E210', 2018, 2026 FROM vehicle_models vm JOIN manufacturers m ON m.id = vm.manufacturer_id WHERE m.name = 'Toyota' AND vm.name = 'Corolla' ON CONFLICT (model_id, name) DO NOTHING;
INSERT INTO vehicle_generations (model_id, name, start_year, end_year)
SELECT vm.id, 'RAV4 XA50', 2018, 2026 FROM vehicle_models vm JOIN manufacturers m ON m.id = vm.manufacturer_id WHERE m.name = 'Toyota' AND vm.name = 'RAV4' ON CONFLICT (model_id, name) DO NOTHING;

-- MOTEURS
INSERT INTO engines (generation_id, name, displacement_cc, fuel_type, power_hp, code)
SELECT vg.id, '2.8L Turbo Diesel', 2800, 'DIESEL', 204, '1GD-FTV'
FROM vehicle_generations vg JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'Land Cruiser Prado' AND vg.name = 'Prado 150' ON CONFLICT (generation_id, name) DO NOTHING;
INSERT INTO engines (generation_id, name, displacement_cc, fuel_type, power_hp, code)
SELECT vg.id, '2.0L Hybrid', 2000, 'HYBRIDE', 222, 'A25A-FXS'
FROM vehicle_generations vg JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'Corolla' AND vg.name = 'Corolla E210' ON CONFLICT (generation_id, name) DO NOTHING;
INSERT INTO engines (generation_id, name, displacement_cc, fuel_type, power_hp, code)
SELECT vg.id, '2.0L Essence', 2000, 'ESSENCE', 180, 'M20A-FKS'
FROM vehicle_generations vg JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'Corolla' AND vg.name = 'Corolla E210' ON CONFLICT (generation_id, name) DO NOTHING;
INSERT INTO engines (generation_id, name, displacement_cc, fuel_type, power_hp, code)
SELECT vg.id, '2.5L Hybrid', 2500, 'HYBRIDE', 218, 'A25A-FXS'
FROM vehicle_generations vg JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'RAV4' AND vg.name = 'RAV4 XA50' ON CONFLICT (generation_id, name) DO NOTHING;

-- PROGRAMMES CONSTRUCTEUR
INSERT INTO maintenance_programs (engine_id, manufacturer_id, name, description)
SELECT e.id, m.id, 'Programme Toyota Prado 150 - 2.8L D-4D',
  'Programme d''entretien selon les préconisations Toyota pour le Land Cruiser Prado 150 2.8L Turbo Diesel'
FROM engines e JOIN vehicle_generations vg ON vg.id = e.generation_id JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'Land Cruiser Prado' AND e.code = '1GD-FTV' ON CONFLICT DO NOTHING;

INSERT INTO maintenance_programs (engine_id, manufacturer_id, name, description)
SELECT e.id, m.id, 'Programme Toyota Corolla E210',
  'Programme d''entretien selon les préconisations Toyota pour la Corolla E210'
FROM engines e JOIN vehicle_generations vg ON vg.id = e.generation_id JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'Corolla' AND vg.name = 'Corolla E210' ON CONFLICT DO NOTHING;

INSERT INTO maintenance_programs (engine_id, manufacturer_id, name, description)
SELECT e.id, m.id, 'Programme Toyota RAV4 XA50',
  'Programme d''entretien selon les préconisations Toyota pour le RAV4 XA50'
FROM engines e JOIN vehicle_generations vg ON vg.id = e.generation_id JOIN vehicle_models vm ON vm.id = vg.model_id JOIN manufacturers m ON m.id = vm.manufacturer_id
WHERE m.name = 'Toyota' AND vm.name = 'RAV4' AND vg.name = 'RAV4 XA50' ON CONFLICT DO NOTHING;

-- VERSIONS
INSERT INTO maintenance_program_versions (program_id, version, effective_date, notes)
SELECT mp.id, 1, '2024-01-01', 'Version initiale du programme constructeur'
FROM maintenance_programs mp ON CONFLICT (program_id, version) DO NOTHING;

-- INTERVALLES Prado 150
INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order)
SELECT mpv.id, 'Révision 10 000 km', 10000, 12, 1
FROM maintenance_programs mp JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order)
SELECT mpv.id, 'Révision 20 000 km', 20000, 24, 2
FROM maintenance_programs mp JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order)
SELECT mpv.id, 'Révision 40 000 km', 40000, 48, 3
FROM maintenance_programs mp JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order)
SELECT mpv.id, 'Révision 60 000 km', 60000, 72, 4
FROM maintenance_programs mp JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order)
SELECT mpv.id, 'Révision 80 000 km', 80000, 96, 5
FROM maintenance_programs mp JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order)
SELECT mpv.id, 'Grande révision 100 000 km', 100000, 120, 6
FROM maintenance_programs mp JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;

-- OPÉRATIONS 10 000 km
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Vidange moteur + filtre à huile', 'Remplacer l''huile moteur et le filtre à huile', FALSE, 1 FROM maintenance_intervals mi WHERE mi.label = 'Révision 10 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Contrôle niveau liquide de frein', 'Vérifier le niveau et l''état du liquide', TRUE, 2 FROM maintenance_intervals mi WHERE mi.label = 'Révision 10 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Contrôle pression des pneus', 'Vérifier et ajuster la pression', TRUE, 3 FROM maintenance_intervals mi WHERE mi.label = 'Révision 10 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Contrôle usure plaquettes de frein', 'Mesurer l''épaisseur des plaquettes AV et AR', TRUE, 4 FROM maintenance_intervals mi WHERE mi.label = 'Révision 10 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Rotation des pneus', 'Permuter les pneus AV et AR', FALSE, 5 FROM maintenance_intervals mi WHERE mi.label = 'Révision 10 000 km' ON CONFLICT DO NOTHING;

-- OPÉRATIONS 20 000 km
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Vidange moteur + filtre à huile', 'Remplacer l''huile moteur et le filtre', FALSE, 1 FROM maintenance_intervals mi WHERE mi.label = 'Révision 20 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement filtre à air', 'Remplacer le filtre d''air du moteur', FALSE, 2 FROM maintenance_intervals mi WHERE mi.label = 'Révision 20 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement filtre habitacle', 'Remplacer le filtre d''air de l''habitacle (pollen)', FALSE, 3 FROM maintenance_intervals mi WHERE mi.label = 'Révision 20 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Contrôle liquide de refroidissement', 'Vérifier le niveau et la concentration', TRUE, 4 FROM maintenance_intervals mi WHERE mi.label = 'Révision 20 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Contrôle courroies accessoires', 'Inspecter l''état des courroies', TRUE, 5 FROM maintenance_intervals mi WHERE mi.label = 'Révision 20 000 km' ON CONFLICT DO NOTHING;

-- OPÉRATIONS 40 000 km
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement liquide de frein', 'Purger et remplacer le liquide de frein', FALSE, 1 FROM maintenance_intervals mi WHERE mi.label = 'Révision 40 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Vidange boîte de vitesses', 'Vidanger l''huile de boîte', FALSE, 2 FROM maintenance_intervals mi WHERE mi.label = 'Révision 40 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Contrôle disques de frein', 'Mesurer l''épaisseur des disques', TRUE, 3 FROM maintenance_intervals mi WHERE mi.label = 'Révision 40 000 km' ON CONFLICT DO NOTHING;

-- OPÉRATIONS 60 000 km
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement bougies d''allumage', 'Remplacer les bougies selon préconisation', FALSE, 1 FROM maintenance_intervals mi WHERE mi.label = 'Révision 60 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement liquide de refroidissement', 'Vider, rincer et remplir le circuit', FALSE, 2 FROM maintenance_intervals mi WHERE mi.label = 'Révision 60 000 km' ON CONFLICT DO NOTHING;

-- OPÉRATIONS 80 000 km
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement pompe à eau', 'Remplacer la pompe à eau', FALSE, 1 FROM maintenance_intervals mi WHERE mi.label = 'Révision 80 000 km' ON CONFLICT DO NOTHING;

-- OPÉRATIONS 100 000 km
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement courroie de distribution', 'Courroie de distribution et galets tendeurs', FALSE, 1 FROM maintenance_intervals mi WHERE mi.label = 'Grande révision 100 000 km' ON CONFLICT DO NOTHING;
INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order)
SELECT mi.id, 'Remplacement kit distribution complet', 'Kit courroie, galets tendeurs, pompe à eau', FALSE, 2 FROM maintenance_intervals mi WHERE mi.label = 'Grande révision 100 000 km' ON CONFLICT DO NOTHING;

-- SOURCES
INSERT INTO maintenance_sources (program_id, title, url, document_ref, retrieved_at)
SELECT mp.id, 'Toyota Owner''s Manual - Land Cruiser Prado 150',
  'https://www.toyota.com/owners/parts-service/maintenance', 'TM-2024-PRADO150', '2024-01-15'
FROM maintenance_programs mp WHERE mp.name LIKE '%Prado 150%' ON CONFLICT DO NOTHING;
