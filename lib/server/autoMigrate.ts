import prisma from './prisma';

export async function runAutoMigrations() {
  console.log('[AutoMigrate] Checking database schema...');
  try {
    // 1. Add missing columns to products table
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='brand') THEN
          ALTER TABLE products ADD COLUMN brand VARCHAR;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='hsn_code') THEN
          ALTER TABLE products ADD COLUMN hsn_code VARCHAR;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_type') THEN
          ALTER TABLE products ADD COLUMN product_type VARCHAR DEFAULT 'single';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='gst_percent') THEN
          ALTER TABLE products ADD COLUMN gst_percent DOUBLE PRECISION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='mobile') THEN
          ALTER TABLE suppliers ADD COLUMN mobile VARCHAR;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='email') THEN
          ALTER TABLE suppliers ADD COLUMN email VARCHAR;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='address') THEN
          ALTER TABLE suppliers ADD COLUMN address VARCHAR;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='balance') THEN
          ALTER TABLE suppliers ADD COLUMN balance DOUBLE PRECISION DEFAULT 0;
        END IF;
      END $$;
    `);

    // 2. Create missing tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        size VARCHAR,
        unit VARCHAR,
        barcode VARCHAR,
        wholesale_cost DOUBLE PRECISION,
        selling_price DOUBLE PRECISION,
        mrp DOUBLE PRECISION,
        current_stock DOUBLE PRECISION,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_pv_product_id ON product_variants(product_id);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        contact_person VARCHAR,
        mobile VARCHAR,
        email VARCHAR,
        address VARCHAR,
        gstin VARCHAR,
        balance DOUBLE PRECISION DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_suppliers_shop_id ON suppliers(shop_id);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        godown_id UUID REFERENCES godowns(id) ON DELETE SET NULL,
        invoice_number VARCHAR,
        date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        subtotal DOUBLE PRECISION DEFAULT 0,
        tax_total DOUBLE PRECISION DEFAULT 0,
        discount DOUBLE PRECISION DEFAULT 0,
        total_amount DOUBLE PRECISION DEFAULT 0,
        status VARCHAR DEFAULT 'received',
        payment_status VARCHAR DEFAULT 'unpaid',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
        quantity DOUBLE PRECISION NOT NULL,
        cost_price DOUBLE PRECISION NOT NULL,
        batch_number VARCHAR,
        expiry_date VARCHAR,
        tax_percent DOUBLE PRECISION,
        total DOUBLE PRECISION NOT NULL
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
        batch_number VARCHAR NOT NULL,
        expiry_date VARCHAR,
        manufacturing_date VARCHAR,
        mrp DOUBLE PRECISION,
        cost_price DOUBLE PRECISION,
        selling_price DOUBLE PRECISION,
        current_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(product_id, batch_number)
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
        warehouse_id UUID REFERENCES godowns(id) ON DELETE SET NULL,
        type VARCHAR NOT NULL,
        quantity DOUBLE PRECISION NOT NULL,
        reference_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create import_logs table for audit trail
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS import_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        import_name VARCHAR NOT NULL,
        file_name VARCHAR,
        source VARCHAR NOT NULL DEFAULT 'stock',
        total_rows INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        errors JSONB DEFAULT '[]'::jsonb,
        processing_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_import_logs_shop_created ON import_logs(shop_id, created_at DESC);
    `);

    
    console.log('[AutoMigrate] Database schema checked successfully.');
  } catch (err) {
    console.error('[AutoMigrate] Error checking database schema:', err);
  }
}
