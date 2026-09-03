-- Migration v5: Reception workflow for pros
-- Status flow: PROFESSIONAL_SELECTED -> PRO_ACCEPTED/PRO_REFUSED -> VEHICLE_RECEIVED -> RECEPTION_VALIDATED -> DIAGNOSIS

-- Add new statuses to enum
ALTER TYPE service_request_status ADD VALUE IF NOT EXISTS 'PRO_ACCEPTED';
ALTER TYPE service_request_status ADD VALUE IF NOT EXISTS 'PRO_REFUSED';
ALTER TYPE service_request_status ADD VALUE IF NOT EXISTS 'RECEPTION_VALIDATED';

-- Add reception columns
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_vin VARCHAR(20);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_mileage INTEGER;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_fuel_level VARCHAR(20) DEFAULT 'MOYEN';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_exterior VARCHAR(500);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_interior VARCHAR(500);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_observations TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_keys_provided BOOLEAN DEFAULT true;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_submitted_at TIMESTAMPTZ;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reception_validated_at TIMESTAMPTZ;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS refuse_reason TEXT;
