-- ═══════════════════════════════════════════════════════════════════════════
--  Quality / Lab flag limits per shop (Bada Udyog): the amber / red % for moisture, foreign matter, broken, damaged.
--  One small NEW table; no existing table is touched. A shop with no row uses the built-in defaults.
--
--  DATA SAFETY: purely additive, idempotent. The app works without it (it checks the table first).
--  To undo: DROP TABLE quality_thresholds;
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS quality_thresholds (
  shop_id    uuid PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  config     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
