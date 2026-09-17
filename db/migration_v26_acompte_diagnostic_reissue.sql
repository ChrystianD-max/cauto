ALTER TABLE quotes ADD COLUMN IF NOT EXISTS acompte_percent NUMERIC(5,2) CHECK (acompte_percent BETWEEN 0 AND 100);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS acompte_note TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS acompte_cents INTEGER CHECK (acompte_cents >= 0);
