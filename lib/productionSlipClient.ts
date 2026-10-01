import api from '@/lib/api';
import type { ShopHeader } from '@/lib/pdf/professionalTemplate';

const TYPE_LABEL: Record<string, string> = { finished_good: 'Finished', by_product: 'By-product', wip: 'WIP', rejection: 'Rejected' };
const ORDER = ['finished_good', 'by_product', 'wip', 'rejection'];
const kg = (n: number) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');

/** Builds the Production Slip PDF of one closed run from what was actually booked, and downloads it. */
export async function downloadProductionSlip(batchId: string, shop: ShopHeader) {
  const { exportProductionSlipPDF } = await import('@/lib/pdf/productionSlip');
  const b = (await api.get(`/mill/batches/${batchId}`)).data;

  const outs: any[] = [...(b.outputs || [])].sort((a, c) => ORDER.indexOf(a.outputType) - ORDER.indexOf(c.outputType));
  const rows = outs.map((o) => ({
    label: `${TYPE_LABEL[o.outputType] || o.outputType}: ${o.name || ''}${o.notes ? ` (${o.notes})` : ''}`,
    quantity: kg(o.quantityKg),
    unit: 'kg',
  }));
  rows.push({ label: 'Waste / loss', quantity: kg(b.wastageKg), unit: 'kg' });
  const inputKg = Number(b.inputKg) || 0;
  if (inputKg > 0 && b.outputKg != null) rows.push({ label: 'Yield (finished ÷ input)', quantity: String(Math.round((Number(b.outputKg) / inputKg) * 1000) / 10), unit: '%' });

  const material = b.rawLot?.product?.name || String(b.notes || '').split(' · ')[0] || '-';
  const file = await exportProductionSlipPDF({
    shopInfo: shop,
    batchNumber: b.batchNumber,
    date: new Date(b.startedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    rawMaterial: material,
    inputQty: kg(inputKg),
    inputUnit: 'kg',
    operatorName: (b.stages || []).map((s: any) => s.operatorName).find(Boolean) || '-',
    startedAt: fmtDT(b.startedAt),
    closedAt: fmtDT(b.closedAt),
    outputs: rows,
    notes: b.notes || '',
  });

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
