/* eslint-disable */
/** Job Work — LIVE API tests.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-jobwork.js */
(async () => {
  const { prisma, rec, retry, http, tenant, mk, stock, finish } = await require('./_mill_test_harness')('jw');
  const A = await tenant('a'), B = await tenant('b');
  const post = (u, body, t = A) => http('POST', u, { ...t, body });
  const patch = (u, body, t = A) => http('PATCH', u, { ...t, body });
  const cust = await retry(() => prisma.customer.create({ data: { shopId: A.shopId, name: 'Farmer Ram', mobile: '9000000041', totalDue: 0, customerType: 'party', creditLimit: 0 } }));
  const foreignCust = await retry(() => prisma.customer.create({ data: { shopId: B.shopId, name: 'Other', mobile: '9000000042', totalDue: 0, customerType: 'party', creditLimit: 0 } }));
  const paddy = await mk(A, 'Paddy', 'raw_material', 500), husk = await mk(A, 'Husk', 'by_product'), rice = await mk(A, 'Rice', 'finished_goods', 100);
  const snapshot = async () => ({ lots: await retry(() => prisma.rawMaterialLot.count({ where: { shopId: A.shopId } })), paddy: await stock(paddy.id), rice: await stock(rice.id) });
  const before = await snapshot();
  const newOrder = (o) => post('/api/v1/mill/job-work', { customerId: cust.id, materialDescription: 'Farmer paddy', inputWeightKg: 1000, ratePerKg: 2.5, outputDescription: 'Rice', ...o });

  // create
  let r = await newOrder({ orderNumber: 'JW-IN', notes: 'first' });
  const oIn = r.json;
  rec('create: order stored with customer, material, input 1,000 kg, rate ₹2.50, status received (no gate entry needed)', r.status === 201 && oIn.customerId === cust.id && oIn.inputWeightKg === 1000 && oIn.ratePerKg === 2.5 && oIn.status === 'received' && oIn.gateEntryId === null, '201', `${r.status} ${r.text.slice(0, 100)}`);
  rec('create: default fee basis is input, mill keeps husk/bran, no fee yet', oIn.feeBasis === 'input' && oIn.byproductRetainedByMill === true && oIn.feeAmount === null, 'ok', '');
  const gate = await post('/api/v1/mill/gate-entries', { vehicleNumber: 'MH12JW', materialDescription: 'paddy' });
  r = await newOrder({ orderNumber: 'JW-GATE', gateEntryId: gate.json?.id });
  rec('create: with an optional gate entry works too', r.status === 201 && r.json.gateEntryId === gate.json?.id, '201', `${r.status}`);
  for (const [nm, o] of [['zero weight', { inputWeightKg: 0 }], ['negative rate', { ratePerKg: -1 }], ['no material', { materialDescription: '' }]]) { r = await newOrder(o); rec(`create: ${nm} → 400`, r.status === 400, '400', String(r.status)); }
  r = await post('/api/v1/mill/job-work', { customerId: foreignCust.id, materialDescription: 'x', inputWeightKg: 5, ratePerKg: 1 });
  rec("create: another shop's customer → rejected", r.status >= 400 && r.status < 500, '4xx', String(r.status));
  r = await newOrder({ gateEntryId: '00000000-0000-0000-0000-000000000000' });
  rec('create: unknown gate entry → rejected', r.status >= 400 && r.status < 500, '4xx', String(r.status));
  const snapAfterCreate = await snapshot();
  rec('the customer\'s grain is NOT the mill\'s stock: no raw material lot, Paddy and Rice stock unchanged after creating orders', snapAfterCreate.lots === before.lots && snapAfterCreate.paddy === before.paddy && snapAfterCreate.rice === before.rice, 'unchanged', JSON.stringify(snapAfterCreate));

  // detail + preview
  let d = (await http('GET', `/api/v1/mill/job-work/${oIn.id}`, A)).json;
  rec('detail: server-calculated fee preview for an input-based order = 1,000 × 2.50 = ₹2,500', d.feeCalculated === 2500 && d.customer?.name === 'Farmer Ram', '2500', String(d.feeCalculated));
  rec("another shop cannot read this shop's order → 404", (await http('GET', `/api/v1/mill/job-work/${oIn.id}`, B)).status === 404, '404', '');

  // lifecycle
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 700 });
  rec('completing a RECEIVED order (skipping processing) → 409', r.status === 409 && r.json?.code === 'INVALID_STATUS', '409', `${r.status} ${r.json?.code}`);
  const [st1, st2] = await Promise.all([patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'start' }), patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'start' })]);
  rec('received → processing: two simultaneous starts give one 200 and one 409', [st1.status, st2.status].sort().join() === '200,409', '200,409', `${st1.status},${st2.status}`);
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'start' });
  rec('starting an order that is already processing → 409', r.status === 409, '409', String(r.status));
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'start' }, B);
  rec("another shop cannot advance this shop's order → 404", r.status === 404, '404', String(r.status));
  for (const bad of [0, -1, 'x']) { r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: bad }); rec(`complete with output ${JSON.stringify(bad)} → 400`, r.status === 400, '400', String(r.status)); }
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 1200 });
  rec('output larger than the input (1,200 > 1,000) → 400 MASS_BALANCE_MISMATCH', r.status === 400 && r.json?.code === 'MASS_BALANCE_MISMATCH', '400', `${r.status} ${r.json?.code}`);
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 700, byProducts: [{ name: 'Husk', quantityKg: 400 }] });
  rec('output + by-products above the input (700 + 400 > 1,000) → 400', r.status === 400 && r.json?.code === 'MASS_BALANCE_MISMATCH', '400', `${r.status}`);
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 700, feeAmount: 1, amountPaid: 99999 });
  rec('amount collected above the fee → 400 (and the client-sent feeAmount is ignored)', r.status === 400, '400', String(r.status));

  // complete: input basis, mill keeps husk/bran, linked product
  const custBefore = await retry(() => prisma.customer.findUnique({ where: { id: cust.id } }));
  const [c1, c2] = await Promise.all([
    patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 700, feeAmount: 1, byProducts: [{ name: 'Husk', quantityKg: 180, productId: husk.id }, { name: 'Bran', quantityKg: 50 }] }),
    patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 700, feeAmount: 1, byProducts: [{ name: 'Husk', quantityKg: 180, productId: husk.id }, { name: 'Bran', quantityKg: 50 }] }),
  ]);
  rec('two simultaneous completions → exactly one succeeds (no double charge)', [c1.status, c2.status].sort().join() === '200,409', '200,409', `${c1.status},${c2.status}`);
  const done = await retry(() => prisma.jobWorkOrder.findUnique({ where: { id: oIn.id } }));
  const custAfter = await retry(() => prisma.customer.findUnique({ where: { id: cust.id } }));
  rec('input-based fee computed by the server: 1,000 kg × ₹2.50 = ₹2,500 (client "feeAmount: 1" ignored); status completed; output 700 kg stored', done.status === 'completed' && done.feeAmount === 2500 && done.outputWeightKg === 700 && done.completedAt, '2500 / completed', `${done.feeAmount} ${done.status}`);
  rec('customer charged exactly once (+₹2,500) with one ledger row', (custAfter.totalDue - custBefore.totalDue) === 2500 && (await retry(() => prisma.customer_transactions.count({ where: { customer_id: cust.id, type: 'job_work', bill_number: 'JW-IN' } }))) === 1, '2500 / 1', `${custAfter.totalDue - custBefore.totalDue}`);
  const kept = await retry(() => prisma.byProduct.findMany({ where: { shopId: A.shopId, notes: { startsWith: 'Job work JW-IN' } } }));
  rec('mill keeps husk/bran: Husk 180 kg (linked) and Bran 50 kg become the mill\'s By-Products, source=job_work', kept.length === 2 && kept.some((k) => k.name === 'Husk' && k.quantityKg === 180) && (await http('GET', '/api/v1/mill/by-products', A)).json.filter((x) => x.source === 'job_work').length === 2, '2', String(kept.length));
  rec('only the kept by-product product gains stock (Husk +180); the customer\'s grain / main output (Paddy, Rice) did not change', (await stock(husk.id)) === 180 && (await stock(paddy.id)) === before.paddy && (await stock(rice.id)) === before.rice, 'husk 180', `${await stock(husk.id)}`);
  rec('still no raw material lot from job work', (await snapshot()).lots === before.lots, 'unchanged', '');
  r = await patch(`/api/v1/mill/job-work/${oIn.id}`, { action: 'complete', outputWeightKg: 700 });
  rec('completing a completed order again → 409', r.status === 409, '409', String(r.status));
  d = (await http('GET', `/api/v1/mill/job-work/${oIn.id}`, A)).json;
  rec('detail after completion: final fee ₹2,500 and the kept by-products listed', d.feeCalculated === 2500 && d.byProductsKept.length === 2, 'ok', '');

  // output-based fee, by-products go back to the customer
  const oOut = (await newOrder({ orderNumber: 'JW-OUT', feeBasis: 'output', byproductRetainedByMill: false, ratePerKg: 3 })).json;
  rec('output-based order: no fee can be quoted before the output is known', (await http('GET', `/api/v1/mill/job-work/${oOut.id}`, A)).json.feeCalculated === null, 'null', '');
  await patch(`/api/v1/mill/job-work/${oOut.id}`, { action: 'start' });
  const huskBefore = await stock(husk.id), byCount = await retry(() => prisma.byProduct.count({ where: { shopId: A.shopId } }));
  r = await patch(`/api/v1/mill/job-work/${oOut.id}`, { action: 'complete', outputWeightKg: 650, byProducts: [{ name: 'Husk', quantityKg: 200, productId: husk.id }] });
  const doneOut = await retry(() => prisma.jobWorkOrder.findUnique({ where: { id: oOut.id } }));
  rec('output-based fee: 650 kg × ₹3 = ₹1,950 (server-calculated)', r.status === 200 && doneOut.feeAmount === 1950, '1950', `${r.status} ${doneOut.feeAmount}`);
  rec('mill does NOT keep the husk/bran: no By-Product rows, Husk stock unchanged, and the return is noted on the order', (await retry(() => prisma.byProduct.count({ where: { shopId: A.shopId } }))) === byCount && (await stock(husk.id)) === huskBefore && /Returned to customer: Husk 200 kg/.test(doneOut.notes || ''), 'noted, no stock', `${doneOut.notes}`);

  // partial payment at completion
  const oPay = (await newOrder({ orderNumber: 'JW-PAY' })).json;
  await patch(`/api/v1/mill/job-work/${oPay.id}`, { action: 'start' });
  const c0 = await retry(() => prisma.customer.findUnique({ where: { id: cust.id } }));
  r = await patch(`/api/v1/mill/job-work/${oPay.id}`, { action: 'complete', outputWeightKg: 600, amountPaid: 1000 });
  const c3 = await retry(() => prisma.customer.findUnique({ where: { id: cust.id } }));
  rec('collecting ₹1,000 of the ₹2,500 fee at completion leaves ₹1,500 due', r.status === 200 && Math.round((c3.totalDue - c0.totalDue) * 100) / 100 === 1500, '1500', String(c3.totalDue - c0.totalDue));

  // dashboard counts + isolation
  const all = (await http('GET', '/api/v1/mill/job-work', A)).json;
  rec('list counts by status: received 1 (gate order), processing 0, completed 3', all.filter((o) => o.status === 'received').length === 1 && all.filter((o) => o.status === 'processing').length === 0 && all.filter((o) => o.status === 'completed').length === 3, '1/0/3', all.map((o) => o.status).join());
  rec("another shop's job-work list is empty", (await http('GET', '/api/v1/mill/job-work', B)).json.length === 0, '0', '');
  const neg = await retry(() => prisma.product.count({ where: { shopId: A.shopId, currentStock: { lt: 0 } } }));
  rec('no negative stock', neg === 0, '0', String(neg));
  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
