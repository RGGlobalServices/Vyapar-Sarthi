-- ═══════════════════════════════════════════════════════════════════════════
--  Permanent link: production batch -> Job Work order.
--
--  Until now a batch was tied to its Job Work order only by the order number written in the batch notes
--  ("Job Work: JW-20261001-001 (...)"). This adds a real column, so a customer's profile / the order itself can show every
--  batch made from their grain (WIP, rejected, reprocessed, by-products, waste) even if the notes are edited.
--
--  DATA SAFETY
--   • Purely additive: ONE new nullable column + one index on production_batches. No default, no NOT NULL, no type
--     changes, no existing column touched. PostgreSQL adds such a column as a catalog-only change (instant, no table
--     rewrite); every existing row simply reads NULL.
--   • Part 2 fills the new column for EXISTING job-work batches (only where it is still NULL, only from the exact order
--     number found in the batch's own notes, only within the same shop). It changes nothing but this new column.
--   • Idempotent (IF NOT EXISTS / WHERE ... IS NULL) — safe to run twice.
--   • lock_timeout: gives up after 5 s instead of queueing behind a long transaction. Just run it again a minute later.
--   • The app works WITHOUT this migration (it checks the column exists before using it; the notes link keeps working),
--     so it can be deployed before or after.
--
--  To undo (removes only this new column; nothing else changes):
--     DROP INDEX IF EXISTS idx_production_batches_job_work_order_id;
--     ALTER TABLE production_batches DROP COLUMN IF EXISTS job_work_order_id;
--
--  Run in Supabase -> SQL Editor AFTER 16_lot_variant_key_and_price_at_sale.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Part 1: the column
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS job_work_order_id UUID REFERENCES job_work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_batches_job_work_order_id ON production_batches (job_work_order_id);
COMMIT;

-- Part 2: link existing job-work batches (new column only; same shop only; exact order number from the batch's own notes)
UPDATE production_batches b
   SET job_work_order_id = j.id
  FROM job_work_orders j
 WHERE b.job_work_order_id IS NULL
   AND b.shop_id = j.shop_id
   AND b.batch_type = 'JOB_WORK'
   AND b.notes LIKE 'Job Work: ' || j.order_number || ' %';
