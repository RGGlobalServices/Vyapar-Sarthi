'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  Truck, Plus, Search, X, Printer, Receipt, Ban, Loader2,
  Package, User, ChevronDown, ChevronUp, MapPin, Navigation,
  FileText, Hash, Calendar, ArrowRight, RotateCcw, ArrowUpRight,
} from 'lucide-react';
import api from '@/lib/api';
import { cn, fmtDate } from '@/lib/utils';
import { performSmartSearch } from '@/lib/smartSearch';
import { useBusinessStore } from '@/lib/businessStore';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { useConfirm } from '@/components/ConfirmDialog';

// ── Types ────────────────────────────────────────────────────────────────────

type ChallanItem = {
  id?: string;
  productId: string;
  name: string;
  baseUnit: string;      // product's own base unit (never changes)
  unit: string;          // dispatch unit (user can switch per item)
  variantKey?: string | null;
  quantity: number;      // in dispatch unit; for Bag = noOfPacks × packSize
  price: number;         // per dispatch unit
  lotId?: string | null;
  lotNumber?: string | null;
  godown?: string | null;
  packSize?: number | null;    // bag/bundle size in baseUnit (e.g. 50 Kg)
  noOfPacks?: number | null;   // number of bags/bundles
  totalWeight?: number | null; // Kg equivalent (informational)
};

type Challan = {
  id: string;
  challanNumber: string;
  challanDate?: string | null;
  status: 'open' | 'invoiced' | 'cancelled' | 'returned';
  dispatchType?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
  customerAddress?: string | null;
  dispatchFrom?: string | null;
  transporter?: string | null;
  transporterId?: string | null;
  freightAmount?: number | null;
  transporterCustomer?: { id: string; name: string; mobile: string | null } | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverMobile?: string | null;
  lrNumber?: string | null;
  jobWorkOrderRef?: string | null;
  eWayBillNo?: string | null;
  expectedInvoiceDate?: string | null;
  notes?: string | null;
  createdAt: string;
  invoicedAt?: string | null;
  items: ChallanItem[];
};

