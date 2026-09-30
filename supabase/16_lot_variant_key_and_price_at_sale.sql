-- ═══════════════════════════════════════════════════════════════════════════
--  Lot-wise stock by size/colour + the price a lot was actually sold at.
--
--  1. batches.variant_key          — which "Colour / Size" a lot was bought for
--                                     (NULL = the lot serves every variant, exactly as today).
--  2. sale_item_batches.price_at_sale — selling price per unit of that lot on that bill
--                                     (NULL on every existing row; used for lot-wise revenue/profit).
--
--  DATA SAFETY
--   • Purely additive: two NEW nullable columns, no default, no NOT NULL, no type changes, no index,
--     no UPDATE of existing rows. PostgreSQL adds such a column as a catalog-only change (instant, no table
--     rewrite, no long lock), and every existing row simply reads NULL.
--   • Idempotent (IF NOT EXISTS) — safe to run twice.
--   • lock_timeout: if some long transaction holds the table, this gives up after 5 s instead of queueing
--     behind it and blocking billing. Just run it again a minute later.
--   • The app works WITHOUT this migration (it checks that the columns exist before using them), so it can be
--     deployed before or after. Nothing is lost if it is never run.
--
--  To undo (only if ever needed; removes just these two empty-by-default columns):
--     ALTER TABLE batches DROP COLUMN IF EXISTS variant_key;
--     ALTER TABLE sale_item_batches DROP COLUMN IF EXISTS price_at_sale;
--
--  Run this in Supabase → SQL Editor AFTER 15_mrp_based_purchase_cost.sql
--  (Take the usual Supabase backup / point-in-time snapshot first if you want belt and braces.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE batches           ADD COLUMN IF NOT EXISTS variant_key    TEXT;
ALTER TABLE sale_item_batches ADD COLUMN IF NOT EXISTS price_at_sale  DOUBLE PRECISION;

COMMIT;
