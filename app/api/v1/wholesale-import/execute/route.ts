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
    const rowErrors: string[] = [];

    // Helper to extract values case-insensitively and space-insensitively
    const getVal = (row: any, possibleKeys: string[]) => {
      const rowKeys = Object.keys(row);
      for (const key of possibleKeys) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const rKey of rowKeys) {
          if (rKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey) {
            return row[rKey];
          }
        }
      }
      return undefined;
    };

    // The business-type-specific fields the dedicated "Add Product" form
    // (app/[locale]/(main)/products/page.tsx handleAddSubmit) sets that a
    // bulk import previously dropped on the floor — expiry, batch, drug
    // schedule (medical), model/warranty (electronics), gender/shade
    // (clothes/boutique). Only included when actually present in the row.
    const getProductExtras = (row: any) => {
      const extras: Record<string, any> = {};
      const rawExpiry = getVal(row, ['expirydate', 'expiry']);
      if (rawExpiry) {
        const parsed = Date.parse(rawExpiry);
        if (!isNaN(parsed)) extras.expiryDate = new Date(parsed);
      }
      const batch = getVal(row, ['batchnumber', 'batch']);
      if (batch) extras.batch_number = String(batch);
      const drugSchedule = getVal(row, ['drugschedule', 'schedule']);
      if (drugSchedule) extras.drug_schedule = String(drugSchedule);
      const model = getVal(row, ['modelnumber', 'model']);
      if (model) extras.model_number = String(model);
      const warranty = getVal(row, ['warrantymonths', 'warranty']);
      if (warranty) extras.warranty_months = parseInt(warranty) || 0;
      const gender = getVal(row, ['gender']);
      if (gender) extras.gender = String(gender);
      const shade = getVal(row, ['shade']);
      if (shade) extras.shade = String(shade);
      return extras;
    };

    switch (importType) {
      case 'product': {
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, category: true }
        });
        
        const fuse = new Fuse(existingProducts, { keys: ['name', 'barcode'], threshold: 0.3 });

        // Pre-Validation Pass
        const seenBarcodes = new Set<string>();
        const errors: string[] = [];
        const masterUnits = await prisma.unit.findMany({ where: { shopId } });
        const validUnits = new Set(masterUnits.map(u => u.name.toLowerCase()));
        
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const barcode = getVal(row, ['barcode', 'sku']);
          if (barcode) {
            const bcStr = String(barcode).trim();
            if (seenBarcodes.has(bcStr)) {
              errors.push(`Row ${i + 1}: Duplicate barcode found in import file (${bcStr}).`);
            }
            seenBarcodes.add(bcStr);
          }
          
          const unit = getVal(row, ['unit']);
          if (unit) {
            const unitStr = String(unit).trim().toLowerCase();
            if (validUnits.size > 0 && !validUnits.has(unitStr)) {
              errors.push(`Row ${i + 1}: Invalid unit '${unit}'. Must be one of defined master units.`);
            }
          }
        }

        if (errors.length > 0) {
          return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
        }

        // Live barcode -> productId index, seeded from the DB and updated as we
        // create rows, so two new rows in the same file that share a barcode
        // match each other instead of both hitting the DB unique constraint.
        const barcodeIndex = new Map<string, string>();
        for (const p of existingProducts) if (p.barcode) barcodeIndex.set(p.barcode, p.id);

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['productname', 'name', 'description', 'item']);
            const barcode = getVal(row, ['barcode', 'sku']);
            if (!name) { 
              skipped++; 
              rowErrors.push(`Row ${i + 1}: Skipped - Missing product name`);
              continue; 
            }
            const barcodeStr = barcode ? String(barcode) : null;

            let matchId: string | null = barcodeStr ? barcodeIndex.get(barcodeStr) ?? null : null;
            if (!matchId) {
              const results = fuse.search(name);
              if (results.length > 0) matchId = results[0].item.id;
            }

            const price = parseFloat(getVal(row, ['sellingprice', 'price', 'rate']) || 0);
            const cost = parseFloat(getVal(row, ['costprice', 'wholesalecost', 'cost', 'purchaseprice']) || 0);
            const mrp = parseFloat(getVal(row, ['mrp']) || price);
            const category = getVal(row, ['category']) || 'General';
            const quantity = parseFloat(getVal(row, ['quantity', 'stock', 'qty']) || 0);
            const extras = getProductExtras(row);

            if (matchId) {
              await prisma.product.update({
                where: { id: matchId },
                data: { sellingPrice: price, wholesaleCost: cost, mrp, category, ...extras }
              });
              updated++;
            } else {
              const minStock = getVal(row, ['minstock', 'minlevel']);
              const newProd = await prisma.product.create({
                data: {
                  shopId,
                  name: String(name),
                  barcode: barcodeStr ?? undefined,
                  sellingPrice: price,
                  wholesaleCost: cost,
                  mrp,
                  category,
                  // Only set on create — a re-import matching an EXISTING product
                  // must not silently overwrite its real, sales-adjusted stock
                  // or a threshold the user has since tuned by hand.
                  currentStock: quantity,
                  minStock: minStock ? parseFloat(minStock) : undefined,
                  baseUnit: getVal(row, ['unit']) || (masterUnits.length > 0 ? masterUnits[0].name : 'pcs'),
                  metadata: getVal(row, ['size']) || getVal(row, ['color']) ? { size: getVal(row, ['size']), color: getVal(row, ['color']) } : {},
                  ...extras
                }
              });
              matchId = newProd.id;
              if (barcodeStr) barcodeIndex.set(barcodeStr, matchId);
              created++;
            }

            if (godownId && quantity > 0 && matchId) {
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
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [${importType}]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }
      
      case 'suppliers': {
        if (auth.shop.subscriptionPlan !== 'wholesale') {
          return NextResponse.json({ error: 'This feature is only available on the Udyog plan.' }, { status: 403 });
        }
        for (const row of data) {
          const name = getVal(row, ['suppliername', 'name', 'supplier', 'vendor', 'partyname', 'party']);
          if (!name) { 
            skipped++; 
            rowErrors.push(`Skipped - Missing supplier name in row`);
            continue; 
          }
          await prisma.supplier.create({
            data: {
              shopId,
              name: String(name),
              contact: String(getVal(row, ['contact']) || ''),
              mobile: String(getVal(row, ['mobile', 'phone']) || ''),
              gst: String(getVal(row, ['gst']) || ''),
              balance: parseFloat(getVal(row, ['balance', 'openingbalance']) || 0)
            }
          });
          created++;
        }
        break;
      }

      case 'customers': {
        // Match the exact field set the dedicated "Add Customer" form
        // (app/api/v1/crm/customers/route.ts) writes, so imported customers
        // look identical to manually-added ones — not a sparse subset.
        const existingCustomers = await prisma.customer.findMany({
          where: { shopId },
          select: { id: true, name: true, mobile: true }
        });

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['customername', 'name', 'customer', 'client', 'partyname', 'party']);
            if (!name) { 
              skipped++; 
              rowErrors.push(`Row ${i + 1}: Skipped - Missing customer name`);
              continue; 
            }
            const mobile = String(getVal(row, ['mobile', 'phone']) || '').trim();
            const openingBalance = parseFloat(getVal(row, ['openingbalance', 'balance', 'openingudhar', 'udhar']) || 0);

            // No dedicated city/village column on Customer — fold it into address.
            const village = getVal(row, ['villagecity', 'village', 'city', 'town']);
            const addressRaw = getVal(row, ['address']);
            const address = [village, addressRaw].filter(Boolean).join(', ') || undefined;
            const gst = getVal(row, ['gst', 'gstin', 'gstnumber']);

            const existing = existingCustomers.find(c =>
              (mobile && c.mobile === mobile) || (c.name ?? '').toLowerCase() === String(name).trim().toLowerCase()
            );

            let customerId: string;
            if (existing) {
              await prisma.customer.update({
                where: { id: existing.id },
                data: {
                  email: getVal(row, ['email'])?.trim() || undefined,
                  shopName: getVal(row, ['shopname', 'businessname'])?.trim() || undefined,
                  gst: gst?.trim() || undefined,
                  pan: getVal(row, ['pan'])?.trim() || undefined,
                  address,
                  creditDays: getVal(row, ['creditdays']) ? parseInt(getVal(row, ['creditdays'])) : undefined,
                  creditLimit: getVal(row, ['creditlimit']) ? parseFloat(getVal(row, ['creditlimit'])) : undefined,
                  notes: getVal(row, ['notes'])?.trim() || undefined,
                  // Same atomic pattern the real "Add Udhar" flow uses
                  // (app/api/v1/customers/[id]/transactions/route.ts) — increment,
                  // don't overwrite, so re-importing doesn't clobber real activity.
                  ...(openingBalance > 0 ? { totalDue: { increment: openingBalance } } : {})
                }
              });
              customerId = existing.id;
              updated++;
            } else {
              const customer = await prisma.customer.create({
                data: {
                  shopId,
                  name: String(name).trim(),
                  mobile,
                  email: String(getVal(row, ['email']) || '').trim(),
                  customerType: getVal(row, ['customertype']) || 'customer',
                  shopName: getVal(row, ['shopname', 'businessname'])?.trim() || null,
                  gst: gst?.trim() || null,
                  pan: getVal(row, ['pan'])?.trim() || null,
                  address: address || null,
                  creditDays: parseInt(getVal(row, ['creditdays']) || 0),
                  creditLimit: parseFloat(getVal(row, ['creditlimit']) || 0),
                  notes: getVal(row, ['notes'])?.trim() || null,
                  totalDue: openingBalance,
                }
              });
              customerId = customer.id;
              existingCustomers.push({ id: customer.id, name: customer.name, mobile: customer.mobile });
              created++;
            }

            if (openingBalance > 0) {
              await prisma.customer_transactions.create({
                data: { customer_id: customerId, type: 'udhar', amount: openingBalance, note: 'Imported opening balance' }
              });
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [customers]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      case 'purchase': {
        if (auth.shop.packageType === 'dukan') {
          return NextResponse.json({ error: 'This feature is only available on the Vyapar and Udyog plans.' }, { status: 403 });
        }
        if (data.length === 0) break;
        const firstRow = data[0];
        const supplierName = getVal(firstRow, ['supplier', 'vendorname', 'vendor', 'suppliername']) || 'Unknown Supplier';
        const invoiceNumber = getVal(firstRow, ['invoicenumber', 'billnumber', 'invoice']) || `INV-${Date.now()}`;
        
        let billDate = new Date();
        const rawDate = getVal(firstRow, ['invoicedate', 'billdate', 'date']);
        if (rawDate) {
          const parsed = Date.parse(rawDate);
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

        // Live barcode -> productId index (same reasoning as the 'product' case
        // above): without this, two rows sharing a brand-new barcode both try
        // to create a product with that barcode and the second throws a Prisma
        // unique-constraint error that used to abort the whole import.
        const barcodeIndex = new Map<string, string>();
        const stockIndex = new Map<string, number>();
        for (const p of existingProducts) {
          if (p.barcode) barcodeIndex.set(p.barcode, p.id);
          stockIndex.set(p.id, p.currentStock || 0);
        }

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['productname', 'name', 'description', 'item']);
            const quantity = parseFloat(getVal(row, ['quantity', 'qty', 'stock']) || 0);
            const unitCost = parseFloat(getVal(row, ['unitcost', 'wholesalecost', 'cost', 'price', 'rate']) || 0);

            if (!name || quantity <= 0) { skipped++; continue; }

            const barcode = getVal(row, ['barcode', 'sku']);
            const barcodeStr = barcode ? String(barcode) : null;
            let matchId: string | null = barcodeStr ? barcodeIndex.get(barcodeStr) ?? null : null;
            if (!matchId) {
              const results = fuse.search(name);
              if (results.length > 0) matchId = results[0].item.id;
            }

            if (!matchId) {
              const newProduct = await prisma.product.create({
                data: {
                  shopId,
                  name: String(name),
                  barcode: barcodeStr ?? undefined,
                  baseUnit: getVal(row, ['unit']) || 'pcs',
                  wholesaleCost: unitCost,
                  sellingPrice: unitCost * 1.2,
                  mrp: unitCost * 1.25,
                  category: getVal(row, ['category']) || 'General',
                  currentStock: quantity,
                  metadata: getVal(row, ['size']) || getVal(row, ['color']) ? { size: getVal(row, ['size']), color: getVal(row, ['color']) } : {}
                }
              });
              matchId = newProduct.id;
              if (barcodeStr) barcodeIndex.set(barcodeStr, matchId);
              stockIndex.set(matchId, quantity);
              created++;
            } else {
              const newStock = (stockIndex.get(matchId) || 0) + quantity;
              await prisma.product.update({
                where: { id: matchId },
                data: {
                  wholesaleCost: unitCost,
                  currentStock: newStock
                }
              });
              stockIndex.set(matchId, newStock);
              updated++;
            }

            if (godownId && matchId) {
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
                gst: parseFloat(getVal(row, ['gst']) || 0)
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
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [${importType}]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }

        await prisma.purchaseInvoice.update({
          where: { id: purchaseInvoice.id },
          data: { totalCost: totalInvoiceCost }
        });
        break;
      }

      case 'stock': {
        // Opening Stock: creates the product if it doesn't already exist, then
        // sets currentStock to the row's quantity — a baseline/snapshot, not an
        // increment, so re-running the same file is idempotent. Shows up in both
        // Products (via product.create) and Stock (currentStock is what
        // LegacyStockUI/WholesaleStockUI read for non-godown shops).
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true, currentStock: true }
        });
        const fuse = new Fuse(existingProducts, { keys: ['name', 'barcode'], threshold: 0.3 });

        const barcodeIndex = new Map<string, string>();
        for (const p of existingProducts) if (p.barcode) barcodeIndex.set(p.barcode, p.id);

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['productname', 'name', 'description', 'item']);
            const quantity = parseFloat(getVal(row, ['quantity', 'stock', 'qty', 'openingstock']) || 0);
            if (!name) { skipped++; continue; }

            const barcode = getVal(row, ['barcode', 'sku']);
            const barcodeStr = barcode ? String(barcode) : null;
            let matchId: string | null = barcodeStr ? barcodeIndex.get(barcodeStr) ?? null : null;
            if (!matchId) {
              const results = fuse.search(name);
              if (results.length > 0) matchId = results[0].item.id;
            }

            const cost = parseFloat(getVal(row, ['costprice', 'wholesalecost', 'cost', 'purchaseprice']) || 0);
            const price = parseFloat(getVal(row, ['sellingprice', 'price', 'rate']) || 0);
            const category = getVal(row, ['category']) || 'General';
            const extras = getProductExtras(row);

            if (matchId) {
              await prisma.product.update({
                where: { id: matchId },
                data: { currentStock: quantity, ...extras }
              });
              updated++;
            } else {
              const minStock = getVal(row, ['minstock', 'minlevel']);
              const newProduct = await prisma.product.create({
                data: {
                  shopId,
                  name: String(name),
                  barcode: barcodeStr ?? undefined,
                  baseUnit: getVal(row, ['unit']) || 'pcs',
                  sellingPrice: price,
                  wholesaleCost: cost,
                  mrp: parseFloat(getVal(row, ['mrp']) || price),
                  category,
                  currentStock: quantity,
                  minStock: minStock ? parseFloat(minStock) : undefined,
                  metadata: getVal(row, ['size']) || getVal(row, ['color']) ? { size: getVal(row, ['size']), color: getVal(row, ['color']) } : {},
                  ...extras
                }
              });
              matchId = newProduct.id;
              if (barcodeStr) barcodeIndex.set(barcodeStr, matchId);
              created++;
            }

            if (godownId && matchId) {
              const existingGodownProd = await prisma.godownProduct.findUnique({
                where: { godownId_productId: { godownId, productId: matchId } }
              });
              if (existingGodownProd) {
                await prisma.godownProduct.update({
                  where: { godownId_productId: { godownId, productId: matchId } },
                  data: { quantity }
                });
              } else {
                await prisma.godownProduct.create({
                  data: { godownId, productId: matchId, quantity }
                });
              }
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [stock]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      case 'sales': {
        // Each row = one historical sale (one product, one line item). We do
        // NOT create products here — a sale for a product that doesn't exist
        // in the catalog is a data error, not something to silently invent.
        const existingProducts = await prisma.product.findMany({
          where: { shopId },
          select: { id: true, name: true, barcode: true }
        });
        const fuse = new Fuse(existingProducts, { keys: ['name', 'barcode'], threshold: 0.3 });
        const barcodeMap = new Map<string, string>();
        for (const p of existingProducts) if (p.barcode) barcodeMap.set(p.barcode, p.id);

        const usedInvoiceNumbers = new Set<string>(
          (await prisma.sale.findMany({ where: { shopId }, select: { invoice_number: true } }))
            .map(s => s.invoice_number).filter(Boolean) as string[]
        );

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const productName = getVal(row, ['productname', 'name', 'description', 'item']);
            const quantity = parseFloat(getVal(row, ['quantity', 'qty']) || 0);
            const price = parseFloat(getVal(row, ['sellingprice', 'price', 'rate', 'unitprice']) || 0);
            if (!productName || quantity <= 0) { skipped++; continue; }

            const barcode = getVal(row, ['barcode', 'sku']);
            const barcodeStr = barcode ? String(barcode) : null;
            let productId: string | null = barcodeStr ? barcodeMap.get(barcodeStr) ?? null : null;
            if (!productId) {
              const results = fuse.search(String(productName));
              if (results.length > 0) productId = results[0].item.id;
            }
            if (!productId) {
              skipped++;
              rowErrors.push(`Row ${i + 1}: Product "${productName}" not found in catalog — import it first via Product Catalog.`);
              continue;
            }

            const customerName = getVal(row, ['customername', 'customer', 'partyname', 'party']);
            const customerMobile = getVal(row, ['mobile', 'phone', 'customermobile']);
            let customerId: string | null = null;
            if (customerName) {
              let customer = await prisma.customer.findFirst({
                where: { shopId, name: { equals: String(customerName), mode: 'insensitive' } }
              });
              if (!customer) {
                customer = await prisma.customer.create({
                  data: { shopId, name: String(customerName), mobile: customerMobile ? String(customerMobile) : '' }
                });
              }
              customerId = customer.id;
            }

            let invoiceNumber = getVal(row, ['invoicenumber', 'billnumber', 'invoice']);
            invoiceNumber = invoiceNumber ? String(invoiceNumber) : `HIST-${Date.now()}-${i}`;
            if (usedInvoiceNumbers.has(invoiceNumber)) invoiceNumber = `${invoiceNumber}-${Date.now()}`;
            usedInvoiceNumbers.add(invoiceNumber);

            const rawDate = getVal(row, ['date', 'billdate', 'saledate']);
            let saleDate: Date | undefined;
            if (rawDate) {
              const parsed = Date.parse(rawDate);
              if (!isNaN(parsed)) saleDate = new Date(parsed);
            }

            const totalAmount = quantity * price;

            await prisma.sale.create({
              data: {
                shopId,
                customerId,
                totalAmount,
                totalProfit: 0,
                paymentType: getVal(row, ['paymenttype', 'paymentmode', 'mode']) || 'Cash',
                amountPaid: totalAmount,
                invoice_number: invoiceNumber,
                createdAt: saleDate,
                items: {
                  create: [{
                    productId,
                    unit: getVal(row, ['unit']) || 'pcs',
                    quantity,
                    pricePerUnit: price,
                    marginPerUnit: 0
                  }]
                }
              }
            });
            created++;
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [sales]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      case 'ledger': {
        // Opening balances for customers (and, for Udyog shops, suppliers) —
        // matched/created by name, balance recorded as a transaction so it
        // shows up in the party's ledger history, not just a silent number bump.
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          try {
            const name = getVal(row, ['partyname', 'name', 'customername', 'suppliername', 'party']);
            const balance = parseFloat(getVal(row, ['openingbalance', 'balance', 'amount']) || 0);
            if (!name || balance === 0) { skipped++; continue; }

            const partyType = String(getVal(row, ['type', 'partytype']) || 'customer').toLowerCase();
            const mobile = getVal(row, ['mobile', 'phone']);

            if (partyType === 'supplier') {
              if (auth.shop.subscriptionPlan !== 'wholesale') {
                skipped++;
                rowErrors.push(`Row ${i + 1}: Supplier ledger entries are only available on the Udyog plan.`);
                continue;
              }
              let supplier = await prisma.supplier.findFirst({
                where: { shopId, name: { equals: String(name), mode: 'insensitive' } }
              });
              if (!supplier) {
                supplier = await prisma.supplier.create({
                  data: { shopId, name: String(name), mobile: mobile ? String(mobile) : null, balance: 0 }
                });
                created++;
              } else {
                updated++;
              }
              await prisma.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: balance } } });
              await prisma.supplierTransaction.create({
                data: { supplierId: supplier.id, type: 'opening_balance', amount: balance, note: 'Imported opening balance' }
              });
            } else {
              let customer = await prisma.customer.findFirst({
                where: { shopId, name: { equals: String(name), mode: 'insensitive' } }
              });
              if (!customer) {
                customer = await prisma.customer.create({
                  data: { shopId, name: String(name), mobile: mobile ? String(mobile) : '' }
                });
                created++;
              } else {
                updated++;
              }
              await prisma.customer.update({ where: { id: customer.id }, data: { totalDue: { increment: balance } } });
              await prisma.customer_transactions.create({
                // 'udhar' (not 'opening_balance') — LedgerView.tsx specifically
                // checks for this type to render it as a credit/due-increase
                // ("Credit Bill", orange) rather than falling through to look
                // like a payment.
                data: { customer_id: customer.id, type: 'udhar', amount: balance, note: 'Imported opening balance' }
              });
            }
          } catch (rowErr: any) {
            console.error(`Import row ${i + 1} failed [ledger]:`, JSON.stringify(row), rowErr.message, rowErr.meta);
            skipped++;
            rowErrors.push(`Row ${i + 1}: ${rowErr.message || 'Failed to import'}`);
          }
        }
        break;
      }

      default:
        // Basic fallback handling
        skipped = data.length;
        break;
    }

    await prisma.activityLog.create({
      data: {
        shopId,
        userId: auth.user.uuid,
        action: 'import_completed',
        details: { importType, totalProcessed: data.length, created, updated, skipped, errorCount: rowErrors.length }
      }
    }).catch((e) => console.error('Failed to log import activity:', e));

    return NextResponse.json({
      summary: {
        totalProcessed: data.length,
        created,
        updated,
        skipped,
        rowErrors
      }
    });

  } catch (error: any) {
    console.error('Import execution error:', error);
    return NextResponse.json({ error: error.message || 'Failed to execute import' }, { status: 500 });
  }
}
