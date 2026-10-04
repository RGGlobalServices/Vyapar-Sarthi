-- FSSAI license number on shops and customers (mill + food businesses)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS fssai VARCHAR;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS fssai VARCHAR;
