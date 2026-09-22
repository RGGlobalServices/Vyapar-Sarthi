-- Additive only: creates ONE new table. No existing table/column is altered or dropped.
CREATE TABLE IF NOT EXISTS production_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE NO ACTION,
  name VARCHAR NOT NULL,
  output_type VARCHAR NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  unit VARCHAR NOT NULL DEFAULT 'kg',
  quantity_kg DOUBLE PRECISION NOT NULL,
  output_lot_number VARCHAR,
  notes VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS production_outputs_shop_id_idx ON production_outputs(shop_id);
CREATE INDEX IF NOT EXISTS production_outputs_batch_id_idx ON production_outputs(batch_id);
CREATE INDEX IF NOT EXISTS production_outputs_product_id_idx ON production_outputs(product_id);
