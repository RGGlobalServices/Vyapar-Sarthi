-- ═══════════════════════════════════════════════════════════════════════════
--  Dispatch details printed on a Bada Udyog (mill) invoice: transport, vehicle no., station, E-Way bill no., GR/RR no., reverse charge,
--  salesman. One nullable jsonb column on sales; NULL on every existing row. Only mill bills ever write it.
--
--  DATA SAFETY: purely additive (ONE nullable column, no default, nothing existing touched; catalog-only, instant). Idempotent.
--  The app works without it (it checks the column first). To undo: ALTER TABLE sales DROP COLUMN dispatch_details;
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE sales ADD COLUMN IF NOT EXISTS dispatch_details jsonb;
