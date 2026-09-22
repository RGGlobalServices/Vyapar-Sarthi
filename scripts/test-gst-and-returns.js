/* eslint-disable */
/** GST lite-product fix + Purchase Returns history — LIVE.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-gst-and-returns.js */
(async () => {
  if (process.env.LIVE !== '1') { console.log('Set LIVE=1'); process.exit(0); }
  const { rec, http, tenant, finish } = await require('./_mill_test_harness')('gstr');
  const A = await tenant('a', 'vyapar');
  const post = (u, body) => http('POST', u, { ...A, body });

  const prod = await post('/api/v1/products', { name: 'GST Test Item', category: 'General', baseUnit: 'pcs', currentStock: 10, sellingPrice: 118, gstPercent: 18 });
  const lite = await http('GET', `/api/v1/products?q=GST%20Test&lite=true`, A);
  const row = (lite.json?.data || []).find((p) => p.id === prod.json?.id);
  rec('lite product search now returns gstPercent', row?.gstPercent === 18, '18', String(row?.gstPercent));

  const sup = await post('/api/v1/suppliers', { name: 'Return Test Supplier' });
  const pur = await post('/api/v1/purchases', { supplierId: sup.json?.id, invoiceNumber: 'RET-1', date: '2026-09-22', items: [{ productId: prod.json?.id, quantity: 5, cost: 50 }] });
  const invoiceId = pur.json?.invoice?.id;
  const ret = await post(`/api/v1/purchases/${invoiceId}/return`, { items: [{ productId: prod.json?.id, name: 'GST Test Item', quantity: 2, rate: 50 }] });
  rec('purchase return raised', ret.status === 200 || ret.status === 201, '2xx', String(ret.status));

  const hist = await http('GET', '/api/v1/purchases/returns', A);
  const found = (hist.json?.rows || []).find((r) => r.purchaseInvoice?.invoiceNumber === 'RET-1');
  rec('returns history lists it with supplier + date', hist.status === 200 && found?.supplier?.name === 'Return Test Supplier' && !!found?.date, 'ok', JSON.stringify(found));

  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
