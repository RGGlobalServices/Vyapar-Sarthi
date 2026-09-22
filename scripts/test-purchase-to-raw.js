/* eslint-disable */
/** Retroactive "Add to Raw Material" on a saved purchase + Already Added status — LIVE.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-purchase-to-raw.js */
(async () => {
  if (process.env.LIVE !== '1') { console.log('Set LIVE=1'); process.exit(0); }
  const { prisma, rec, retry, http, tenant, finish } = await require('./_mill_test_harness')('p2r');
  const A = await tenant('a');
  const post = (u, body) => http('POST', u, { ...A, body });

  // A NON-raw-material product on the same bill — the button must never appear for a plain product.
  const plain = await post('/api/v1/products', { name: 'Plain Product P2R', category: 'General', baseUnit: 'kg', currentStock: 0, sellingPrice: 10 });
  const sup = await post('/api/v1/suppliers', { name: 'P2R Supplier' });
  const supplierId = sup.json?.id;
  const purPlain = await post('/api/v1/purchases', { supplierId, invoiceNumber: 'P2R-PLAIN', date: '2026-09-22', items: [{ productId: plain.json?.id, quantity: 10, cost: 5 }] });
  const detPlain = await http('GET', `/api/v1/purchases/${purPlain.json?.invoice?.id}`, A);
  rec('non-mill item: hasRawMaterialItems false, no button expected', detPlain.json?.hasRawMaterialItems === false, 'false', String(detPlain.json?.hasRawMaterialItems));

  const prod = await post('/api/v1/products', { name: 'Raw Paddy P2R', category: 'Raw Material', millCategory: 'raw_material', baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
  const productId = prod.json?.id;
  const pur = await post('/api/v1/purchases', { supplierId, invoiceNumber: 'P2R-1', date: '2026-09-22', items: [{ productId, quantity: 100, cost: 20 }] });
  const invoiceId = pur.json?.invoice?.id;
  rec('purchase created', pur.status < 300 && !!invoiceId, '2xx', `${pur.status} ${pur.text.slice(0, 120)}`);

  const det0 = await http('GET', `/api/v1/purchases/${invoiceId}`, A);
  rec('raw item: this shop already auto-adds at creation (product is raw_material) -> shows Already Added immediately, no click needed', det0.json?.hasRawMaterialItems === true && det0.json?.rawMaterialAdded === true, 'true/true', JSON.stringify([det0.json?.hasRawMaterialItems, det0.json?.rawMaterialAdded]));

  const list = await http('GET', '/api/v1/purchases', A);
  const rows = Array.isArray(list.json) ? list.json : list.json?.data;
  const row = rows?.find((r) => r.invoiceNumber === 'P2R-1');
  rec('list endpoint carries the same flags', row?.hasRawMaterialItems === true && row?.rawMaterialAdded === true, 'true/true', JSON.stringify([row?.hasRawMaterialItems, row?.rawMaterialAdded]));

  // A raw-material product added to Raw Material AFTER the purchase was saved (simulates: product wasn't classed raw material yet at purchase time).
  const prod2 = await post('/api/v1/products', { name: 'Raw Wheat P2R (late)', category: 'General', baseUnit: 'kg', currentStock: 0, sellingPrice: 0 });
  const pur2 = await post('/api/v1/purchases', { supplierId, invoiceNumber: 'P2R-2', date: '2026-09-22', items: [{ productId: prod2.json?.id, quantity: 50, cost: 15 }] });
  const inv2 = pur2.json?.invoice?.id;
  await http('PATCH', `/api/v1/products/${prod2.json?.id}`, { ...A, body: { millCategory: 'raw_material' } });
  const detBefore = await http('GET', `/api/v1/purchases/${inv2}`, A);
  rec('reclassified after purchase: button should show (not yet added)', detBefore.json?.hasRawMaterialItems === true && detBefore.json?.rawMaterialAdded === false, 'true/false', JSON.stringify([detBefore.json?.hasRawMaterialItems, detBefore.json?.rawMaterialAdded]));

  const conv = await post(`/api/v1/purchases/${inv2}/to-raw-material`, {});
  rec('click Add to Raw Material: succeeds', conv.status === 200 && conv.json?.created === 1, 'ok', `${conv.status} ${JSON.stringify(conv.json)}`);

  const detAfter = await http('GET', `/api/v1/purchases/${inv2}`, A);
  rec('reopen after clicking: shows Already Added', detAfter.json?.rawMaterialAdded === true, 'true', String(detAfter.json?.rawMaterialAdded));

  const again = await post(`/api/v1/purchases/${inv2}/to-raw-material`, {});
  rec('button state matches server: a second click is correctly refused', again.status === 400 && again.json?.code === 'NOTHING_TO_CONVERT', '400', `${again.status} ${JSON.stringify(again.json)}`);

  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