type Lot = {
  id: string;
  lotNumber: string;
  availableQuantity: number;
  unit: string;
  godownId?: string | null;
  godown?: { name: string } | null;
  packs?: Array<{ packKg: number; packs: number; packType: string }>;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// ── Unit system ──────────────────────────────────────────────────────────────
// Single source of truth for dispatch units — add/remove here and everything
// (UI fields, conversions, print view) updates automatically.
type UnitKind = 'weight' | 'pack' | 'volume' | 'count';
type UnitDef = { label: string; kind: UnitKind; toKg?: number };

const UNIT_DEFS: Record<string, UnitDef> = {
  Kg:      { label: 'Kg',      kind: 'weight', toKg: 1 },
  Quintal: { label: 'Quintal', kind: 'weight', toKg: 100 },
  Ton:     { label: 'Ton',     kind: 'weight', toKg: 1000 },
  Bag:     { label: 'Bag',     kind: 'pack' },
  Bundle:  { label: 'Bundle',  kind: 'pack' },
  Gunny:   { label: 'Gunny',   kind: 'pack' },
  Piece:   { label: 'Piece',   kind: 'count' },
  Litre:   { label: 'Litre',   kind: 'volume' },
};
const ALL_UNITS = Object.keys(UNIT_DEFS);

function unitDef(u: string): UnitDef {
  return UNIT_DEFS[u] || { label: u, kind: 'count' };
}

// For a cart item compute the canonical quantity (in dispatch unit) and totalWeight
function computeItemTotals(it: ChallanItem): { quantity: number; totalWeight: number | null } {
  const def = unitDef(it.unit);
  if (def.kind === 'pack') {
    const bags = Number(it.noOfPacks) || 0;
    const size = Number(it.packSize) || 0;
    return { quantity: bags, totalWeight: bags * size || null };
  }
  if (def.toKg && def.toKg > 1) {
    const qty = Number(it.quantity) || 0;
    return { quantity: qty, totalWeight: qty * def.toKg };
  }
  return { quantity: Number(it.quantity) || 0, totalWeight: null };
}

const DISPATCH_TYPES = [
  { value: 'sale',       label: 'Sale' },
  { value: 'job_work',   label: 'Job Work' },
  { value: 'sample',     label: 'Sample' },
  { value: 'transfer',   label: 'Transfer' },
  { value: 'return',     label: 'Return' },
  { value: 'other',      label: 'Other' },
];

const STATUS_STYLE: Record<string, string> = {
  open:      'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  invoiced:  'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
  returned:  'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

const DISPATCH_COLOR: Record<string, string> = {
  sale:     'text-emerald-600',
  job_work: 'text-blue-600',
  sample:   'text-purple-600',
  transfer: 'text-orange-600',
  return:   'text-red-500',
  other:    'text-slate-500',
};

function challanTotal(c: Challan) {
  return c.items.reduce((s, it) => s + it.quantity * it.price, 0);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChallansPage() {
  const router  = useRouter();
  const locale  = useLocale();
  const { profile } = useBusinessStore();
  const [confirmAsync, confirmDialog] = useConfirm();
  const [challans, setChallans]         = useState<Challan[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'invoiced' | 'cancelled' | 'returned'>('all');
  const [search, setSearch]             = useState('');
  const [showNew, setShowNew]           = useState(false);
  const [printChallan, setPrintChallan] = useState<Challan | null>(null);
  const [busyId, setBusyId]             = useState<string | null>(null);
  const [dateFilter, setDateFilter]     = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await api.get(`/challans?${params.toString()}`);
      setChallans(Array.isArray(res.data) ? res.data : []);
    } catch { setChallans([]); }
    finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const filteredChallans = useMemo(() => {
    if (dateFilter === 'all') return challans;
    const now = new Date();
    const todayYmd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return challans.filter(c => {
      const ymd = new Date(c.challanDate || c.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (dateFilter === 'today') return ymd === todayYmd;
      if (dateFilter === 'week') {
        const d = new Date(c.challanDate || c.createdAt);
        const diff = (now.getTime() - d.getTime()) / 86400000;
        return diff >= 0 && diff < 7;
      }
      if (dateFilter === 'month') return ymd.slice(0, 7) === todayYmd.slice(0, 7);
      if (dateFilter === 'custom') {
        if (customFrom && ymd < customFrom) return false;
        if (customTo && ymd > customTo) return false;
        return true;
      }
      return true;
    });
  }, [challans, dateFilter, customFrom, customTo]);

  const openTotal = useMemo(
    () => filteredChallans.filter(c => c.status === 'open').reduce((s, c) => s + challanTotal(c), 0),
    [filteredChallans],
  );

  const handleCancel = async (c: Challan) => {
    if (!(await confirmAsync(`Cancel challan ${c.challanNumber}? Stock will be restored.`, { okLabel: 'Cancel challan', cancelLabel: 'Keep it' }))) return;
    setBusyId(c.id);
    try {
      await api.patch(`/challans/${c.id}`, { action: 'cancel' });
      load();
    } catch { alert('Failed to cancel challan.'); }
    finally { setBusyId(null); }
  };

  const handleReturn = async (c: Challan) => {
    const msg = c.status === 'invoiced'
      ? `Return challan ${c.challanNumber}? This challan was already invoiced — stock will be added back to inventory. The linked invoice is NOT automatically reversed.`
      : `Return challan ${c.challanNumber}? All dispatched stock will be added back to inventory.`;
    if (!confirm(msg)) return;
    setBusyId(c.id);
    try {
      await api.patch(`/challans/${c.id}`, { action: 'return' });
      load();
    } catch { alert('Failed to process return.'); }
    finally { setBusyId(null); }
  };

  const handleDispatch = async (c: Challan) => {
    setBusyId(c.id);
    try {
      const res = await api.patch(`/challans/${c.id}`, { action: 'dispatch' });
      const dispatchNumber = res.data?.dispatch?.dispatchNumber;
      if (dispatchNumber) {
        if (confirm(`Dispatch entry created: ${dispatchNumber}\n\nOpen the Dispatch log to view it?`)) {
          router.push(`/${locale}/dispatch`);
        }
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create dispatch entry.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConvertToInvoice = (c: Challan) => {
    sessionStorage.setItem('pendingChallanInvoice', JSON.stringify(c));
    router.push(`/${locale}/billing`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      {confirmDialog}
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck className="text-emerald-500" size={28} /> Delivery Challans
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Dispatch goods now, raise the GST invoice later — stock moves the moment a challan is created.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus size={18} /> New Challan
        </button>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'today', 'week', 'month'] as const).map(d => (
          <button
            key={d}
            onClick={() => { setDateFilter(d); setCustomFrom(''); setCustomTo(''); }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
              dateFilter === d ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
            )}
          >
            {d === 'all' ? 'All Time' : d === 'today' ? 'Today' : d === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
        <input
          type="date" value={customFrom}
          onChange={e => { setCustomFrom(e.target.value); setDateFilter('custom'); }}
          className={cn('px-2 py-1.5 rounded-lg text-xs font-semibold border outline-none transition-colors',
            dateFilter === 'custom' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950')}
        />
        <span className="text-xs text-slate-400">–</span>
        <input
          type="date" value={customTo}
          onChange={e => { setCustomTo(e.target.value); setDateFilter('custom'); }}
          className={cn('px-2 py-1.5 rounded-lg text-xs font-semibold border outline-none transition-colors',
            dateFilter === 'custom' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950')}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Challans</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{filteredChallans.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Open</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{filteredChallans.filter(c => c.status === 'open').length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Open Value</p>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">₹{openTotal.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {(['all', 'open', 'invoiced', 'returned', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors',
                statusFilter === s ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search challan # or party"
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>
      ) : filteredChallans.length === 0 ? (
        <div className="p-16 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Truck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">{challans.length === 0 ? 'No delivery challans yet' : 'No challans match the selected filters'}</p>
          {challans.length === 0 && <p className="text-sm mt-1">Create one when goods go out before the formal invoice.</p>}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Challan #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Purpose</th>
                  <th className="px-4 py-3 text-center">Items</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredChallans.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{c.challanNumber}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {fmtDate(c.challanDate || c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{c.customerName || '—'}</p>
                      {c.transporterCustomer && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          🚛 {c.transporterCustomer.name}
                          {c.freightAmount ? ` · ₹${c.freightAmount.toLocaleString('en-IN')}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.dispatchType && (
                        <span className={cn('text-xs font-bold capitalize', DISPATCH_COLOR[c.dispatchType] || 'text-slate-500')}>
                          {DISPATCH_TYPES.find(d => d.value === c.dispatchType)?.label || c.dispatchType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">{c.items.length}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                      ₹{challanTotal(c).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-1 rounded-full text-[10px] font-bold uppercase', STATUS_STYLE[c.status])}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setPrintChallan(c)} title="Print" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                          <Printer size={15} />
                        </button>
                        {(c.status === 'open' || c.status === 'invoiced') && (
                          <button
                            onClick={() => handleDispatch(c)}
                            disabled={busyId === c.id}
                            title="Log to Dispatch"
                            className="p-2 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                          >
                            {busyId === c.id ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={15} />}
                          </button>
                        )}
                        {c.status === 'open' && (
                          <>
                            <button
                              onClick={() => handleConvertToInvoice(c)}
                              disabled={busyId === c.id}
                              title="Convert to Invoice"
                              className="p-2 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            >
                              <Receipt size={15} />
                            </button>
                            <button
                              onClick={() => handleReturn(c)}
                              disabled={busyId === c.id}
                              title="Return Stock"
                              className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            >
                              {busyId === c.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                            </button>
                            <button
                              onClick={() => handleCancel(c)}
                              disabled={busyId === c.id}
                              title="Cancel"
                              className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/10 text-red-500"
                            >
                              <Ban size={15} />
                            </button>
                          </>
                        )}
                        {c.status === 'invoiced' && (
                          <button
                            onClick={() => handleReturn(c)}
                            disabled={busyId === c.id}
                            title="Return Stock (reverse dispatch)"
                            className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          >
                            {busyId === c.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && (
        <NewChallanModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      )}
      {printChallan && (
        <PrintChallanModal
          challan={printChallan}
          shopName={profile?.shopName || 'Your Shop'}
          onClose={() => setPrintChallan(null)}
        />
      )}
    </div>
  );
}

// ── Section header helper ─────────────────────────────────────────────────────

function Section({
  icon, title, collapsible = false, defaultOpen = true, children,
}: {
  icon: React.ReactNode; title: string; collapsible?: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50',
          collapsible && 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800',
        )}
      >
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {icon}{title}
        </div>
        {collapsible && (open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />)}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div className={half ? 'flex-1 min-w-[140px]' : ''}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-100 placeholder:text-slate-400';
const selectCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-slate-100';

// ── New Challan Modal ─────────────────────────────────────────────────────────

function NewChallanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  type Party = { id: string; name: string; mobile?: string; address?: string };
  const isMill = isMillBillingPackage(useBusinessStore().profile?.packageType);
  // Bada Udyog only: this challan is a SALE, so its hamali and broker are saved as Sale hamali / Sale broker
  const [hamaliAmount, setHamaliAmount] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [brokerCommission, setBrokerCommission] = useState('');
  // Bada Udyog: start from a bill that is already made — its stock is already out, so this challan takes none and is limited to what is left to deliver
  const [fromInv, setFromInv] = useState<{ saleId: string; invoiceNumber: string; lines: any[] } | null>(null);
  const [invNo, setInvNo] = useState('');
  const [invBusy, setInvBusy] = useState(false);
  const [invErr, setInvErr] = useState('');

  // Basic
  const [challanDate, setChallanDate]     = useState(new Date().toISOString().slice(0, 10));
  const [dispatchType, setDispatchType]   = useState('sale');

  // Party
  const [parties, setParties]             = useState<Party[]>([]);
  const [partySearch, setPartySearch]     = useState('');
  const [showPartyDrop, setShowPartyDrop] = useState(false);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const partyInputRef = useRef<HTMLInputElement>(null);

  // Items
  const [products, setProducts]           = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDrop, setShowProdDrop]= useState(false);
  const [cartItems, setCartItems]         = useState<ChallanItem[]>([]);
  const [lotsByProduct, setLotsByProduct] = useState<Record<string, Lot[]>>({});
  const prodInputRef = useRef<HTMLInputElement>(null);

  // Transport
  const [transporters, setTransporters]   = useState<Party[]>([]);
  const [transporterId, setTransporterId] = useState('');
  const [freightAmount, setFreightAmount] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName]       = useState('');
  const [driverMobile, setDriverMobile]   = useState('');
  const [lrNumber, setLrNumber]           = useState('');

  // Dispatch
  const [dispatchFrom, setDispatchFrom]   = useState('');

  // Reference
  const [jobWorkOrderRef, setJobWorkOrderRef]           = useState('');
  const [eWayBillNo, setEWayBillNo]                     = useState('');
  const [expectedInvoiceDate, setExpectedInvoiceDate]   = useState('');

  // Notes / form
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/crm/customers?type=all').then(r => setParties(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get('/products?isRawMaterial=false').then(r => setProducts(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {});
    api.get('/crm/customers?type=transporter').then(r => setTransporters(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // Fetch lots for a product if not already loaded
  const fetchLots = useCallback(async (productId: string) => {
    if (lotsByProduct[productId] !== undefined) return;
    try {
      const res = await api.get(`/mill/finished-goods?productId=${productId}&status=AVAILABLE&limit=50`);
      const lots: Lot[] = (res.data?.lots || res.data?.data || res.data || []).filter((l: Lot) => l.availableQuantity > 0);
      setLotsByProduct(prev => ({ ...prev, [productId]: lots }));
    } catch {
      setLotsByProduct(prev => ({ ...prev, [productId]: [] }));
    }
  }, [lotsByProduct]);

  const productResults = useMemo(() => {
    if (productSearch.trim().length < 2) return [];
    return performSmartSearch(products, productSearch).slice(0, 10);
  }, [products, productSearch]);

  const addItem = (p: any) => {
    const base = p.baseUnit || p.base_unit || 'Kg';
    setCartItems(prev => {
      if (prev.find(it => it.productId === p.id)) return prev;
      return [...prev, {
        productId: p.id,
        name: p.name,
        baseUnit: base,
        unit: base,
        quantity: 1,
        price: Number(p.sellingPrice ?? p.selling_price) || 0,
        lotId: null,
        lotNumber: null,
        godown: '',
        packSize: null,
        noOfPacks: null,
        totalWeight: null,
      }];
    });
    fetchLots(p.id);
    setProductSearch('');
    setShowProdDrop(false);
  };

  const updateItem = (idx: number, patch: Partial<ChallanItem>) => {
    setCartItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, ...patch };
      // Auto-fill lot details when lot selected
      if (patch.lotId) {
        const lots = lotsByProduct[it.productId] || [];
        const lot = lots.find(l => l.id === patch.lotId);
        if (lot) {
          updated.lotNumber = lot.lotNumber;
          if (lot.godown?.name && !updated.godown) updated.godown = lot.godown.name;
        }
      }
      if (patch.lotId === '') { updated.lotId = null; updated.lotNumber = null; }
      // When unit changes, reset pack fields
      if (patch.unit && patch.unit !== it.unit) {
        updated.packSize = null; updated.noOfPacks = null; updated.totalWeight = null;
      }
      // Auto-calc totalWeight for pack units
      const def = unitDef(updated.unit);
      if (def.kind === 'pack') {
        const bags = Number(updated.noOfPacks) || 0;
        const size = Number(updated.packSize) || 0;
        updated.quantity = bags;
        updated.totalWeight = bags * size || null;
      } else if (def.toKg && def.toKg > 1) {
        updated.totalWeight = (Number(updated.quantity) || 0) * def.toKg || null;
      }
      return updated;
    }));
  };

  const loadFromInvoice = async () => {
    const no = invNo.trim();
    if (!no) return;
    setInvBusy(true); setInvErr('');
    try {
      const bill = await api.get(`/billing/${encodeURIComponent(no)}`);
      const id = bill.data?.id;
      if (!id) throw new Error('Invoice not found');
      const res = await api.get(`/challans/from-invoice/${id}`);
      const d = res.data;
      const lines = (d.items || []).filter((l: any) => l.remainingQty > 0);
      if (lines.length === 0) { setInvErr('Everything on this invoice is already on challans.'); return; }
      setFromInv({ saleId: d.saleId, invoiceNumber: d.invoiceNumber, lines: d.items });
      if (d.customer) setSelectedParty({ id: d.customer.id, name: d.customer.name, mobile: d.customer.mobile, address: d.customer.address });
      setCartItems(lines.map((l: any) => ({
        productId: l.productId, name: l.name, baseUnit: l.unit, unit: l.unit, quantity: l.remainingQty, price: l.price,
        lotId: null, lotNumber: null, godown: '', packSize: null, noOfPacks: null, totalWeight: null,
      })));
    } catch (err: any) {
      setInvErr(err?.response?.data?.error || err?.message || 'Could not load the invoice.');
    } finally {
      setInvBusy(false);
    }
  };

  const clearFromInvoice = () => { setFromInv(null); setCartItems([]); setSelectedParty(null); setInvNo(''); };

  const removeItem = (idx: number) => setCartItems(prev => prev.filter((_, i) => i !== idx));

  const total = cartItems.reduce((s, it) => {
    const def = unitDef(it.unit);
    const qty = def.kind === 'pack' ? (Number(it.noOfPacks) || 0) : (Number(it.quantity) || 0);
    return s + qty * it.price;
  }, 0);

  const handleSave = async () => {
    if (!selectedParty) { setError('Please select a party.'); return; }
    if (cartItems.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        ...(fromInv ? { fromSaleId: fromInv.saleId } : {}),
        customerId: selectedParty.id,
        customerName: selectedParty.name,
        customerMobile: selectedParty.mobile,
        customerAddress: selectedParty.address,
        challanDate,
        dispatchType,
        dispatchFrom: dispatchFrom.trim() || undefined,
        transporterId: transporterId || undefined,
        freightAmount: freightAmount ? Number(freightAmount) : undefined,
        ...(isMill ? { hamaliAmount: hamaliAmount ? Number(hamaliAmount) : undefined, brokerName: brokerName.trim() || undefined, brokerCommission: brokerCommission ? Number(brokerCommission) : undefined } : {}),
        vehicleNumber: vehicleNumber.trim() || undefined,
        driverName: driverName.trim() || undefined,
        driverMobile: driverMobile.trim() || undefined,
        lrNumber: lrNumber.trim() || undefined,
        jobWorkOrderRef: jobWorkOrderRef.trim() || undefined,
        eWayBillNo: eWayBillNo.trim() || undefined,
        expectedInvoiceDate: expectedInvoiceDate || undefined,
        notes: notes.trim() || undefined,
        items: cartItems.map(it => {
          const def = unitDef(it.unit);
          const isPack = def.kind === 'pack';
          return {
            productId: it.productId,
            name: it.name,
            unit: it.unit,
            variantKey: it.variantKey || undefined,
            quantity: isPack ? (Number(it.noOfPacks) || 0) : (Number(it.quantity) || 0),
            price: it.price,
            lotId: it.lotId || undefined,
            lotNumber: it.lotNumber || undefined,
            godown: it.godown?.trim() || undefined,
            packSize: it.packSize ?? undefined,
            noOfPacks: it.noOfPacks ?? undefined,
            totalWeight: it.totalWeight ?? undefined,
          };
        }),
      };
      try {
        await api.post('/challans', payload);
      } catch (e: any) {
        // not enough stock: tell the user and let them go ahead on purpose
        if (e?.response?.data?.code !== 'INSUFFICIENT_STOCK') throw e;
        if (!window.confirm(`${e.response.data.error}\n\nCreate this challan anyway? Stock will go below zero.`)) { setSaving(false); return; }
        await api.post('/challans', { ...payload, force: true });
      }
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save challan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Truck size={18} className="text-emerald-500" /> New Delivery Challan
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

          {isMill && (
            <Section icon={<FileText size={13} />} title="Start from an invoice (optional)">
              {fromInv ? (
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-sm">
                  <span className="font-bold text-slate-900 dark:text-white">Invoice {fromInv.invoiceNumber} — stock is already out; this challan will not reduce it again. Quantity is limited to what is left to deliver.</span>
                  <button onClick={clearFromInvoice} className="text-slate-400 hover:text-red-500 ml-2"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={invNo} onChange={e => setInvNo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); loadFromInvoice(); } }} placeholder="Invoice number, e.g. INV-0012" className={inputCls} />
                  <button type="button" onClick={loadFromInvoice} disabled={invBusy || !invNo.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">{invBusy ? '…' : 'Load'}</button>
                </div>
              )}
              {invErr && <p className="text-xs text-red-500 mt-1">{invErr}</p>}
            </Section>
          )}

          {/* ─ Basic Info ─ */}
          <Section icon={<FileText size={13} />} title="Basic Info">
            <div className="flex gap-3 flex-wrap">
              <Field label="Challan Date" half>
                <input type="date" value={challanDate} onChange={e => setChallanDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Dispatch Purpose" half>
                <select value={dispatchType} onChange={e => setDispatchType(e.target.value)} className={selectCls}>
                  {DISPATCH_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* ─ Party ─ */}
          <Section icon={<User size={13} />} title="Party">
            <div className="relative">
              {selectedParty ? (
                <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-emerald-600" />
                    <span className="font-bold text-slate-900 dark:text-white">{selectedParty.name}</span>
                    {selectedParty.mobile && <span className="text-xs text-slate-500">{selectedParty.mobile}</span>}
                    {selectedParty.address && <span className="text-xs text-slate-400 truncate max-w-[200px]">{selectedParty.address}</span>}
                  </div>
                  <button onClick={() => setSelectedParty(null)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <input
                    ref={partyInputRef}
                    value={partySearch}
                    onChange={e => { setPartySearch(e.target.value); setShowPartyDrop(true); }}
                    onFocus={() => setShowPartyDrop(true)}
                    onBlur={() => setTimeout(() => setShowPartyDrop(false), 200)}
                    placeholder="Search party by name or mobile"
                    className={inputCls}
                  />
                  {showPartyDrop && partySearch.trim() && (() => {
                    const r = partyInputRef.current?.getBoundingClientRect();
                    const filtered = parties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase()) || (p.mobile || '').includes(partySearch)).slice(0, 8);
                    if (!r || filtered.length === 0) return null;
                    return (
                      <div style={{ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {filtered.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => { setSelectedParty(p); setPartySearch(''); setShowPartyDrop(false); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                          >
                            <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.name}</div>
                            <div className="text-xs text-slate-500">{p.mobile || 'No mobile'}{p.address ? ` · ${p.address}` : ''}</div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </Section>

          {/* ─ Items ─ */}
          <Section icon={<Package size={13} />} title="Items">
            {/* Product search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                ref={prodInputRef}
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowProdDrop(true); }}
                onFocus={() => setShowProdDrop(true)}
                onBlur={() => setTimeout(() => setShowProdDrop(false), 200)}
                placeholder="Search product to dispatch…"
                className={cn(inputCls, 'pl-9')}
              />
              {showProductDrop && productResults.length > 0 && (() => {
                const r = prodInputRef.current?.getBoundingClientRect();
                if (!r) return null;
                return (
                  <div style={{ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {productResults.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => addItem(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0 flex justify-between items-center"
                      >
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.name}</span>
                        <span className="text-xs text-slate-500">Stock: {p.currentStock ?? p.current_stock ?? '—'}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Cart — unit-aware item cards */}
            {cartItems.length > 0 && (
              <div className="space-y-2 mt-2">
                {cartItems.map((it, idx) => {
                  const lots = lotsByProduct[it.productId] || [];
                  const def = unitDef(it.unit);
                  const isPack    = def.kind === 'pack';
                  const isWeight  = !!def.toKg && def.toKg > 1;
                  const bags      = Number(it.noOfPacks) || 0;
                  const packSz    = Number(it.packSize) || 0;
                  const itemTotal = isPack
                    ? bags * it.price
                    : (Number(it.quantity) || 0) * it.price;

                  const cellCls = 'px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none w-full dark:text-slate-100';

                  return (
                    <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2.5 bg-slate-50/50 dark:bg-slate-800/30">
                      {/* Row 1 — product name + remove */}
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Package size={13} className="text-emerald-500 shrink-0" />{it.name}
                        </span>
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500 shrink-0">
                          <X size={15} />
                        </button>
                      </div>

                      {/* Row 2 — Lot + Godown */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">Lot / Batch</label>
                          {lots.length > 0 ? (
                            <select value={it.lotId || ''} onChange={e => updateItem(idx, { lotId: e.target.value || null })} className={cellCls}>
                              <option value="">— No Lot —</option>
                              {lots.map(l => <option key={l.id} value={l.id}>{l.lotNumber} (Avl: {l.availableQuantity} {l.unit}){l.packs && l.packs.length > 0 ? ` · ${l.packs.map(k => `${k.packs}×${k.packKg}kg`).join(" + ")}` : ""}</option>)}
                            </select>
                          ) : (
                            <input value={it.lotNumber || ''} onChange={e => updateItem(idx, { lotNumber: e.target.value })} placeholder="Lot / Batch #" className={cellCls} />
                          )}
                        </div>
                        <div className="flex-1">
                          <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">Godown</label>
                          <input value={it.godown || ''} onChange={e => updateItem(idx, { godown: e.target.value })} placeholder="Godown / Location" className={cellCls} />
                        </div>
                      </div>

                      {/* Row 3 — Unit selector */}
                      <div className="flex gap-2 items-end">
                        <div className="w-28 shrink-0">
                          <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">Dispatch Unit</label>
                          <select value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} className={cellCls}>
                            {ALL_UNITS.map(u => <option key={u} value={u}>{UNIT_DEFS[u].label}</option>)}
                          </select>
                        </div>
                        {/* hint: product base unit */}
                        {it.unit !== it.baseUnit && (
                          <span className="text-[10px] text-slate-400 pb-1.5">base: {it.baseUnit}</span>
                        )}
                      </div>

                      {/* Row 4 — dynamic quantity fields */}
                      {isPack ? (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">No. of {it.unit}s</label>
                            <input type="number" min="0" value={it.noOfPacks ?? ''} onChange={e => updateItem(idx, { noOfPacks: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 20" className={cellCls} />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">{it.unit} Size (Kg)</label>
                            <input type="number" min="0" value={it.packSize ?? ''} onChange={e => updateItem(idx, { packSize: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 50" className={cellCls} />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[9px] font-black uppercase text-emerald-600 mb-0.5">Total Weight</label>
                            <div className="px-2 py-1.5 text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg font-bold text-emerald-700 dark:text-emerald-400">
                              {bags && packSz ? `${(bags * packSz).toLocaleString('en-IN')} Kg` : '— Kg'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">Quantity ({it.unit})</label>
                            <input type="number" min="0" value={it.quantity || ''} onChange={e => updateItem(idx, { quantity: Number(e.target.value) || 0 })} className={cellCls} />
                          </div>
                          {isWeight && (
                            <div className="flex-1">
                              <label className="block text-[9px] font-black uppercase text-emerald-600 mb-0.5">≈ Kg Equivalent</label>
                              <div className="px-2 py-1.5 text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg font-bold text-emerald-700 dark:text-emerald-400">
                                {it.quantity ? `${((it.quantity) * (def.toKg || 1)).toLocaleString('en-IN')} Kg` : '— Kg'}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Row 5 — Rate + Total */}
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">Rate (₹ per {it.unit})</label>
                          <input type="number" min="0" value={it.price || ''} onChange={e => updateItem(idx, { price: Number(e.target.value) || 0 })} className={cellCls} />
                        </div>
                        <div className="flex-1 text-right">
                          <label className="block text-[9px] font-black uppercase text-slate-400 mb-0.5">Item Total</label>
                          <div className="px-2 py-1.5 text-sm font-black text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                            ₹{itemTotal.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Grand total */}
                <div className="flex justify-between items-center px-3 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Grand Total</span>
                  <span className="text-slate-900 dark:text-white text-base">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </Section>

          {/* ─ Dispatch Details ─ */}
          <Section icon={<MapPin size={13} />} title="Dispatch Details" collapsible defaultOpen>
            <div className="flex gap-3 flex-wrap">
              <Field label="Dispatch From (Godown / Location)" half>
                <input value={dispatchFrom} onChange={e => setDispatchFrom(e.target.value)} placeholder="e.g. Main Godown, Warehouse B" className={inputCls} />
              </Field>
              <Field label="Delivery Address" half>
                <input
                  value={selectedParty?.address || ''}
                  readOnly
                  placeholder="Auto-filled from party"
                  className={cn(inputCls, 'bg-slate-50 dark:bg-slate-800/50 text-slate-500')}
                />
              </Field>
            </div>
          </Section>

          {/* ─ Transport ─ */}
          <Section icon={<Truck size={13} />} title="Transport" collapsible defaultOpen={dispatchType !== 'sample'}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Transporter">
                <select value={transporterId} onChange={e => setTransporterId(e.target.value)} className={selectCls}>
                  <option value="">— Select Transporter —</option>
                  {transporters.map(t => <option key={t.id} value={t.id}>{t.name}{t.mobile ? ` (${t.mobile})` : ''}</option>)}
                </select>
                {transporters.length === 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">Add transporters in CRM → Parties (type: Transporter)</p>
                )}
              </Field>
              <Field label="Freight paid to transporter (₹)">
                <input
                  type="number" min="0" step="0.01"
                  value={freightAmount}
                  onChange={e => setFreightAmount(e.target.value)}
                  placeholder="Bhade amount"
                  disabled={!transporterId}
                  className={inputCls}
                />
                {transporterId && freightAmount && Number(freightAmount) > 0 && (
                  <p className="text-[10px] text-emerald-600 mt-1">Auto FreightEntry create होईल</p>
                )}
              </Field>
              <Field label="Vehicle Number">
                <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="e.g. MH 12 AB 1234" className={inputCls} />
              </Field>
              <Field label="Driver Name">
                <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" className={inputCls} />
              </Field>
              {isMill && (
                <>
                  <Field label="Hamali paid by you (₹)">
                    <input type="number" min="0" step="0.01" value={hamaliAmount} onChange={e => setHamaliAmount(e.target.value)} placeholder="Loading hamali for this sale" className={inputCls} />
                    <p className="text-[10px] text-slate-400 mt-1">Saved as Sale hamali</p>
                  </Field>
                  <Field label="Sale Broker">
                    <input value={brokerName} onChange={e => setBrokerName(e.target.value)} placeholder="Broker name" className={inputCls} />
                  </Field>
                  <Field label="Broker Commission (₹)">
                    <input type="number" min="0" step="0.01" value={brokerCommission} onChange={e => setBrokerCommission(e.target.value)} placeholder="Commission" disabled={!brokerName.trim()} className={inputCls} />
                    <p className="text-[10px] text-slate-400 mt-1">Saved as Sale (customer) broker</p>
                  </Field>
                </>
              )}
              <Field label="Driver Mobile">
                <input value={driverMobile} onChange={e => setDriverMobile(e.target.value)} placeholder="Mobile number" className={inputCls} />
              </Field>
              <Field label="LR / Transport Receipt No." half>
                <input value={lrNumber} onChange={e => setLrNumber(e.target.value)} placeholder="LR Number" className={inputCls} />
              </Field>
            </div>
          </Section>

          {/* ─ Reference ─ */}
          <Section icon={<Hash size={13} />} title="Reference / Compliance" collapsible defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3">
              {dispatchType === 'job_work' && (
                <Field label="Job Work Order Ref">
                  <input value={jobWorkOrderRef} onChange={e => setJobWorkOrderRef(e.target.value)} placeholder="JW Order / Ref no." className={inputCls} />
                </Field>
              )}
              <Field label="E-Way Bill No.">
                <input value={eWayBillNo} onChange={e => setEWayBillNo(e.target.value)} placeholder="If applicable" className={inputCls} />
              </Field>
              <Field label="Expected Invoice Date">
                <input type="date" value={expectedInvoiceDate} onChange={e => setExpectedInvoiceDate(e.target.value)} className={inputCls} />
              </Field>
              <div className="col-span-2">
                <Field label="Notes">
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any remarks…" className={inputCls} />
                </Field>
              </div>
            </div>
          </Section>

          {error && <p className="text-xs text-red-500 font-semibold px-1">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
            {saving ? 'Saving…' : 'Create Challan & Dispatch Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Print View ────────────────────────────────────────────────────────────────

function PrintChallanModal({ challan, shopName, onClose }: { challan: Challan; shopName: string; onClose: () => void }) {
  const dispatchLabel = DISPATCH_TYPES.find(d => d.value === challan.dispatchType)?.label || challan.dispatchType || 'Sale';
  const hasTransport  = challan.transporterCustomer || challan.transporter || challan.vehicleNumber || challan.driverName || challan.lrNumber;
  const hasRef        = challan.eWayBillNo || challan.jobWorkOrderRef || challan.expectedInvoiceDate;
  const contentRef    = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return;
    try {
      const [{ jsPDF }, html2canvasMod] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ]);
      const html2canvas = html2canvasMod.default;
      const canvas = await html2canvas(contentRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      pdf.save(`challan-${challan.challanNumber}.pdf`);
    } catch (e) {
      console.error('PDF generation failed:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-black text-lg text-slate-900">Delivery Challan</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPdf} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-900 rounded-lg text-sm font-bold">
              <Printer size={14} /> Download PDF
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
          </div>
        </div>

        <div ref={contentRef} className="p-8 text-slate-900">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div>
              <h1 className="text-xl font-black">{shopName}</h1>
              <p className="text-xs text-slate-500 mt-0.5">DELIVERY CHALLAN — Not a Tax Invoice</p>
              <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                {dispatchLabel}
              </span>
            </div>
            <div className="text-right text-sm">
              <p><span className="text-slate-500">Challan #:</span> <span className="font-bold">{challan.challanNumber}</span></p>
              <p><span className="text-slate-500">Date:</span>{' '}
                {fmtDate(challan.challanDate || challan.createdAt)}
              </p>
              <p className="mt-1">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', STATUS_STYLE[challan.status])}>
                  {challan.status}
                </span>
              </p>
            </div>
          </div>

          {/* Party + Dispatch */}
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Dispatched To</p>
              <p className="font-bold">{challan.customerName || '—'}</p>
              {challan.customerMobile && <p className="text-sm text-slate-600">{challan.customerMobile}</p>}
              {challan.customerAddress && <p className="text-sm text-slate-600">{challan.customerAddress}</p>}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Dispatch From</p>
              <p className="font-semibold text-sm">{challan.dispatchFrom || '—'}</p>
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-sm border border-slate-200 mb-4">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Lot / Batch</th>
                <th className="px-3 py-2 text-left">Godown</th>
                <th className="px-3 py-2 text-center">Qty / Packs</th>
                <th className="px-3 py-2 text-center">Wt. (Kg)</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {challan.items.map((it, i) => {
                const def = unitDef(it.unit);
                const isPack = def.kind === 'pack';
                const qtyDisplay = isPack
                  ? `${it.noOfPacks ?? it.quantity} ${it.unit}${(it.noOfPacks ?? 1) !== 1 ? 's' : ''} × ${it.packSize ?? '?'} Kg`
                  : `${it.quantity} ${it.unit}`;
                const wt = it.totalWeight
                  ? it.totalWeight.toLocaleString('en-IN')
                  : (def.toKg && def.toKg > 1 ? (it.quantity * def.toKg).toLocaleString('en-IN') : '—');
                const lineTotal = isPack
                  ? (Number(it.noOfPacks) || it.quantity) * it.price
                  : it.quantity * it.price;
                return (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold">{it.name}{it.variantKey ? ` (${it.variantKey})` : ''}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs">{it.lotNumber || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{it.godown || '—'}</td>
                    <td className="px-3 py-2 text-center text-xs">{qtyDisplay}</td>
                    <td className="px-3 py-2 text-center text-xs">{wt}</td>
                    <td className="px-3 py-2 text-right">₹{it.price.toLocaleString('en-IN')}/{it.unit}</td>
                    <td className="px-3 py-2 text-right font-bold">₹{lineTotal.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end mb-4">
            <div className="text-right">
              <p className="text-sm text-slate-500">Total Value</p>
              <p className="text-xl font-black">₹{challanTotal(challan).toLocaleString('en-IN')}</p>
            </div>
          </div>

          {/* Transport */}
          {hasTransport && (
            <div className="border border-slate-200 rounded-lg p-3 mb-4 text-xs grid grid-cols-2 gap-2">
              <p className="col-span-2 font-bold text-slate-700 mb-1">Transport Details</p>
              {(challan.transporterCustomer?.name || challan.transporter) && (
                <p><span className="text-slate-500">Transporter: </span>{challan.transporterCustomer?.name || challan.transporter}</p>
              )}
              {challan.freightAmount != null && challan.freightAmount > 0 && (
                <p><span className="text-slate-500">Freight: </span>₹{challan.freightAmount.toLocaleString('en-IN')}</p>
              )}
              {challan.vehicleNumber && <p><span className="text-slate-500">Vehicle: </span>{challan.vehicleNumber}</p>}
              {challan.driverName && <p><span className="text-slate-500">Driver: </span>{challan.driverName}{challan.driverMobile ? ` (${challan.driverMobile})` : ''}</p>}
              {challan.lrNumber && <p><span className="text-slate-500">LR No.: </span>{challan.lrNumber}</p>}
            </div>
          )}

          {/* Reference */}
          {hasRef && (
            <div className="border border-slate-200 rounded-lg p-3 mb-4 text-xs grid grid-cols-2 gap-2">
              <p className="col-span-2 font-bold text-slate-700 mb-1">Reference</p>
              {challan.eWayBillNo && <p><span className="text-slate-500">E-Way Bill: </span>{challan.eWayBillNo}</p>}
              {challan.jobWorkOrderRef && <p><span className="text-slate-500">JW Order Ref: </span>{challan.jobWorkOrderRef}</p>}
              {challan.expectedInvoiceDate && (
                <p><span className="text-slate-500">Expected Invoice Date: </span>
                  {fmtDate(challan.expectedInvoiceDate)}
                </p>
              )}
            </div>
          )}

          {challan.notes && (
            <div className="text-xs text-slate-500 mb-4">
              <p className="font-bold text-slate-700">Notes</p>
              <p>{challan.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 mt-8 pt-4 border-t border-slate-200 text-xs text-center text-slate-500">
            <div><div className="h-12 border-b border-slate-300 mb-1" /><p>Prepared By</p></div>
            <div><div className="h-12 border-b border-slate-300 mb-1" /><p>Authorised Signatory</p></div>
            <div><div className="h-12 border-b border-slate-300 mb-1" /><p>Receiver Signature</p></div>
          </div>

          <p className="mt-6 text-[10px] text-slate-400 text-center">
            Goods dispatched against this challan — a formal GST invoice follows separately.
          </p>
        </div>
      </div>
    </div>
  );
}
