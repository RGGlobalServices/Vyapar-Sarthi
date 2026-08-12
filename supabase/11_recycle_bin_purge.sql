-- ═══════════════════════════════════════════════════════════════════════════
--  Recycle Bin auto-purge — adds a "has this record been warned about yet"
--  timestamp to deleted_records so the purge cron can never hard-delete a
--  row without a prior notification having gone out first.
--  Run this in Supabase → SQL Editor AFTER 10_all_shop_access.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE deleted_records ADD COLUMN IF NOT EXISTS purge_warned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_deleted_records_purge_warned_at ON deleted_records (purge_warned_at);
CREATE INDEX IF NOT EXISTS ix_deleted_records_restored_deleted ON deleted_records (restored_at, deleted_at);
