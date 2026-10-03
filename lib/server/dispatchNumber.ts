import prisma from '@/lib/server/prisma';

/**
 * Next free DC-YYYYMMDD-NNN number of this shop. The date is the shop's own (India, IST) day, and the sequence continues after the highest
 * number already used that day — counting the rows (the old way) re-issued a number after any gap and hit the unique (shop, number) index.
 * `skip` is for a retry after another request grabbed the number first.
 */
export async function nextDispatchNumber(shopId: string, skip = 0): Promise<string> {
  const ist = new Date(Date.now() + 330 * 60_000);
  const prefix = `DC-${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${String(ist.getUTCDate()).padStart(2, '0')}`;
  const last = await (prisma as any).dispatchEntry.findFirst({
    where: { shopId, dispatchNumber: { startsWith: prefix + '-' } },
    orderBy: { dispatchNumber: 'desc' },
    select: { dispatchNumber: true },
  });
  const n = last ? parseInt(String(last.dispatchNumber).slice(prefix.length + 1), 10) : 0;
  return `${prefix}-${String((Number.isFinite(n) ? n : 0) + 1 + skip).padStart(3, '0')}`;
}

/** Runs `attempt(number)` with a fresh number, retrying (up to 5 times) while the number was taken meanwhile (unique violation). */
export async function withDispatchNumber<T>(shopId: string, attempt: (dispatchNumber: string) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt(await nextDispatchNumber(shopId, i));
    } catch (e: any) {
      if (e?.code === 'P2002' && i < 4) continue;
      throw e;
    }
  }
}
