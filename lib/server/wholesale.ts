import prisma from './prisma';

let wholesaleTablesChecked = false;

// Auto-create wholesale tables on first use so the feature works without
// a manual Supabase SQL migration step.
export async function ensureWholesaleTables() {
  if (wholesaleTablesChecked) return;

  try {
    // 1. Modify Products Table
    await prisma.$executeRawUnsafe(`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hsn_code VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type VARCHAR DEFAULT 'single'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_percent DOUBLE PRECISION`);

    // 2. Product Variants Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        size VARCHAR,
        unit VARCHAR,
        barcode VARCHAR UNIQUE,
        cost_price DOUBLE PRECISION,
        selling_price DOUBLE PRECISION,
        mrp DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS product_variants_product_idx ON public.product_variants(product_id)`);

    // 3. Suppliers Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        contact VARCHAR,
        gst VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS suppliers_shop_idx ON public.suppliers(shop_id)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS mobile VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address VARCHAR`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS balance DOUBLE PRECISION DEFAULT 0`);

    // 4. Purchase Invoices Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.purchase_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
        invoice_number VARCHAR,
        date TIMESTAMPTZ DEFAULT NOW(),
        total_cost DOUBLE PRECISION,
        gst DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_invoices_shop_idx ON public.purchase_invoices(shop_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_invoices_supplier_idx ON public.purchase_invoices(supplier_id)`);

    // 5. Purchase Items Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.purchase_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
        quantity DOUBLE PRECISION NOT NULL,
        cost DOUBLE PRECISION NOT NULL,
        gst DOUBLE PRECISION
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_items_invoice_idx ON public.purchase_items(purchase_invoice_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS purchase_items_product_idx ON public.purchase_items(product_id)`);

    // 6. Batches Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
        batch_number VARCHAR,
        mfg_date TIMESTAMPTZ,
        expiry_date TIMESTAMPTZ,
        quantity DOUBLE PRECISION DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS batches_shop_idx ON public.batches(shop_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS batches_product_idx ON public.batches(product_id)`);

    // 7. Stock Movements Table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
        warehouse_id UUID,
        type VARCHAR NOT NULL,
        quantity DOUBLE PRECISION NOT NULL,
        reference_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS stock_movements_shop_idx ON public.stock_movements(shop_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements(product_id)`);

    wholesaleTablesChecked = true;
  } catch (err) {
    console.error("Failed to auto-migrate wholesale tables:", err);
  }
}
