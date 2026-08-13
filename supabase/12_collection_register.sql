-- ═══════════════════════════════════════════════════════════════════════════
--  Collection Register (Udyog) — a named, dated sheet grouping many
--  party-payment rows collected in one round (e.g. a distributor's daily
--  rounds). Each row is a real payment against a Customer (customerType
--  'party') the moment it's saved; the sheet's draft/finalized status is
--  just a bookkeeping seal, not a gate on whether the payment posted.
--  Run this in Supabase → SQL Editor AFTER 11_recycle_bin_purge.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Collection Sheets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collection_sheets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name          VARCHAR NOT NULL,
  date          DATE NOT NULL,
  status        VARCHAR NOT NULL DEFAULT 'draft',
  finalized_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_collection_sheets_shop_id     ON public.collection_sheets(shop_id);
CREATE INDEX IF NOT EXISTS ix_collection_sheets_shop_status ON public.collection_sheets(shop_id, status);
CREATE INDEX IF NOT EXISTS ix_collection_sheets_shop_date   ON public.collection_sheets(shop_id, date);

-- ─── 2. Collection Entries (one per party row within a sheet) ───────────────
CREATE TABLE IF NOT EXISTS public.collection_entries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id                 UUID NOT NULL REFERENCES public.collection_sheets(id) ON DELETE CASCADE,
  customer_id              UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount                   DOUBLE PRECISION NOT NULL,
  payment_mode             VARCHAR NOT NULL,
  note                     VARCHAR,
  -- Set once this row has posted a real payment (customer_transactions.id) —
  -- present for every row in normal use; only null in the narrow window
  -- between inserting the entry and the payment call succeeding.
  customer_transaction_id  UUID,
  sequence                 SERIAL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_collection_entries_sheet_id    ON public.collection_entries(sheet_id);
CREATE INDEX IF NOT EXISTS ix_collection_entries_customer_id ON public.collection_entries(customer_id);
