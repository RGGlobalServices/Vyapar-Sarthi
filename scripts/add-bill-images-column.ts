/**
 * One-time migration: add bill_images JSONB column to purchase_invoices.
 * Run with: npx dotenv-cli -e .env.local -- tsx scripts/add-bill-images-column.ts
 */
import prisma from '../lib/server/prisma';

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE purchase_invoices
    ADD COLUMN IF NOT EXISTS bill_images JSONB DEFAULT '[]'::jsonb;
  `);
  console.log('✓ bill_images column added (or already exists)');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
