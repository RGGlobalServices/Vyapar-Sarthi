-- ═══════════════════════════════════════════════════════════════════════════
--  All Shop Access — owner-level preference to pool read-only data (Products,
--  Stock, Dashboard, select Reports, Udhar) across every shop they own.
--  Run this in Supabase → SQL Editor AFTER 09_wholesale_inventory.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS all_shop_access BOOLEAN DEFAULT false;
