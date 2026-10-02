import api from '@/lib/api';
import type { ShopHeader } from '@/lib/pdf/professionalTemplate';

const TYPE_LABEL: Record<string, string> = { finished_good: 'Finished', by_product: 'By-product', wip: 'WIP', rejection: 'Rejected' };
const ORDER = ['finished_good', 'by_product', 'wip', 'rejection'];
const kg = (n: number) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');

/** The shape the slip needs — what the batch list already carries, or what the entry form has just saved. */
export type SlipBatch = {
  batchNumber: string;
  startedAt?: string | null;
  closedAt?: string | null;
  inputKg?: number | null;
  outputKg?: number | null;
  wastageKg?: number | null;
  notes?: string | null;
  rawLot?: { product?: { name?: string | null } | null } | null;
  stages?: Array<{ operatorName?: string | null }> | null;
  outputs?: Array<{ outputType: string; name?: string | null; quantityKg?: number | null; notes?: string | null }> | null;
};

/** Loads the PDF libraries in the background (call it when a screen that can print a slip opens), so the click itself is quick. */
export function warmUpSlip() {
  try {
    void import('jspdf');
    void import('jspdf-autotable');
    void import('@/lib/pdf/productionSlip');
  } catch { /* best effort */ }
}

async function buildAndDownload(b: SlipBatch, shop: ShopHeader) {
  const { exportProductionSlipPDF } = await import('@/lib/pdf/productionSlip');

  const outs = [...(b.outputs || [])].sort((a, c) => ORDER.indexOf(a.outputType) - ORDER.indexOf(c.outputType));
  const rows = outs.map((o) => ({
    label: `${TYPE_LABEL[o.outputType] || o.outputType}: ${o.name || ''}${o.notes ? ` (${o.notes})` : ''}`,
    quantity: kg(Number(o.quantityKg) || 0),
    unit: 'kg',
  }));
  rows.push({ label: 'Waste / loss', quantity: kg(Number(b.wastageKg) || 0), unit: 'kg' });
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
    operatorName: (b.stages || []).map((s) => s.operatorName).find(Boolean) || '-',
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

/** Slip from a batch object we already have (the history list, or the entry just saved): no request to the server at all. */
export async function downloadProductionSlipOf(batch: SlipBatch, shop: ShopHeader) {
  return buildAndDownload(batch, shop);
}

/** Slip by batch id: reads the batch from the server first (the slow way — only for callers that hold nothing but an id). */
export async function downloadProductionSlip(batchId: string, shop: ShopHeader) {
  const b = (await api.get(`/mill/batches/${batchId}`)).data;
  return buildAndDownload(b, shop);
}
