-- ═══════════════════════════════════════════════════════════════════════════
--  MRP-Based Purchase Cost — Cost Price can be derived as MRP × (1 − Purchase
--  Discount %) instead of always typed manually. Product carries the CURRENT
--  mode + default discount % (used live in Add/Edit Product); each
--  PurchaseItem line locks in its OWN mrp + discount_percent at the time of
--  that purchase, alongside the existing `cost` — never rewritten afterward,
--  so a later change to a product's MRP or default discount % never alters a
--  past purchase's recorded numbers.
--  Run this in Supabase → SQL Editor AFTER 14_product_location.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_mode VARCHAR DEFAULT 'manual';
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_discount_percent FLOAT;

ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS mrp FLOAT;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS discount_percent FLOAT;
