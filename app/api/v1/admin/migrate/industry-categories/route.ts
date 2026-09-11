import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-shot migration for the Industry Category master-data system (Profile's
 * "Change Business Category" wizard + the admin-editable category list).
 *
 * Follows the same pattern as ../route.ts (mill Phase 2 tables): each
 * statement runs separately since Prisma 6.x refuses to batch multiple
 * commands into one $executeRawUnsafe call. Every DDL is IF NOT EXISTS /
 * ON CONFLICT DO NOTHING, so re-running this route is always safe — hitting
 * it twice just re-confirms the table/seed already exist.
 *
 * Requires auth so random visitors can't hit it.
 */
async function exec(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

// [name, emoji, businessTypeMeta, mappedBusinessType | null, sortOrder]
// mappedBusinessType is a best-fit id into the EXISTING lib/businessConfig.ts
// BusinessType list — null where no real equivalent exists yet in the
// current product-field engine (see plan section F: these categories still
// save fine, they just don't change which product fields the shop sees).
const SEED_CATEGORIES: [string, string, string, string | null, number][] = [
  ['Accounting & CA', '\u{1F4C8}', 'service', null, 1],
  ['Interior Designer', '\u{1F3A8}', 'service', null, 2],
  ['Automobiles / Auto Parts', '\u{1F697}', 'retail', null, 3],
  ['Salon & Spa', '\u{1F484}', 'service', null, 4],
  ['Liquor Store', '\u{1F37E}', 'retail', 'liquor', 5],
  ['Book / Stationery Store', '\u{1F4DA}', 'retail', 'generalstore', 6],
  ['Construction Materials & Equipment', '\u{1F3D7}\u{FE0F}', 'wholesale', null, 7],
  ['Repairing / Plumbing / Electrician', '\u{1F527}', 'service', null, 8],
  ['Chemicals & Fertilizers', '\u{1F9EA}', 'distributor', 'fertilizerdistributor', 9],
  ['Computer Equipment & Software', '\u{1F4BB}', 'retail', 'electronics', 10],
  ['Electrical & Electronics Equipment', '\u{1F50C}', 'retail', 'electric', 11],
  ['Fashion Accessory / Cosmetics', '\u{1F484}', 'retail', 'boutique', 12],
  ['Tailoring / Boutique', '\u{1F9F5}', 'retail', 'boutique', 13],
  ['Fruit & Vegetable', '\u{1F345}', 'retail', 'agrostore', 14],
  ['Kirana / General Merchant', '\u{1F6D2}', 'retail', 'kirana', 15],
  ['FMCG Products', '\u{1F9F4}', 'distributor', 'fmcgdistributor', 16],
  ['Dairy Farm Products / Poultry', '\u{1F404}', 'retail', 'agrostore', 17],
  ['Furniture', '\u{1FA91}', 'retail', null, 18],
  ['Garment / Fashion & Hosiery', '\u{1F455}', 'retail', 'clothes', 19],
  ['Jewellery & Gems', '\u{1F48E}', 'retail', null, 20],
  ['Pharmacy / Medical', '\u{1F48A}', 'retail', 'medical', 21],
  ['Hardware Store', '\u{1F528}', 'retail', null, 22],
  ['Industrial Machinery & Equipment', '\u{2699}\u{FE0F}', 'manufacturing', 'smallmanufacturing', 23],
  ['Mobile & Accessories', '\u{1F4F1}', 'retail', 'electronics', 24],
  ['Nursery / Plants', '\u{1F331}', 'retail', 'agrostore', 25],
  ['Petroleum Bulk Stations & Terminals / Petrol', '\u{26FD}', 'other', null, 26],
  ['Restaurant / Hotel', '\u{1F37D}\u{FE0F}', 'service', null, 27],
  ['Footwear', '\u{1F45F}', 'retail', 'shoes', 28],
  ['Paper & Paper Products', '\u{1F4C4}', 'manufacturing', null, 29],
  ['Sweet Shop / Bakery', '\u{1F370}', 'retail', null, 30],
  ['Gifts & Toys', '\u{1F381}', 'retail', null, 31],
  ['Laundry / Washing / Dry Clean', '\u{1F9FA}', 'service', null, 32],
  ['Coaching & Training', '\u{1F393}', 'service', null, 33],
  ['Renting & Leasing', '\u{1F4CB}', 'service', null, 34],
  ['Fitness Center', '\u{1F3CB}\u{FE0F}', 'service', null, 35],
  ['Oil & Gas', '\u{1F6E2}\u{FE0F}', 'other', null, 36],
  ['Real Estate', '\u{1F3E2}', 'service', null, 37],
  ['NGO & Charitable Trust', '\u{1F91D}', 'other', null, 38],
  ['Tours & Travels', '\u{2708}\u{FE0F}', 'service', null, 39],
  ['Bhagar / Rice Mill', '\u{1F33E}', 'manufacturing', 'millprocessing', 40],
  ['Other Business', '\u{1F4E6}', 'other', 'general', 41],
];

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    await exec(`CREATE TABLE IF NOT EXISTS industry_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR NOT NULL,
      name_hi VARCHAR,
      name_mr VARCHAR,
      emoji VARCHAR,
      business_type_meta VARCHAR NOT NULL,
      mapped_business_type VARCHAR,
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_industry_categories_name ON industry_categories(name)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_industry_categories_meta ON industry_categories(business_type_meta)`);
    await exec(`CREATE INDEX IF NOT EXISTS ix_industry_categories_active ON industry_categories(active)`);

    await exec(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS industry_category_id UUID`);

    let seeded = 0;
    for (const [name, emoji, meta, mapped, sortOrder] of SEED_CATEGORIES) {
      const esc = (s: string) => s.replace(/'/g, "''");
      await exec(`INSERT INTO industry_categories (name, emoji, business_type_meta, mapped_business_type, sort_order)
        VALUES ('${esc(name)}', '${esc(emoji)}', '${esc(meta)}', ${mapped ? `'${esc(mapped)}'` : 'NULL'}, ${sortOrder})
        ON CONFLICT (name) DO NOTHING`);
      seeded++;
    }

    return NextResponse.json({ success: true, table: 'industry_categories', seededAttempted: seeded });
  } catch (err: any) {
    console.error('[industry-categories migrate] failed:', err);
    return NextResponse.json({ error: err?.message || 'Migration failed' }, { status: err?.status || 500 });
  }
}
