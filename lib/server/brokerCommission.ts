import prisma from '@/lib/server/prisma';

export type BrokerKind = 'supplier' | 'customer';

/**
 * Find (or create) the Broker party by name and log the commission the mill owes them for one bill.
 * `kind` tags the entry: 'supplier' = arranged a purchase, 'customer' = arranged a sale. A broker can be both.
 * Commission is a payable to the broker — it never touches the supplier's / customer's balance.
 */
export async function logBrokerCommission(shopId: string, o: { name: string; commission?: any; billNumber: string; kind: BrokerKind; party?: string }) {
  const name = String(o.name ?? '').trim().slice(0, 80);
  if (!name) return null;
  let broker = await prisma.customer.findFirst({ where: { shopId, customerType: 'broker', name: { equals: name, mode: 'insensitive' } } });
  if (!broker) broker = await prisma.customer.create({ data: { shopId, name, customerType: 'broker', brokerType: o.kind } as any });
  else if ((broker as any).brokerType && (broker as any).brokerType !== o.kind && (broker as any).brokerType !== 'both') await prisma.customer.update({ where: { id: broker.id }, data: { brokerType: 'both' } as any });
  else if (!(broker as any).brokerType) await prisma.customer.update({ where: { id: broker.id }, data: { brokerType: o.kind } as any });
  const comm = parseFloat(String(o.commission ?? '').replace(/[₹,\s]/g, ''));
  if (isFinite(comm) && comm > 0) {
    await (prisma as any).commissionEntry.create({
      data: { shopId, brokerId: broker.id, type: 'charge', amount: comm, billNumber: o.billNumber, note: `[${o.kind === 'supplier' ? 'Supplier broker' : 'Customer broker'}] ${o.kind === 'supplier' ? 'Purchase' : 'Sale'} ${o.billNumber}${o.party ? ` — ${o.party}` : ''}` },
    });
  }
  return broker.id;
}
