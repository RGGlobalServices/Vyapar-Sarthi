'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useRouter, useParams } from 'next/navigation';
import {
  FileText, Search, Printer, X, Truck, Scale, ArrowDownToLine,
  Receipt, ExternalLink, Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';

const fetcher = (u: string) => api.get(u).then((r) => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

type Tab = 'gate-pass' | 'weighbridge' | 'freight' | 'receipt';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'gate-pass', label: 'Gate Pass', icon: Truck },
  { id: 'weighbridge', label: 'Weighbridge Slip', icon: Scale },
  { id: 'freight', label: 'Freight Challan', icon: Truck },
  { id: 'receipt', label: 'Payment Receipt', icon: ArrowDownToLine },
];

// This hub is a print/reprint index over data that ALREADY exists elsewhere
// (Gate Entry, Weighbridge, Transport/Freight, Receipts each have their own
// full create/manage screens) — every list here is read-only, sourced from
// those same APIs, and its only job is producing a clean single-document
// printable for each row (a driver-facing gate pass, a weighbridge slip, a
// freight challan, a payment receipt) that nothing else in the app renders
// today (the existing pages only offer a bulk register PDF/Excel export).
export default function DocumentsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const [tab, setTab] = useState<Tab>('gate-pass');
  const [search, setSearch] = useState('');
  const [printDoc, setPrintDoc] = useState<{ type: Tab; row: any } | null>(null);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText size={22} className="text-blue-600" /> Documents
        </h1>
        <p className="text-sm text-slate-500 mt-1">Every printable document your mill hands out, in one place — reprint a gate pass, weighbridge slip, freight challan, or payment receipt anytime.</p>
      </div>

      {/* Deep-links to documents that already have proper printing elsewhere. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => router.push(`/${locale}/billing/invoices`)} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-400 transition-colors group text-left">
          <div className="flex items-center gap-3">
            <Receipt size={18} className="text-emerald-600" />
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">GST / Non-GST Invoice</p>
              <p className="text-xs text-slate-500">Reprint any past sale from Billing → Invoices</p>
            </div>
          </div>
          <ExternalLink size={14} className="text-slate-400 group-hover:text-emerald-500" />
        </button>
        <button onClick={() => router.push(`/${locale}/purchases`)} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-400 transition-colors group text-left">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-amber-600" />
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">Purchase Bill</p>
              <p className="text-xs text-slate-500">Reprint any farmer/supplier purchase from Purchases</p>
            </div>
          </div>
          <ExternalLink size={14} className="text-slate-400 group-hover:text-emerald-500" />
        </button>
      </div>

      <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex-wrap">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => { setTab(tb.id); setSearch(''); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors',
              tab === tb.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
            )}
          >
            <tb.icon size={13} /> {tb.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {tab === 'gate-pass' && <GatePassList activeShopId={activeShopId} search={search} onPrint={(row) => setPrintDoc({ type: 'gate-pass', row })} />}
      {tab === 'weighbridge' && <WeighbridgeList activeShopId={activeShopId} search={search} onPrint={(row) => setPrintDoc({ type: 'weighbridge', row })} />}
      {tab === 'freight' && <FreightList activeShopId={activeShopId} search={search} onPrint={(row) => setPrintDoc({ type: 'freight', row })} />}
      {tab === 'receipt' && <ReceiptList activeShopId={activeShopId} search={search} onPrint={(row) => setPrintDoc({ type: 'receipt', row })} />}

      {printDoc && <PrintModal type={printDoc.type} row={printDoc.row} onClose={() => setPrintDoc(null)} />}
    </div>
  );
}

// ─── List sub-components ────────────────────────────────────────────────────
function EmptyState({ label }: { label: string }) {
  return (
    <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
      <FileText size={36} className="mx-auto mb-3 opacity-30" />
      <p className="font-bold">No {label} yet</p>
    </div>
  );
}
function LoadingState() {
  return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>;
}
function DocTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

function GatePassList({ activeShopId, search, onPrint }: { activeShopId: string | null; search: string; onPrint: (r: any) => void }) {
  const { data, isLoading } = useSWR(activeShopId ? ['/mill/gate-entries', activeShopId] : null, ([u]) => fetcher(u));
  const rows = Array.isArray(data) ? data : [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r: any) => r.vehicleNumber?.toLowerCase().includes(needle) || r.entryNumber?.toLowerCase().includes(needle) || r.driverName?.toLowerCase().includes(needle));
  }, [rows, search]);

  if (isLoading) return <LoadingState />;
  if (filtered.length === 0) return <EmptyState label="gate entries" />;
  return (
    <DocTable>
      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
        <tr>
          <th className="px-4 py-3">Entry #</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Direction</th>
          <th className="px-4 py-3">Gate In</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Print</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((r: any) => (
          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td className="px-4 py-3 font-mono text-xs font-bold">{r.entryNumber}</td>
            <td className="px-4 py-3 font-bold">{r.vehicleNumber}</td>
            <td className="px-4 py-3 capitalize">{r.direction}</td>
            <td className="px-4 py-3 text-slate-500">{fmtDateTime(r.enteredAt)}</td>
            <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{r.status?.replace('_', ' ')}</span></td>
            <td className="px-4 py-3 text-right"><button onClick={() => onPrint(r)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><Printer size={15} /></button></td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  );
}

function WeighbridgeList({ activeShopId, search, onPrint }: { activeShopId: string | null; search: string; onPrint: (r: any) => void }) {
  const { data, isLoading } = useSWR(activeShopId ? ['/mill/weighbridge', activeShopId] : null, ([u]) => fetcher(u));
  const rows = Array.isArray(data) ? data : [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r: any) => r.vehicleNumber?.toLowerCase().includes(needle) || r.slipNumber?.toLowerCase().includes(needle));
  }, [rows, search]);

  if (isLoading) return <LoadingState />;
  if (filtered.length === 0) return <EmptyState label="weighbridge slips" />;
  return (
    <DocTable>
      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
        <tr>
          <th className="px-4 py-3">Slip #</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3 text-right">Net Wt (Kg)</th>
          <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Print</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((r: any) => (
          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td className="px-4 py-3 font-mono text-xs font-bold">{r.slipNumber}</td>
            <td className="px-4 py-3 font-bold">{r.vehicleNumber}</td>
            <td className="px-4 py-3 text-right">{r.netWeightKg ?? '—'}</td>
            <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{r.status?.replace('_', ' ')}</span></td>
            <td className="px-4 py-3 text-right"><button onClick={() => onPrint(r)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><Printer size={15} /></button></td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  );
}

function FreightList({ activeShopId, search, onPrint }: { activeShopId: string | null; search: string; onPrint: (r: any) => void }) {
  const { data, isLoading } = useSWR(activeShopId ? ['/logistics/freight', activeShopId] : null, ([u]) => fetcher(u));
  const transporters = data?.transporters || [];
  const byId = new Map(transporters.map((t: any) => [t.id, t]));
  const rows = (data?.entries || []).filter((e: any) => e.type === 'charge');
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r: any) => r.vehicleNumber?.toLowerCase().includes(needle) || (byId.get(r.transporterId) as any)?.name?.toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search]);

  if (isLoading) return <LoadingState />;
  if (filtered.length === 0) return <EmptyState label="freight charges" />;
  return (
    <DocTable>
      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
        <tr>
          <th className="px-4 py-3">Date</th><th className="px-4 py-3">Transporter</th><th className="px-4 py-3">Vehicle</th>
          <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Print</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((r: any) => (
          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td className="px-4 py-3 text-slate-500">{fmtDate(r.date)}</td>
            <td className="px-4 py-3 font-bold">{(byId.get(r.transporterId) as any)?.name || '—'}</td>
            <td className="px-4 py-3">{r.vehicleNumber || '—'}</td>
            <td className="px-4 py-3 text-right font-bold">{rupee(r.amount)}</td>
            <td className="px-4 py-3 text-right"><button onClick={() => onPrint({ ...r, transporterName: (byId.get(r.transporterId) as any)?.name })} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><Printer size={15} /></button></td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  );
}

function ReceiptList({ activeShopId, search, onPrint }: { activeShopId: string | null; search: string; onPrint: (r: any) => void }) {
  const { data, isLoading } = useSWR(activeShopId ? ['/crm/payments-all?entityType=party', activeShopId] : null, ([u]) => fetcher(u));
  const rows = data?.payments || [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r: any) => r.entityName?.toLowerCase().includes(needle) || r.billNumber?.toLowerCase().includes(needle));
  }, [rows, search]);

  if (isLoading) return <LoadingState />;
  if (filtered.length === 0) return <EmptyState label="payment receipts" />;
  return (
    <DocTable>
      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
        <tr>
          <th className="px-4 py-3">Date</th><th className="px-4 py-3">Party</th><th className="px-4 py-3">Bill #</th>
          <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Print</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((r: any) => (
          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
            <td className="px-4 py-3 text-slate-500">{fmtDate(r.date)}</td>
            <td className="px-4 py-3 font-bold">{r.entityName}</td>
            <td className="px-4 py-3 font-mono text-xs">{r.billNumber || '—'}</td>
            <td className="px-4 py-3 text-right font-bold">{rupee(r.amount)}</td>
            <td className="px-4 py-3 text-right"><button onClick={() => onPrint(r)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><Printer size={15} /></button></td>
          </tr>
        ))}
      </tbody>
    </DocTable>
  );
}

// ─── Print Modal ─────────────────────────────────────────────────────────────
function PrintModal({ type, row, onClose }: { type: Tab; row: any; onClose: () => void }) {
  const { profile } = useBusinessStore();
  const shopName = profile?.shopName || 'Your Mill';

  const titleMap: Record<Tab, string> = {
    'gate-pass': 'Gate Pass', weighbridge: 'Weighbridge Slip', freight: 'Freight Challan', receipt: 'Payment Receipt',
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8 print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4 print:shadow-none print:rounded-none print:max-w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 print:hidden">
          <h2 className="font-black text-lg text-slate-900">{titleMap[type]}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-900 rounded-lg text-sm font-bold"><Printer size={14} /> Print</button>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
          </div>
        </div>
        <div className="p-8 text-slate-900">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div>
              <h1 className="text-xl font-black">{shopName}</h1>
              <p className="text-xs text-slate-500 mt-1 uppercase">{titleMap[type]}</p>
            </div>
          </div>

          {type === 'gate-pass' && (
            <div className="space-y-3 text-sm">
              <Row label="Entry #" value={row.entryNumber} bold />
              <Row label="Direction" value={row.direction} className="capitalize" />
              <Row label="Vehicle Number" value={row.vehicleNumber} bold />
              <Row label="Driver" value={[row.driverName, row.driverMobile].filter(Boolean).join(' · ') || '—'} />
              <Row label="Supplier / Party" value={row.supplier?.name || row.party?.name || '—'} />
              <Row label="Material" value={row.materialDescription || '—'} />
              <Row label="Gate In" value={fmtDateTime(row.enteredAt)} />
              {row.exitedAt && <Row label="Gate Out" value={fmtDateTime(row.exitedAt)} />}
              <Row label="Status" value={row.status?.replace('_', ' ')} className="capitalize" />
              {row.notes && <Row label="Notes" value={row.notes} />}
            </div>
          )}

          {type === 'weighbridge' && (
            <div className="space-y-3 text-sm">
              <Row label="Slip #" value={row.slipNumber} bold />
              <Row label="Vehicle Number" value={row.vehicleNumber} bold />
              <Row label="Material" value={row.materialDescription || row.product?.name || '—'} />
              <Row label="Supplier" value={row.supplier?.name || '—'} />
              <div className="grid grid-cols-3 gap-3 py-2 border-y border-slate-200">
                <div><p className="text-xs text-slate-500">Gross Wt (Kg)</p><p className="font-black text-lg">{row.grossWeightKg ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Tare Wt (Kg)</p><p className="font-black text-lg">{row.tareWeightKg ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Net Wt (Kg)</p><p className="font-black text-lg text-emerald-600">{row.netWeightKg ?? '—'}</p></div>
              </div>
              {row.moisturePct != null && <Row label="Moisture %" value={`${row.moisturePct}%`} />}
              {row.ratePerKg != null && <Row label="Rate / Kg" value={rupee(row.ratePerKg)} />}
              <Row label="First Weighed" value={fmtDateTime(row.firstWeighedAt)} />
              {row.secondWeighedAt && <Row label="Second Weighed" value={fmtDateTime(row.secondWeighedAt)} />}
              <Row label="Status" value={row.status?.replace('_', ' ')} className="capitalize" />
            </div>
          )}

          {type === 'freight' && (
            <div className="space-y-3 text-sm">
              <Row label="Transporter" value={row.transporterName || '—'} bold />
              <Row label="Vehicle Number" value={row.vehicleNumber || '—'} />
              <Row label="Date" value={fmtDate(row.date)} />
              <Row label="Note" value={row.note || '—'} />
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-500">Freight Amount</span>
                <span className="text-2xl font-black">{rupee(row.amount)}</span>
              </div>
            </div>
          )}

          {type === 'receipt' && (
            <div className="space-y-3 text-sm">
              <Row label="Received From" value={row.entityName} bold />
              <Row label="Mobile" value={row.entityMobile || '—'} />
              <Row label="Against Bill #" value={row.billNumber || '—'} />
              <Row label="Date" value={fmtDate(row.date)} />
              <Row label="Note" value={row.note || '—'} />
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-500">Amount Received</span>
                <span className="text-2xl font-black text-emerald-600">{rupee(row.amount)}</span>
              </div>
              <div className="pt-8 flex justify-between items-end text-xs text-slate-500">
                <span>Revenue Stamp (if applicable)</span>
                <span className="border-t border-slate-400 pt-1 px-6">Signature</span>
              </div>
            </div>
          )}

          <p className="mt-8 text-[11px] text-slate-400 text-center">Generated by {shopName} via Vyapar Sarthi</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, className }: { label: string; value: any; bold?: boolean; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-4', className)}>
      <span className="text-slate-500">{label}</span>
      <span className={cn('text-right', bold && 'font-bold')}>{value ?? '—'}</span>
    </div>
  );
}
