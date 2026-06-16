-- ═══════════════════════════════════════════════════════════════════════════
--  Godowns + Multi-Shop support
--  Run this in Supabase → SQL Editor AFTER 05_new_features.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Shop Code column (unique human-readable ID per shop) ────────────────
ALTER TABLE shops ADD COLUMN IF NOT EXISTS shop_code VARCHAR UNIQUE;

-- Back-fill existing shops with auto-generated codes
UPDATE shops
SET shop_code = UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE shop_code IS NULL;

-- ─── 2. Godowns table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.godowns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL,
  name         VARCHAR NOT NULL,
  location     VARCHAR,
  godown_code  VARCHAR NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS godowns_shop_id_idx  ON public.godowns(shop_id);
CREATE INDEX IF NOT EXISTS godowns_owner_id_idx ON public.godowns(owner_id);

-- ─── 3. Godown Products (per-godown inventory) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.godown_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  godown_id   UUID NOT NULL REFERENCES public.godowns(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity    FLOAT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(godown_id, product_id)
);

CREATE INDEX IF NOT EXISTS godown_products_godown_idx  ON public.godown_products(godown_id);
CREATE INDEX IF NOT EXISTS godown_products_product_idx ON public.godown_products(product_id);
