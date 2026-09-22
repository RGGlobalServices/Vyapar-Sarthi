/* eslint-disable */
/** Maintenance / spare-part costs become Expenses — LIVE.  LIVE=1 BASE=http://127.0.0.1:3001 node scripts/test-maintenance-expense.js */
(async () => {
  if (process.env.LIVE !== '1') { console.log('Set LIVE=1'); process.exit(0); }
  const { prisma, rec, retry, http, tenant, finish } = await require('./_mill_test_harness')('mnt');
  const A = await tenant('a');
  const post = (u, body) => http('POST', u, { ...A, body });
  const m = await post('/api/v1/management/machines', { name: 'Huller 1' });
  const mid = m.json?.id;
  rec('machine created', m.status < 300 && !!mid, '2xx', `${m.status} ${m.text.slice(0, 100)}`);
  const r = await post('/api/v1/management/maintenance', { machineId: mid, description: 'Belt change', cost: 1200, paymentMethod: 'UPI' });
  rec('maintenance logged: 201', r.status === 201, '201', `${r.status} ${r.text.slice(0, 120)}`);
  const ex = await retry(() => prisma.expense.findMany({ where: { shopId: A.shopId, category: 'Machine Maintenance' } }));
  rec('an Expense (Machine Maintenance, 1200, UPI) was created', ex.length === 1 && ex[0].amount === 1200 && ex[0].paymentMode === 'UPI', 'ok', JSON.stringify(ex.map(e => [e.amount, e.paymentMode])));
  const cb = await retry(() => prisma.cashBook.count({ where: { shopId: A.shopId } }));
  rec('UPI payment did not touch the cash book', cb === 0, '0', String(cb));
  const r2 = await post('/api/v1/management/maintenance', { machineId: mid, description: 'Oil', cost: 300 });
  const cb2 = await retry(() => prisma.cashBook.count({ where: { shopId: A.shopId } }));
  rec('cash maintenance: expense + one cash-book outflow', r2.status === 201 && cb2 === 1, '1', `${r2.status} ${cb2}`);
  const sp = await post('/api/v1/management/spare-parts', { name: 'Bearing', quantity: 0, unitCost: 250 });
  const pid = sp.json?.id;
  const inn = await post(`/api/v1/management/spare-parts/${pid}/movements`, { type: 'in', quantity: 4 });
  const out = await post(`/api/v1/management/spare-parts/${pid}/movements`, { type: 'out', quantity: 1 });
  const sx = await retry(() => prisma.expense.findMany({ where: { shopId: A.shopId, category: 'Spare Parts' } }));
  rec('stock-in 4 x 250 = one Spare Parts expense of 1000; stock-out adds none', inn.status === 201 && out.status === 201 && sx.length === 1 && sx[0].amount === 1000, 'ok', JSON.stringify(sx.map(e => e.amount)));
  const up = await post(`/api/v1/management/spare-parts/${pid}/movements`, { type: 'in', quantity: 1, paymentMethod: 'UPI' });
  const ux = await retry(() => prisma.expense.findFirst({ where: { shopId: A.shopId, category: 'Spare Parts', paymentMode: 'UPI' } }));
  const cbn = await retry(() => prisma.cashBook.count({ where: { shopId: A.shopId } }));
  rec('UPI restock: expense mode UPI (250), no extra cash-book row', up.status === 201 && ux?.amount === 250 && cbn === 2, 'ok', `${up.status} ${ux?.amount} ${cbn}`);
  const s = await http('GET', '/api/v1/management/maintenance/summary', A);
  rec('summary: maintenance 1500, spare parts 1000, per-machine 1500 (2 visits)', s.json?.maintenanceTotal === 1500 && s.json?.sparePartsTotal === 1250 && s.json?.byMachine?.[0]?.cost === 1500 && s.json?.byMachine?.[0]?.visits === 2, 'ok', s.text.slice(0, 200));
  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
