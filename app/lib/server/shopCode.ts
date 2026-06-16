import prisma from './prisma';

export function generateShopCode(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `${clean}${suffix}`;
}

// Generate a unique shop code and persist it via raw SQL so it works even
// before `prisma generate` picks up the shopCode field.
export async function ensureShopCode(shopId: string, name?: string | null): Promise<string | null> {
  let shopCode = '';
  let attempts = 0;
  do {
    shopCode = generateShopCode(name || 'SHOP');
    try {
      const rows = (await prisma.$queryRaw`SELECT id FROM shops WHERE shop_code = ${shopCode} LIMIT 1`) as unknown[];
      if (!rows || rows.length === 0) break;
    } catch {
      break; // column doesn't exist yet — still assign the code
    }
    attempts++;
  } while (attempts < 10);
  try {
    await prisma.$executeRaw`UPDATE shops SET shop_code = ${shopCode} WHERE id = ${shopId}::uuid`;
  } catch {
    return null; // column doesn't exist yet; will be set after SQL migration runs
  }
  return shopCode;
}

// Find a unique candidate shop code (without persisting it).
export async function uniqueShopCode(name: string): Promise<string> {
  let shopCode = '';
  let attempts = 0;
  do {
    shopCode = generateShopCode(name);
    try {
      const rows = (await prisma.$queryRaw`SELECT id FROM shops WHERE shop_code = ${shopCode} LIMIT 1`) as unknown[];
      if (!rows || rows.length === 0) break;
    } catch {
      break;
    }
    attempts++;
  } while (attempts < 10);
  return shopCode;
}
