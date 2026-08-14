-- ═══════════════════════════════════════════════════════════════════════════
--  Selected Shops — narrows "All Shop Access" pooling to a subset of the
--  owner's shops instead of always every shop they own. Empty array (the
--  default) means "no explicit selection yet" and every pooled route treats
--  that the same as before this column existed: every owned shop.
--  Run this in Supabase → SQL Editor AFTER 12_collection_register.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_shop_ids TEXT[] DEFAULT '{}';
