-- ═══════════════════════════════════════════════════════════════════════════
--  Product Location — free-text shelf/rack/bin locator so shopkeepers,
--  wholesalers, and distributors can note WHERE a product physically sits.
--  Distinct from the Godown feature (a whole warehouse, Udyog-only) — this is
--  a lightweight descriptive field on the product itself, available to every
--  business tier.
--  Run this in Supabase → SQL Editor AFTER 13_selected_shop_ids.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS location VARCHAR;
