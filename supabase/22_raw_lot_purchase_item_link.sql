-- raw_material_lots.purchase_item_id → PurchaseItem link (mill purchase import extras)
ALTER TABLE raw_material_lots
  ADD COLUMN IF NOT EXISTS purchase_item_id uuid REFERENCES purchase_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS raw_material_lots_purchase_item_id_idx ON raw_material_lots(purchase_item_id);
