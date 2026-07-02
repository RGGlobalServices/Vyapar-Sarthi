import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import Fuse from 'fuse.js';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireShop(req);
    if (auth instanceof NextResponse) return auth;
    const shopId = auth.shop.id;

    const body = await req.json();
    const { importType, data, godownId } = body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No data to import' }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    switch (importType) {
      case 'product': {
        // Fetch existing products for smart matching
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, category: true }
        });
        
        const fuse = new Fuse(existingProducts, { keys: ['name', 'barcode'], threshold: 0.3 });

        for (const row of data) {
          const name = row['Product Name'] || row.productName || row.name;
          const barcode = row.Barcode || row.barcode;
          if (!name) { skipped++; continue; }

          let matchId = null;
          if (barcode) {
            const exactMatch = existingProducts.find(p => p.barcode === String(barcode));
            if (exactMatch) matchId = exactMatch.id;
          }
          if (!matchId) {
            const results = fuse.search(name);
            if (results.length > 0) matchId = results[0].item.id;
          }

          const price = parseFloat(row['Selling Price'] || row.sellingPrice || row.price || 0);
          const cost = parseFloat(row['Cost Price'] || row.wholesaleCost || row.cost || 0);
          const mrp = parseFloat(row.MRP || row.mrp || price);
          const category = row.Category || row.category || 'General';

          if (matchId) {
            await prisma.product.update({
              where: { id: matchId },
              data: { sellingPrice: price, wholesaleCost: cost, mrp, category }
            });
            updated++;
          } else {
            await prisma.product.create({
              data: {
                shopId,
                name: String(name),
                barcode: barcode ? String(barcode) : undefined,
                sellingPrice: price,
                wholesaleCost: cost,
                mrp,
                category,
                baseUnit: row.Unit || row.unit || 'pcs'
              }
            });
            created++;
          }

          if (godownId && quantity > 0) {
            const existingGodownProd = await prisma.godownProduct.findUnique({
              where: { godownId_productId: { godownId, productId: matchId } }
            });
            if (existingGodownProd) {
              await prisma.godownProduct.update({
                where: { godownId_productId: { godownId, productId: matchId } },
                data: { quantity: { increment: quantity } }
              });
            } else {
              await prisma.godownProduct.create({
                data: { godownId, productId: matchId, quantity }
              });
            }
          }
        }
        break;
      }
      
      case 'suppliers': {
        for (const row of data) {
          const name = row['Supplier Name'] || row.name || row.supplier;
          if (!name) { skipped++; continue; }
          await prisma.supplier.create({
            data: {
              shopId,
              name: String(name),
              contact: String(row.Contact || row.contact || ''),
              mobile: String(row.Mobile || row.mobile || ''),
              gst: String(row.GST || row.gst || ''),
              balance: parseFloat(row.Balance || row.balance || 0)
            }
          });
          created++;
        }
        break;
      }

      case 'customers': {
        for (const row of data) {
          const name = row['Customer Name'] || row.name || row.customer;
          if (!name) { skipped++; continue; }
          await prisma.customer.create({
            data: {
              shopId,
              name: String(name),
              mobile: String(row.Mobile || row.mobile || ''),
              totalDue: parseFloat(row['Opening Balance'] || row.balance || 0)
            }
          });
          created++;
        }
        break;
      }

      case 'purchase': {
        if (data.length === 0) break;
        const firstRow = data[0];
        const supplierName = firstRow.supplier || firstRow.vendorName || firstRow.vendor || 'Unknown Supplier';
        const invoiceNumber = firstRow.invoiceNumber || firstRow.billNumber || `INV-${Date.now()}`;
        
        let billDate = new Date();
        if (firstRow.invoiceDate || firstRow.billDate) {
          const parsed = Date.parse(firstRow.invoiceDate || firstRow.billDate);
          if (!isNaN(parsed)) billDate = new Date(parsed);
        }

        let dbSupplier = await prisma.supplier.findFirst({
          where: { shopId, name: { equals: supplierName, mode: 'insensitive' } }
        });
        if (!dbSupplier) {
          dbSupplier = await prisma.supplier.create({
            data: { shopId, name: supplierName, balance: 0 }
          });
        }

        const purchaseInvoice = await prisma.purchaseInvoice.create({
          data: {
            shopId,
            supplierId: dbSupplier.id,
            invoiceNumber: String(invoiceNumber),
            date: billDate,
            totalCost: 0,
            gst: 0
          }
        });

        let totalInvoiceCost = 0;

        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, currentStock: true }
        });
        const fuse = new Fuse(existingProducts, { keys: ['name', 'barcode'], threshold: 0.3 });

        for (const row of data) {
          const name = row.productName || row.name || row['Product Name'];
          const quantity = parseFloat(row.quantity || row.qty || row.Quantity || 0);
          const unitCost = parseFloat(row.unitCost || row.wholesaleCost || row.cost || row.price || 0);
          
          if (!name || quantity <= 0) { skipped++; continue; }

          let matchId = null;
          const barcode = row.barcode || row.sku;
          if (barcode) {
             const exact = existingProducts.find(p => p.barcode === String(barcode));
             if (exact) matchId = exact.id;
          }
          if (!matchId) {
             const results = fuse.search(name);
             if (results.length > 0) matchId = results[0].item.id;
          }

          if (!matchId) {
            const newProduct = await prisma.product.create({
              data: {
                shopId,
                name: String(name),
                barcode: barcode ? String(barcode) : undefined,
                baseUnit: row.unit || row.Unit || 'pcs',
                wholesaleCost: unitCost,
                sellingPrice: unitCost * 1.2,
                mrp: unitCost * 1.25,
                category: row.category || 'General',
                currentStock: quantity
              }
            });
            matchId = newProduct.id;
            created++;
          } else {
            const p = existingProducts.find(x => x.id === matchId);
            const newStock = (p?.currentStock || 0) + quantity;
            await prisma.product.update({
              where: { id: matchId },
              data: {
                wholesaleCost: unitCost,
                currentStock: newStock
              }
            });
            updated++;
          }

          if (godownId) {
            const existingGodownProd = await prisma.godownProduct.findUnique({
              where: { godownId_productId: { godownId, productId: matchId } }
            });
            if (existingGodownProd) {
              await prisma.godownProduct.update({
                where: { godownId_productId: { godownId, productId: matchId } },
                data: { quantity: { increment: quantity } }
              });
            } else {
              await prisma.godownProduct.create({
                data: { godownId, productId: matchId, quantity }
              });
            }
          }

          const itemCost = quantity * unitCost;
          totalInvoiceCost += itemCost;

          await prisma.purchaseItem.create({
            data: {
              purchaseInvoiceId: purchaseInvoice.id,
              productId: matchId,
              quantity,
              cost: unitCost,
              gst: parseFloat(row.gst || 0)
            }
          });
          
          await prisma.stockLog.create({
             data: {
                shopId,
                productId: matchId,
                type: 'purchase',
                quantity,
                note: `Purchase Invoice ${invoiceNumber}`
             }
          });
        }

        await prisma.purchaseInvoice.update({
          where: { id: purchaseInvoice.id },
          data: { totalCost: totalInvoiceCost }
        });
        break;
      }

      // Add other cases here (stock, sales, ledger)
      default:
        // Basic fallback handling
        skipped = data.length;
        break;
    }

    return NextResponse.json({
      summary: {
        totalProcessed: data.length,
        created,
        updated,
        skipped
      }
    });

  } catch (error: any) {
    console.error('Import execution error:', error);
    return NextResponse.json({ error: error.message || 'Failed to execute import' }, { status: 500 });
  }
}
