import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import Fuse from 'fuse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same case-/space-insensitive field lookup the execute route uses, so the
// preview's "new vs existing" decision reflects exactly how the import will match.
function getVal(row: any, possibleKeys: string[]) {
  const rowKeys = Object.keys(row);
  for (const key of possibleKeys) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const rKey of rowKeys) {
      if (rKey.toLowerCase().replace(/[^a-z0-9]/g, '') === norm) return row[rKey];
    }
  }
  return undefined;
}

/**
 * Given an import type + parsed rows, tell the client which rows match an
 * existing record (so the preview can ask "update or keep old?") and which are
 * brand new. Matching mirrors the execute route: barcode exact, then fuzzy name
 * for products; mobile/name for parties. Never mutates anything.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireShop(req);
    if (auth instanceof NextResponse) return auth;
    const shopId = auth.shop.id;

    const { importType, data } = await req.json();
    if (!Array.isArray(data)) {
      return NextResponse.json({ matches: [] });
    }

    // matches[i] = { status: 'new' | 'existing', existingName?: string }
    const matches: { status: 'new' | 'existing'; existingName?: string }[] = [];

    if (importType === 'product' || importType === 'stock' || importType === 'purchase') {
      const products = await prisma.product.findMany({
        where: { shopId },
        select: { id: true, name: true, barcode: true },
      });
      const byBarcode = new Map<string, string>();
      for (const p of products) if (p.barcode) byBarcode.set(p.barcode, p.name || '');
      const fuse = new Fuse(products, { keys: ['name', 'barcode'], threshold: 0.3 });

      for (const row of data) {
        const name = getVal(row, ['productname', 'name', 'description', 'item']);
        const barcode = getVal(row, ['barcode', 'sku']);
        const bcStr = barcode ? String(barcode).trim() : '';
        if (bcStr && byBarcode.has(bcStr)) {
          matches.push({ status: 'existing', existingName: byBarcode.get(bcStr) });
          continue;
        }
        if (name) {
          const res = fuse.search(String(name));
          if (res.length > 0) {
            matches.push({ status: 'existing', existingName: res[0].item.name || '' });
            continue;
          }
        }
        matches.push({ status: 'new' });
      }
    } else if (importType === 'customers' || importType === 'ledger') {
      const customers = await prisma.customer.findMany({
        where: { shopId },
        select: { name: true, mobile: true },
      });
      for (const row of data) {
        const name = String(getVal(row, ['customername', 'name', 'customer', 'client', 'partyname', 'party']) || '').trim().toLowerCase();
        const mobile = String(getVal(row, ['mobile', 'phone']) || '').trim();
        const hit = customers.find(c =>
          (mobile && c.mobile === mobile) || (name && (c.name ?? '').toLowerCase() === name)
        );
        matches.push(hit ? { status: 'existing', existingName: hit.name || '' } : { status: 'new' });
      }
    } else if (importType === 'suppliers') {
      const suppliers = await prisma.supplier.findMany({ where: { shopId }, select: { name: true } });
      for (const row of data) {
        const name = String(getVal(row, ['suppliername', 'name', 'supplier', 'vendor', 'partyname', 'party']) || '').trim().toLowerCase();
        const hit = suppliers.find(s => name && (s.name ?? '').toLowerCase() === name);
        matches.push(hit ? { status: 'existing', existingName: hit.name || '' } : { status: 'new' });
      }
    } else {
      // sales and anything else are always new records.
      for (let i = 0; i < data.length; i++) matches.push({ status: 'new' });
    }

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('check-matches error:', error);
    return NextResponse.json({ error: error.message || 'Failed to check matches' }, { status: 500 });
  }
}
