/**
 * One-time migration: create bank_accounts and bank_transactions tables.
 * Run with: npx dotenv-cli -e .env.local -- npx prisma db execute --schema=prisma/schema.prisma --stdin < scripts/add-bank-accounts.sql
 * Or run the SQL directly via your DB admin (Supabase SQL editor).
 */
import prisma from '../lib/server/prisma';

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      name            VARCHAR NOT NULL,
      bank_name       VARCHAR,
      account_number  VARCHAR,
      ifsc            VARCHAR,
      opening_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      balance         DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✓ bank_accounts table created (or already exists)');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bank_account_id  UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
      type             VARCHAR NOT NULL,
      amount           DOUBLE PRECISION NOT NULL,
      description      VARCHAR,
      source           VARCHAR,
      reference_id     UUID,
      date             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS ix_bank_txns_account_date
      ON bank_transactions (bank_account_id, date DESC);
  `);
  console.log('✓ bank_transactions table created (or already exists)');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
