-- FSSAI licence number on suppliers (Bada Udyog: the mill's grain / product suppliers). Nullable, additive.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS fssai VARCHAR;
