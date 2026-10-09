-- ═══════════════════════════════════════════════════════════════════════════
--  Broker who arranged a purchase (Bada Udyog), saved on the bill itself — same reasoning as sales.dispatch_details
--  (20_sale_dispatch_details.sql): a commission_entries row only exists once an amount is typed in, but the broker's
--  name must stay discoverable on the bill even when no commission was ever logged for it.
--
--  DATA SAFETY: purely additive (ONE nullable column, no default, nothing existing touched; catalog-only, instant). Idempotent.
--  The app works without it (it checks the column first). To undo: ALTER TABLE purchase_invoices DROP COLUMN broker_name;
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS broker_name VARCHAR;
