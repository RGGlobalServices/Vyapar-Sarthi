/* eslint-disable */
/** Purchase weight fields + bill photo + import weight columns — LIVE.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-purchase-weight-photo.js */
(async () => {
  if (process.env.LIVE !== '1') { console.log('Set LIVE=1'); process.exit(0); }
  const { prisma, rec, retry, http, tenant, finish } = await require('./_mill_test_harness')('wgt');
  const A = await tenant('a');
  const post = (u, body) => http('POST', u, { ...A, body });

  const prod = await post('/api/v1/products', { name: 'Paddy WGT', category: 'Raw Material', baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
  const sup = await post('/api/v1/suppliers', { name: 'WGT Supplier' });
  const supplierId = sup.json?.id;

  const pur = await post('/api/v1/purchases', { supplierId, invoiceNumber: 'WGT-1', date: '2026-09-22', items: [{ productId: prod.json?.id, quantity: 100, cost: 20 }], tareWeightKg: '820', grossWeightKg: '1620' });
  const invoiceId = pur.json?.invoice?.id;
  rec('purchase with tare/gross weight created', pur.status < 300 && !!invoiceId, '2xx', `${pur.status} ${pur.text.slice(0, 140)}`);

  const inv = await retry(() => prisma.purchaseInvoice.findUnique({ where: { id: invoiceId } }));
  rec('weights stored: tare 820, gross 1620', inv?.tareWeightKg === 820 && inv?.grossWeightKg === 1620, '820/1620', `${inv?.tareWeightKg}/${inv?.grossWeightKg}`);

  const det = await http('GET', `/api/v1/purchases/${invoiceId}`, A);
  rec('GET returns both weights (net = 800 computable client-side)', det.json?.tareWeightKg === 820 && det.json?.grossWeightKg === 1620, 'ok', JSON.stringify([det.json?.tareWeightKg, det.json?.grossWeightKg]));

  let edit = null;
  for (let a = 0; a < 3; a++) { edit = await http('PATCH', `/api/v1/purchases/${invoiceId}`, { ...A, body: { supplierId, invoiceNumber: 'WGT-1', date: '2026-09-22', items: [{ productId: prod.json?.id, quantity: 100, cost: 20 }], tareWeightKg: '830', grossWeightKg: '1630' } }); if (edit.status === 200) break; }
  const inv2 = await retry(() => prisma.purchaseInvoice.findUnique({ where: { id: invoiceId } }));
  rec('editing the purchase updates the weights', edit.status === 200 && inv2?.tareWeightKg === 830 && inv2?.grossWeightKg === 1630, 'ok', `${edit.status} ${edit.text.slice(0,300)}`);

  const patch2 = await http('PATCH', `/api/v1/suppliers/${supplierId}`, { ...A, body: { documents: [{ id: 'x1', url: 'https://example.com/bill.jpg', uploadedAt: new Date().toISOString(), name: 'weighbridge-slip.jpg', purchaseInvoiceId: invoiceId }] } });
  const sup2 = await retry(() => prisma.supplier.findUnique({ where: { id: supplierId } }));
  const docs = Array.isArray(sup2?.documents) ? sup2.documents : [];
  rec('bill photo attaches to the supplier, tagged with this purchase invoice', patch2.status === 200 && docs.some((d) => d.purchaseInvoiceId === invoiceId), 'ok', JSON.stringify(docs));

  // Import: Tare Weight / Gross Weight / Driver Charges columns land on the created purchase invoice.
  const rows = [{ supplier: 'WGT Import Supplier', invoiceNumber: 'WGT-IMP-1', invoiceDate: '2026-09-22', productName: 'Wheat WGT', quantity: 200, unit: 'kg', unitCost: 25, 'Tare Weight': 500, 'Gross Weight': 5500, 'Driver Charges': 400 }];
  const imp = await post('/api/v1/wholesale-import/execute', { importType: 'purchase', data: rows, supplier: { name: 'WGT Import Supplier' }, charges: [{ name: 'Driver Charges', amount: 400 }], existingPolicy: 'update', rowDecisions: ['create'], totalRows: 1 });
  rec('import: 200', imp.status === 200, '200', `${imp.status} ${imp.text.slice(0, 140)}`);
  const invImp = await retry(() => prisma.purchaseInvoice.findFirst({ where: { shopId: A.shopId, invoiceNumber: 'WGT-IMP-1' } }));
  rec('import stores tare 500 / gross 5500 on the invoice, and Driver Charges in charges', invImp?.tareWeightKg === 500 && invImp?.grossWeightKg === 5500 && Array.isArray(invImp?.charges) && invImp.charges.some((c) => c.name === 'Driver Charges' && c.amount === 400), 'ok', JSON.stringify([invImp?.tareWeightKg, invImp?.grossWeightKg, invImp?.charges]));

  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
