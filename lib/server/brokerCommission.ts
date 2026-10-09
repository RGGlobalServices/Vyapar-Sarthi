import prisma from '@/lib/server/prisma';
import { tagRows } from '@/lib/server/billTags';
import { setPurchaseBroker } from '@/lib/server/purchaseBroker';

export type BrokerKind = 'supplier' | 'customer';

/**
 * Find (or create) the Broker party by name and log the commission the mill owes them for one bill.
 * `kind` tags the entry: 'supplier' = arranged a purchase, 'customer' = arranged a sale. A broker can be both.
 * Commission is a payable to the broker — it never touches the supplier's / customer's balance.
 *
 * The broker's NAME on the bill is saved regardless of whether a commission was typed in — commission
 * is entered later, from the Broker page, once the broker states what they're owed. A sale already
 * carries this on dispatch_details.broker; a purchase has no such field, so it's written here instead.
 */
export async function logBrokerCommission(shopId: string, o: { name: string; commission?: any; billNumber: string; kind: BrokerKind; party?: string; purchaseInvoiceId?: string | null; challanId?: string | null }) {
  const name = String(o.name ?? '').trim().slice(0, 80);
  if (!name) return null;
  let broker = await prisma.customer.findFirst({ where: { shopId, customerType: 'broker', name: { equals: name, mode: 'insensitive' } } });
  if (!broker) broker = await prisma.customer.create({ data: { shopId, name, customerType: 'broker', brokerType: o.kind } as any });
  else if ((broker as any).brokerType && (broker as any).brokerType !== o.kind && (broker as any).brokerType !== 'both') await prisma.customer.update({ where: { id: broker.id }, data: { brokerType: 'both' } as any });
  else if (!(broker as any).brokerType) await prisma.customer.update({ where: { id: broker.id }, data: { brokerType: o.kind } as any });
  if (o.kind === 'supplier' && o.purchaseInvoiceId) await setPurchaseBroker(prisma, o.purchaseInvoiceId, name);
  const comm = parseFloat(String(o.commission ?? '').replace(/[₹,\s]/g, ''));
  if (isFinite(comm) && comm > 0) {
    const ce = await (prisma as any).commissionEntry.create({
      data: { shopId, brokerId: broker.id, type: 'charge', amount: comm, billNumber: o.billNumber, note: `${o.kind === 'supplier' ? 'Purchase' : 'Sale'} commission${o.party ? ` · ${o.party}` : ''}${o.billNumber ? ` · Bill #${o.billNumber}` : ''}` },
    });
    // Purchase broker (kind supplier) or Sale broker (kind customer), linked to its bill
    await tagRows(prisma as any, 'commission_entries', [ce.id], { direction: o.kind === 'supplier' ? 'purchase' : 'sale', purchaseInvoiceId: o.purchaseInvoiceId, challanId: o.challanId });
  }
  return broker.id;
}
