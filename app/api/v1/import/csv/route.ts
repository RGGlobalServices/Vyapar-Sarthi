import { NextResponse } from 'next/server';
import { requireShop } from '@/lib/server/auth';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseCSV(csvText: string) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return [];
  
  // A simple CSV line parser that handles quotes
  const parseLine = (line: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i+1] === '"') {
          current += '"'; i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index] : null;
    });
    rows.push(row);
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const { shop } = await requireShop(req);
    
    if (shop.subscriptionPlan !== 'wholesale') {
      return NextResponse.json({ error: 'Udyog Plan Required' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    
    const text = await file.text();
    const data = parseCSV(text);

    if (data.length === 0) {
      return NextResponse.json({ error: 'CSV is empty or invalid' }, { status: 400 });
    }

    let count = 0;

    if (type === 'products') {
      for (const row of data) {
        if (!row.name) continue;
        await prisma.product.create({
          data: {
            shopId: shop.id,
            name: row.name,
            brand: row.brand || null,
            category: row.category || null,
            barcode: row.barcode || row.sku || null,
            hsnCode: row.hsnCode || null,
            gstPercent: row.gstPercent ? parseFloat(row.gstPercent) : 0,
            mrp: row.mrp ? parseFloat(row.mrp) : 0,
            sellingPrice: row.sellingPrice ? parseFloat(row.sellingPrice) : 0,
            wholesaleCost: row.wholesaleCost ? parseFloat(row.wholesaleCost) : 0,
            baseUnit: row.baseUnit || 'PCS',
            productType: row.productType || 'single',
            currentStock: 0, // Master data import should not set stock directly
            minStock: 0
          }
        });
        count++;
      }
    } else if (type === 'suppliers') {
      for (const row of data) {
        if (!row.name) continue;
        // @ts-ignore
        await prisma.supplier.create({
          data: {
            shopId: shop.id,
            name: row.name,
            contact: row.contact || null,
            mobile: row.mobile || null,
            email: row.email || null,
            address: row.address || null,
            gst: row.gst || null,
            balance: row.balance ? parseFloat(row.balance) : 0,
          }
        });
        count++;
      }
    } else if (type === 'stock') {
      for (const row of data) {
        if (!row.productSku || !row.quantity) continue;
        const product = await prisma.product.findFirst({ where: { shopId: shop.id, barcode: row.productSku } });
        if (!product) continue;
        
        await prisma.batch.create({
          data: {
            shopId: shop.id,
            productId: product.id,
            batchNumber: row.batchNumber || null,
            quantity: parseFloat(row.quantity),
            mfgDate: row.mfgDate ? new Date(row.mfgDate) : null,
            expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
          }
        });
        await prisma.product.update({
          where: { id: product.id },
          data: { currentStock: { increment: parseFloat(row.quantity) } }
        });
        await prisma.$executeRaw`
          INSERT INTO stock_movements (shop_id, product_id, type, quantity, reference_id, created_at)
          VALUES (${shop.id}::uuid, ${product.id}::uuid, 'purchase', ${parseFloat(row.quantity)}, null, NOW())
        `;
        count++;
      }
    } else if (type === 'purchases') {
      // Create purchase invoice and its items based on the CSV
      // To simplify CSV for purchases, the user supplies items as JSON string in 'items' column
      for (const row of data) {
        if (!row.items) continue;
        let items = [];
        try { items = JSON.parse(row.items.replace(/""/g, '"')); } catch (e) { continue; }
        
        const supplier = await prisma.supplier.findFirst({ where: { shopId: shop.id, mobile: row.supplierMobile } });
        
        const invoice = await prisma.purchaseInvoice.create({
          data: {
            shopId: shop.id,
            supplierId: supplier?.id || '',
            invoiceNumber: row.invoiceNumber || null,
            date: row.date ? new Date(row.date) : new Date(),
            totalCost: row.totalAmount ? parseFloat(row.totalAmount) : 0,
          }
        });

        for (const item of items) {
          const product = await prisma.product.findFirst({ where: { shopId: shop.id, barcode: item.productSku } });
          if (product) {
            await prisma.purchaseItem.create({
              data: {
                purchaseInvoiceId: invoice.id,
                productId: product.id,
                quantity: item.qty,
                cost: item.cost,
              }
            });
            // Update stock and batch
            await prisma.batch.create({
              data: { shopId: shop.id, productId: product.id, quantity: item.qty }
            });
            await prisma.product.update({
              where: { id: product.id },
              data: { currentStock: { increment: item.qty }, wholesaleCost: item.cost }
            });
          }
        }
        count++;
      }
    } else {
      return NextResponse.json({ error: 'Invalid import type' }, { status: 400 });
    }

    return NextResponse.json({ count, message: 'Import successful' });
  } catch (error: any) {
    console.error('[API] Error in CSV import:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
