-- ═══════════════════════════════════════════════════════════════════════════
--  How a ready product of a production run was packed.
--
--  One row per pack size of one output: "50 bags of 30 kg", "10 gonis of 50 kg". An output with no rows is "not packed yet" (it
--  shows in Milling -> Not packed, where the packing can be added later). Stock stays in kg; this only records the packs.
--
--  DATA SAFETY: ONE new table, nothing existing is touched. Rows are removed automatically with their output / run (ON DELETE CASCADE),
--  so deleting or undoing a production run cleans them. Idempotent (IF NOT EXISTS). The app works without it (it checks the table first).
--  To undo: DROP TABLE production_output_packs;
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS production_output_packs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL,
  batch_id    uuid NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  output_id   uuid NOT NULL REFERENCES production_outputs(id) ON DELETE CASCADE,
  pack_kg     double precision NOT NULL CHECK (pack_kg > 0),
  packs       integer NOT NULL CHECK (packs > 0),
  pack_type   varchar NOT NULL DEFAULT 'bag',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_output_packs_output ON production_output_packs (output_id);
CREATE INDEX IF NOT EXISTS idx_output_packs_shop_batch ON production_output_packs (shop_id, batch_id);
