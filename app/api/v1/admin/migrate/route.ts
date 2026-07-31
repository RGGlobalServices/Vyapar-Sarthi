import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-shot migration for the Rice Mill Phase 2 tables.
 *
 * Bypasses lib/server/autoMigrate.ts because that helper concatenates
 * multiple statements into a single $executeRawUnsafe call — Prisma 6.x
 * refuses ("cannot insert multiple commands into a prepared statement")
 * and silently swallows the error inside its try/catch, so on this codebase
 * autoMigrate has been a no-op since the Prisma 6 bump. Rather than reflow
 * the whole existing helper (risky — it manages 20+ tables), each mill
 * table is created with a single statement here; indexes go in separate
 * calls. Every DDL is IF NOT EXISTS so re-running is safe.
 *
 * Requires auth so random visitors can't hit it.
 */
async function exec(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

export async function GET(req: Request) {
  try {
    await requireShop(req, { enforceSubscription: false });

    // raw_material_lots
    await exec(`CREATE TABLE IF NOT EXISTS raw_material_lots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE NO ACTION,
      supplier_id UUID REFERENCES suppliers(id) ON DELETE NO ACTION,
      lot_number VARCHAR,
      farmer_name VARCHAR,
      purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      weight_kg DOUBLE PRECISION,
      moisture_pct DOUBLE PRECISION,
      rate_per_kg DOUBLE PRECISION,
      total_amount DOUBLE PRECISION,
      remaining_kg DOUBLE PRECISION,
      notes VARCHAR,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_raw_lots_shop ON raw_material_lots(shop_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_raw_lots_supplier ON raw_material_lots(supplier_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_raw_lots_product ON raw_material_lots(product_id)`);

    // production_batches
    await exec(`CREATE TABLE IF NOT EXISTS production_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      batch_number VARCHAR NOT NULL,
      raw_lot_id UUID REFERENCES raw_material_lots(id) ON DELETE NO ACTION,
      input_kg DOUBLE PRECISION,
      output_kg DOUBLE PRECISION,
      wastage_kg DOUBLE PRECISION,
      broken_kg DOUBLE PRECISION,
      bran_kg DOUBLE PRECISION,
      husk_kg DOUBLE PRECISION,
      recovery_pct DOUBLE PRECISION,
      status VARCHAR NOT NULL DEFAULT 'open',
      current_stage VARCHAR NOT NULL DEFAULT 'cleaning',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      notes VARCHAR,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(shop_id, batch_number)
    )`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_prod_batches_shop ON production_batches(shop_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_prod_batches_raw_lot ON production_batches(raw_lot_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_prod_batches_status ON production_batches(status)`);

    // batch_stages
    await exec(`CREATE TABLE IF NOT EXISTS batch_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
      stage_name VARCHAR NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      input_kg DOUBLE PRECISION,
      output_kg DOUBLE PRECISION,
      wastage_kg DOUBLE PRECISION,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      operator_name VARCHAR,
      notes VARCHAR,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_batch_stages_batch ON batch_stages(batch_id)`);

    // by_products
    await exec(`CREATE TABLE IF NOT EXISTS by_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL,
      name VARCHAR NOT NULL,
      quantity_kg DOUBLE PRECISION,
      sold_kg DOUBLE PRECISION DEFAULT 0,
      rate_per_kg DOUBLE PRECISION,
      notes VARCHAR,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_by_products_shop ON by_products(shop_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_by_products_batch ON by_products(batch_id)`);

    return NextResponse.json({ success: true, tables: ['raw_material_lots', 'production_batches', 'batch_stages', 'by_products'] });
  } catch (err: any) {
    console.error('[mill migrate] failed:', err);
    return NextResponse.json({ error: err?.message || 'Migration failed' }, { status: err?.status || 500 });
  }
}
