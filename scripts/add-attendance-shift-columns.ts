/**
 * One-time migration: add shift tracking columns to attendance table.
 * Run with: npx dotenv-cli -e .env.local -- tsx scripts/add-attendance-shift-columns.ts
 */
import prisma from '../lib/server/prisma';

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS shift VARCHAR,
    ADD COLUMN IF NOT EXISTS in_time VARCHAR,
    ADD COLUMN IF NOT EXISTS out_time VARCHAR,
    ADD COLUMN IF NOT EXISTS shift_hours DOUBLE PRECISION;
  `);
  console.log('✓ shift columns added to attendance (or already exist)');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
