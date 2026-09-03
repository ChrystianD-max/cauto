-- Migration v6: Quote negotiation (remise), refusal reason, supplementary quote, SR↔intervention link
-- Flow: client refuses with reason + discount request -> pro grants discount (re-opens quote) or maintains price

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS intervention_id UUID REFERENCES interventions(id);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS refusal_reason TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS refusal_comment TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS request_discount BOOLEAN DEFAULT false;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_granted BOOLEAN;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_cents INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS original_total_cents INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pro_comment TEXT;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_complementary BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS complementary_message TEXT;