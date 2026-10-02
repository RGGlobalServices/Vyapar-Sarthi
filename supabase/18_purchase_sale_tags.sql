-- ═══════════════════════════════════════════════════════════════════════════
--  Purchase / Sale tag + bill link on the mill's hamali (expenses), freight and broker commission rows.
--    direction            'purchase' | 'sale'   (NULL = older row, not tagged)
--    purchase_invoice_id  the purchase bill the row belongs to (no FK on purpose: deleting a bill must not touch the row)
--    challan_id           the sale (delivery challan) the row belongs to (no FK, same reason)
--
--  DATA SAFETY: purely additive — nullable columns on 3 tables, no defaults, no type changes, no existing
--  column touched (catalog-only, instant). Idempotent (IF NOT EXISTS). The app works without it (checks the columns first).
--  Older rows are tagged only where it is certain (see part 2); everything else stays NULL.
--  To undo: ALTER TABLE <t> DROP COLUMN direction, DROP COLUMN purchase_invoice_id, DROP COLUMN challan_id;
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE freight_entries    ADD COLUMN IF NOT EXISTS direction varchar, ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid;  -- (freight_entries already has challan_id)
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS direction varchar, ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid, ADD COLUMN IF NOT EXISTS challan_id uuid;
ALTER TABLE expenses           ADD COLUMN IF NOT EXISTS direction varchar, ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid, ADD COLUMN IF NOT EXISTS challan_id uuid;

-- Part 2: tag older rows only where the existing data says so for certain.
-- freight: a row linked to a challan is a sale freight; a row linked to an inward gate entry is a purchase freight.
UPDATE freight_entries SET direction = 'sale' WHERE direction IS NULL AND challan_id IS NOT NULL;
UPDATE freight_entries f SET direction = 'purchase' FROM gate_entries g WHERE f.direction IS NULL AND f.gate_entry_id = g.id AND g.direction = 'inward';
UPDATE freight_entries f SET direction = 'sale' FROM gate_entries g WHERE f.direction IS NULL AND f.gate_entry_id = g.id AND g.direction = 'outward';
-- broker commission: the note already carries the kind
UPDATE commission_entries SET direction = 'purchase' WHERE direction IS NULL AND note LIKE '[Supplier broker]%';
UPDATE commission_entries SET direction = 'sale'     WHERE direction IS NULL AND note LIKE '[Customer broker]%';
