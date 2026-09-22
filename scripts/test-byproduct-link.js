/* eslint-disable */
/** By-Product "Add to Products" — links/creates a Product and credits stock — LIVE.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-byproduct-link.js */
(async () => {
  if (process.env.LIVE !== '1') { console.log('Set LIVE=1'); process.exit(0); }
  const { prisma, rec, retry, http, tenant, finish } = await require('./_mill_test_harness')('bpl');
  const A = await tenant('a');
  const post = (u, body) => http('POST', u, { ...A, body });
  const patch = (u, body) => http('PATCH', u, { ...A, body });

  // An unlinked by-product (manual entry, no productId) — the common case: auto-created rows or a manual note with no product yet.
  const bp = await post('/api/v1/mill/by-products', { name: 'Rice Bran Link', quantityKg: 200, ratePerKg: 8, notes: 'test' });
  const bpId = bp.json?.id;
  rec('by-product created, unlinked', bp.status === 201 && !bp.json?.productId, '201/no product', `${bp.status} ${JSON.stringify(bp.json)}`);

  // Create a NEW product via linkProduct
  const link = await patch(`/api/v1/mill/by-products/${bpId}`, { linkProduct: { name: 'Rice Bran (from by-product)' } });
  rec('linkProduct creates a new product: 200', link.status === 200 && !!link.json?.productId, '200', `${link.status} ${JSON.stringify(link.json).slice(0,200)}`);

  const prod = await retry(() => prisma.product.findUnique({ where: { id: link.json.productId } }));
  rec('new product is by_product-classed with 200 kg stock', prod?.millCategory === 'by_product' && prod?.currentStock === 200, 'by_product/200', `${prod?.millCategory}/${prod?.currentStock}`);

  const mv = await retry(() => prisma.stockMovement.findFirst({ where: { shopId: A.shopId, productId: prod.id, type: 'byproduct_manual' } }));
  rec('a byproduct_manual stock movement was logged', !!mv && mv.quantity === 200, 'ok', JSON.stringify(mv));

  const again = await patch(`/api/v1/mill/by-products/${bpId}`, { linkProduct: { name: 'Should not work' } });
  rec('linking again is rejected (already linked)', again.status === 409 && again.json?.code === 'ALREADY_LINKED', '409', `${again.status} ${JSON.stringify(again.json)}`);

  // A by-product with some already sold — only the REMAINING kg is credited.
  const bp2 = await post('/api/v1/mill/by-products', { name: 'Husk Link', quantityKg: 100 });
  await patch(`/api/v1/mill/by-products/${bp2.json.id}`, { addSoldKg: 30 });
  const link2 = await patch(`/api/v1/mill/by-products/${bp2.json.id}`, { linkProduct: { name: 'Husk (from by-product)' } });
  const prod2 = await retry(() => prisma.product.findUnique({ where: { id: link2.json.productId } }));
  rec('remaining-only credited: 100 - 30 sold = 70 kg stock', prod2?.currentStock === 70, '70', String(prod2?.currentStock));

  // Link to an EXISTING product instead of creating one.
  const existingProd = await post('/api/v1/products', { name: 'Existing Bran Product', category: 'By-Products', millCategory: 'by_product', baseUnit: 'kg', currentStock: 50, sellingPrice: 5 });
  const bp3 = await post('/api/v1/mill/by-products', { name: 'More Bran', quantityKg: 40 });
  const link3 = await patch(`/api/v1/mill/by-products/${bp3.json.id}`, { linkProduct: { productId: existingProd.json.id } });
  const prod3 = await retry(() => prisma.product.findUnique({ where: { id: existingProd.json.id } }));
  rec('linking to an existing product adds onto its stock: 50 + 40 = 90', link3.status === 200 && prod3?.currentStock === 90, '90', `${link3.status} ${prod3?.currentStock}`);

  // Selling from the now-linked by-product reduces the product's stock (existing addSoldKg path, unaffected by this change).
  const sell = await patch(`/api/v1/mill/by-products/${bpId}`, { addSoldKg: 50 });
  const prodAfterSale = await retry(() => prisma.product.findUnique({ where: { id: prod.id } }));
  rec('selling from a newly-linked by-product reduces its product stock: 200 - 50 = 150', sell.status === 200 && prodAfterSale?.currentStock === 150, '150', `${sell.status} ${sell.text.slice(0,300)} stock=${prodAfterSale?.currentStock}`);

  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
