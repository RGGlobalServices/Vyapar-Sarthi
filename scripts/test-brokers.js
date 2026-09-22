/* eslint-disable */
/** Broker commission + broker type — LIVE.  BASE=http://127.0.0.1:3001 node scripts/test-brokers.js */
(async () => {
  const { prisma, rec, retry, http, tenant, finish } = await require('./_mill_test_harness')('brk');
  const A = await tenant('a');
  const post = (u, body) => http('POST', u, { ...A, body });
  const r1 = await post('/api/v1/mill/broker-commission', { name: 'Ramesh Dalal', commission: '1500', billNumber: 'PUR-1', kind: 'supplier' });
  rec('purchase broker: 201', r1.status === 201, '201', `${r1.status} ${r1.text.slice(0, 120)}`);
  const r2 = await post('/api/v1/mill/broker-commission', { name: 'ramesh dalal', commission: 800, billNumber: 'INV-1', kind: 'customer', party: 'X' });
  const brokers = await retry(() => prisma.customer.findMany({ where: { shopId: A.shopId, customerType: 'broker' } }));
  rec('same name (any case) reuses ONE broker; type becomes both', r2.status === 201 && brokers.length === 1 && brokers[0].brokerType === 'both', '1 both', JSON.stringify(brokers.map(b => [b.name, b.brokerType])));
  const ents = await retry(() => prisma.commissionEntry.findMany({ where: { shopId: A.shopId }, orderBy: { createdAt: 'asc' } }));
  rec('two commission charges 1500 + 800, tagged supplier/customer', ents.length === 2 && ents[0].amount === 1500 && /^\[Supplier broker\]/.test(ents[0].note) && /^\[Customer broker\]/.test(ents[1].note), 'ok', JSON.stringify(ents.map(e => [e.amount, e.note])));
  const nb = await post('/api/v1/mill/broker-commission', { name: 'Only Name', billNumber: 'PUR-2', kind: 'supplier' });
  const b2 = await retry(() => prisma.customer.findFirst({ where: { shopId: A.shopId, name: 'Only Name' } }));
  rec('name without commission creates the broker, no entry', nb.status === 201 && b2?.brokerType === 'supplier' && (await prisma.commissionEntry.count({ where: { brokerId: b2.id } })) === 0, 'ok', String(nb.status));
  const bad = await post('/api/v1/mill/broker-commission', { name: '', billNumber: 'X' });
  rec('empty name rejected', bad.status === 400, '400', String(bad.status));
  const c = await post('/api/v1/crm/customers', { name: 'Typed Broker', customerType: 'broker', brokerType: 'customer', mobile: '9999999999' });
  console.log('CRM create', c.status, c.text.slice(0,200)); const cj = c.json; const cid = cj?.id || cj?.data?.id;
  const put = await http('PUT', `/api/v1/crm/customers/${cid}`, { ...A, body: { name: 'Typed Broker', customerType: 'broker', brokerType: 'both' } });
  const after = await retry(() => prisma.customer.findUnique({ where: { id: cid } }));
  rec('create+edit broker profile saves brokerType', c.status < 300 && put.status < 300 && after?.brokerType === 'both', 'both', `${c.status} ${put.status} ${after?.brokerType}`);
  await finish();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
