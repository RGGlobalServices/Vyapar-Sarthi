'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Plus, X, Loader2, FlaskConical, Check, Ban } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { computeQualityFlag, QualityFlag } from '@/lib/businessConfig';

type TestRow = {
  id: string;
  rawLotId: string | null;
  batchId: string | null;
  testDate: string;
  testedBy: string | null;
  moisturePct: number | null;
  foreignMatterPct: number | null;
  brokenPct: number | null;
  damagedPct: number | null;
  docPct: number | null;
  flag: QualityFlag | null;
  decision: 'pending' | 'accepted' | 'rejected';
  notes: string | null;
  rawLot?: { id: string; lotNumber: string | null; farmerName: string | null } | null;
  batch?: { id: string; batchNumber: string } | null;
};
type Lot = { id: string; lotNumber: string | null; farmerName: string | null };
type Batch = { id: string; batchNumber: string };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const FLAG_STYLES: Record<QualityFlag, string> = {
  green: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

// Quality / Lab — moisture / foreign matter / broken / damaged % readings
// against an incoming raw-material lot or a finished production batch, with
// an auto green/amber/red flag (see computeQualityFlag in businessConfig.ts)
// and the shopkeeper's own accept/reject call. Was a "Coming in V2"
// placeholder with zero backend; this is the real v1.
export default function QualityLabPage() {
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [logging, setLogging] = useState(false);

  const { data: rows = [], mutate: refetch, isLoading } = useSWR<TestRow[]>(
    activeShopId ? ['/mill/quality-tests', activeShopId] : null, ([u]) => fetcher(u),
  );
  const { data: lots = [] } = useSWR<Lot[]>(
    activeShopId ? ['/mill/raw-lots?status=available', activeShopId] : null, ([u]) => fetcher(u),
  );
  const { data: batches = [] } = useSWR<Batch[]>(activeShopId ? ['/mill/batches', activeShopId] : null, ([u]) => fetcher(u));

  const counts = useMemo(() => {
    const red = rows.filter(r => r.flag === 'red').length;
    const amber = rows.filter(r => r.flag === 'amber').length;
    const pending = rows.filter(r => r.decision === 'pending').length;
    return { red, amber, pending, total: rows.length };
  }, [rows]);

  const setDecision = async (row: TestRow, decision: 'accepted' | 'rejected') => {
    try {
      await api.patch(`/mill/quality-tests/${row.id}`, { decision });
      refetch();
    } catch { /* transient — table stays on old value, shopkeeper can retry */ }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FlaskConical size={22} className="text-purple-600" /> Quality / Lab
          </h1>
          <p className="text-sm text-slate-500 mt-1">Moisture, foreign matter, broken % — test every lot and batch, flagged automatically.</p>
        </div>
        <button onClick={() => setLogging(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Plus size={18} /> Log Test
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Total Tests</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Red Flagged</p>
          <p className="text-xl font-black text-red-600 dark:text-red-400 mt-1">{counts.red}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 uppercase font-bold">Awaiting Decision</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{counts.pending}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <FlaskConical size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm text-slate-500">No tests logged yet. Test a raw lot before it goes into production, or a batch before it ships.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">Against</th>
                <th className="px-3 py-3 font-bold text-right">Moisture</th>
                <th className="px-3 py-3 font-bold text-right">Foreign Matter</th>
                <th className="px-3 py-3 font-bold text-right">Broken</th>
                <th className="px-3 py-3 font-bold text-right">Damaged</th>
                <th className="px-3 py-3 font-bold">Flag</th>
                <th className="px-3 py-3 font-bold">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 text-slate-500">{new Date(r.testDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                    {r.rawLot ? `Lot ${r.rawLot.lotNumber || '—'}${r.rawLot.farmerName ? ` · ${r.rawLot.farmerName}` : ''}` : r.batch ? `Batch ${r.batch.batchNumber}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.moisturePct != null ? `${r.moisturePct}%` : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.foreignMatterPct != null ? `${r.foreignMatterPct}%` : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.brokenPct != null ? `${r.brokenPct}%` : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.damagedPct != null ? `${r.damagedPct}%` : '—'}</td>
                  <td className="px-3 py-2.5">
                    {r.flag && <span className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full', FLAG_STYLES[r.flag])}>{r.flag}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.decision === 'pending' ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDecision(r, 'accepted')} title="Accept" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"><Check size={14} /></button>
                        <button onClick={() => setDecision(r, 'rejected')} title="Reject" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Ban size={14} /></button>
                      </div>
                    ) : (
                      <span className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded-full', r.decision === 'accepted' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400')}>
                        {r.decision}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logging && (
        <LogTestModal
          lots={lots} batches={batches}
          onClose={() => setLogging(false)}
          onLogged={() => { setLogging(false); refetch(); }}
        />
      )}
    </div>
  );
}

function LogTestModal({ lots, batches, onClose, onLogged }: {
  lots: Lot[]; batches: Batch[]; onClose: () => void; onLogged: () => void;
}) {
  const [against, setAgainst] = useState<'lot' | 'batch'>('lot');
  const [form, setForm] = useState({
    rawLotId: '', batchId: '', testedBy: '',
    moisturePct: '', foreignMatterPct: '', brokenPct: '', damagedPct: '', docPct: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const liveFlag = computeQualityFlag({
    moisturePct: form.moisturePct === '' ? null : Number(form.moisturePct),
    foreignMatterPct: form.foreignMatterPct === '' ? null : Number(form.foreignMatterPct),
    brokenPct: form.brokenPct === '' ? null : Number(form.brokenPct),
    damagedPct: form.damagedPct === '' ? null : Number(form.damagedPct),
  });
  const hasAnyReading = [form.moisturePct, form.foreignMatterPct, form.brokenPct, form.damagedPct].some(v => v !== '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/mill/quality-tests', {
        rawLotId: against === 'lot' ? form.rawLotId : undefined,
        batchId: against === 'batch' ? form.batchId : undefined,
        testedBy: form.testedBy,
        moisturePct: form.moisturePct || undefined,
        foreignMatterPct: form.foreignMatterPct || undefined,
        brokenPct: form.brokenPct || undefined,
        damagedPct: form.damagedPct || undefined,
        docPct: form.docPct || undefined,
        notes: form.notes,
      });
      onLogged();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to log test');
    } finally { setSaving(false); }
  };

  const canSubmit = (against === 'lot' ? !!form.rawLotId : !!form.batchId) && hasAnyReading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">Log Test</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button type="button" onClick={() => setAgainst('lot')}
              className={cn('flex-1 py-1.5 rounded-md text-xs font-bold transition-colors', against === 'lot' ? 'bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white' : 'text-slate-500')}>
              Raw Material Lot
            </button>
            <button type="button" onClick={() => setAgainst('batch')}
              className={cn('flex-1 py-1.5 rounded-md text-xs font-bold transition-colors', against === 'batch' ? 'bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white' : 'text-slate-500')}>
              Production Batch
            </button>
          </div>

          {against === 'lot' ? (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Lot *</span>
              <select value={form.rawLotId} onChange={e => setForm(f => ({ ...f, rawLotId: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
                <option value="">-- Select Lot --</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.lotNumber || l.id.slice(0, 8)}{l.farmerName ? ` — ${l.farmerName}` : ''}</option>)}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Batch *</span>
              <select value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" required>
                <option value="">-- Select Batch --</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.batchNumber}</option>)}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Moisture %</span>
              <input type="number" min="0" max="100" step="0.1" value={form.moisturePct} onChange={e => setForm(f => ({ ...f, moisturePct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Foreign Matter %</span>
              <input type="number" min="0" max="100" step="0.1" value={form.foreignMatterPct} onChange={e => setForm(f => ({ ...f, foreignMatterPct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Broken %</span>
              <input type="number" min="0" max="100" step="0.1" value={form.brokenPct} onChange={e => setForm(f => ({ ...f, brokenPct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Damaged %</span>
              <input type="number" min="0" max="100" step="0.1" value={form.damagedPct} onChange={e => setForm(f => ({ ...f, damagedPct: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Protein / Oil Content % (optional)</span>
            <input type="number" min="0" max="100" step="0.1" value={form.docPct} onChange={e => setForm(f => ({ ...f, docPct: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>

          {hasAnyReading && (
            <div className={cn('rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-2', FLAG_STYLES[liveFlag])}>
              Flag: <span className="uppercase">{liveFlag}</span>
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Tested By</span>
            <input value={form.testedBy} onChange={e => setForm(f => ({ ...f, testedBy: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase text-slate-500 mb-1">Notes</span>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving || !canSubmit}
            className="w-full h-11 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Log Test
          </button>
        </form>
      </div>
    </div>
  );
}
