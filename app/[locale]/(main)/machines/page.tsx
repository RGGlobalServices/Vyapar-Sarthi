'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { Cog, Plus, X, Loader2, Wrench, ChevronDown, ChevronUp, Pencil, Trash2, PackagePlus, PackageMinus, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { useConfirm } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

/**
 * Machines, repairs and spare parts on ONE page, made simple for a small mill:
 *   Machines tab    — one card per machine; "Add work done" records what was done, who did it, the cost and the parts used;
 *                     the card opens to its history.
 *   Spare parts tab — what is in stock; add stock / mark used.
 * (The old separate Maintenance and Spare Parts pages now open this one.)
 */

type Machine = {
  id: string; name: string; machineType?: string | null; purchaseDate?: string | null; cost?: number | null;
  status: 'working' | 'under_maintenance' | 'retired'; notes?: string | null;
};
type Work = {
  id: string; machineId: string; description: string; cost?: number | null; performedBy?: string | null;
  serviceDate: string; nextDueDate?: string | null; notes?: string | null; machine?: { id: string; name: string };
};
type Part = { id: string; name: string; machineId?: string | null; quantity: number; minStock?: number | null; unitCost?: number | null; machine?: { id: string; name: string } | null };

const fetcher = (u: string) => api.get(u).then(r => r.data);
const rupee = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const input = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm';
const errText = (e: any, fallback: string) => e?.response?.data?.detail || e?.response?.data?.error || e?.message || fallback;

const TYPE_SUGGESTIONS = ['Pre-Cleaner', 'Destoner', 'Dehusker / Sheller', 'Whitener / Polisher', 'Chakki Grinder', 'Hammer Mill', 'Plan Sifter', 'Color Sortex', 'Bagging Machine', 'Pouch Packing', 'Bucket Elevator', 'Screw Conveyor', 'Oil Expeller', 'Dal Mill'];

export default function MachinesPage() {
  const t = useTranslations('MachineHub');
  const [confirm, confirmDialog] = useConfirm();
  const shopId = useBusinessStore(s => s.activeShopId);
  const [tab, setTab] = useState<'machines' | 'parts'>('machines');
  const [openId, setOpenId] = useState<string | null>(null);
  const [machineForm, setMachineForm] = useState<{ machine: Machine | null } | null>(null);
  const [workFor, setWorkFor] = useState<Machine | null>(null);
  const [partForm, setPartForm] = useState(false);
  const [stockFor, setStockFor] = useState<{ part: Part; type: 'in' | 'out' } | null>(null);

  const { data: machines = [], mutate: mutateMachines, isLoading } = useSWR<Machine[]>(shopId ? ['/management/machines', shopId] : null, ([u]) => fetcher(u));
  const { data: works = [], mutate: mutateWorks } = useSWR<Work[]>(shopId ? ['/management/maintenance', shopId] : null, ([u]) => fetcher(u));
  const { data: parts = [], mutate: mutateParts } = useSWR<Part[]>(shopId ? ['/management/spare-parts', shopId] : null, ([u]) => fetcher(u));

  const byMachine = useMemo(() => {
    const m = new Map<string, Work[]>();
    for (const w of works) { const l = m.get(w.machineId) ?? []; l.push(w); m.set(w.machineId, l); }
    return m;
  }, [works]);
  const lowParts = parts.filter(p => p.minStock != null && Number(p.quantity) <= Number(p.minStock));

  const reload = () => { mutateMachines(); mutateWorks(); mutateParts(); };

  const removeMachine = async (m: Machine) => {
    if (!(await confirm(t('deleteMsg'), { title: t('deleteTitle', { name: m.name }), okLabel: t('delete') }))) return;
    try { await api.delete(`/management/machines/${m.id}`); reload(); } catch (e) { alert(errText(e, t('failed'))); }
  };

  const toggleStatus = async (m: Machine) => {
    const next = m.status === 'working' ? 'under_maintenance' : 'working';
    mutateMachines(machines.map(x => (x.id === m.id ? { ...x, status: next } : x)), false);
    try { await api.patch(`/management/machines/${m.id}`, { status: next }); } finally { mutateMachines(); }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Cog size={22} className="text-slate-600" /> {t('title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={() => (tab === 'machines' ? setMachineForm({ machine: null }) : setPartForm(true))}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5">
          <Plus size={16} /> {tab === 'machines' ? t('addMachine') : t('addPart')}
        </button>
      </div>

      <div className="flex gap-1.5">
        {(['machines', 'parts'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-4 py-2 rounded-xl text-sm font-bold border', tab === k ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
            {k === 'machines' ? t('tabMachines') : t('tabParts')}{k === 'parts' && lowParts.length > 0 && <span className="ml-1.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5">{lowParts.length}</span>}
          </button>
        ))}
      </div>

      {isLoading && <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}

      {tab === 'machines' && !isLoading && (
        machines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
            <Cog size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">{t('noMachines')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {machines.map(m => {
              const list = byMachine.get(m.id) ?? [];
              const spent = list.reduce((a, w) => a + (Number(w.cost) || 0), 0);
              const open = openId === m.id;
              const nextDue = list.map(w => w.nextDueDate).filter(Boolean).sort().pop();
              return (
                <div key={m.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="p-4 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 dark:text-white">{m.name}</h3>
                        {m.machineType && <span className="text-xs text-slate-500">{m.machineType}</span>}
                        {m.status !== 'retired' && (
                          <button onClick={() => toggleStatus(m)} title={t('tapToChange')}
                            className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', m.status === 'working' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300')}>
                            {m.status === 'working' ? t('working') : t('stopped')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {list.length > 0 ? `${t('lastWork')}: ${day(list[0].serviceDate)} · ` : ''}{t('totalSpent')}: {rupee(spent)}
                        {nextDue && ` · ${t('nextService')}: ${day(nextDue)}`}
                      </p>
                    </div>
                    <button onClick={() => setWorkFor(m)} className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5"><Wrench size={14} /> {t('addWork')}</button>
                    <button onClick={() => setOpenId(open ? null : m.id)} className="p-2 text-slate-400" aria-label={t('history')}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                  </div>
                  {open && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      {list.length === 0 ? <p className="p-4 text-sm text-slate-500">{t('noWork')}</p> : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {list.map(w => (
                            <li key={w.id} className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{w.description}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{day(w.serviceDate)}{w.performedBy ? ` · ${w.performedBy}` : ''}</p>
                                  {w.notes && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{w.notes}</p>}
                                </div>
                                {Number(w.cost) > 0 && <span className="text-sm font-black text-rose-600 shrink-0">{rupee(Number(w.cost))}</span>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="p-3 flex gap-2 justify-end border-t border-slate-100 dark:border-slate-800 text-xs">
                        <button onClick={() => setMachineForm({ machine: m })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={13} /> {t('edit')}</button>
                        <button onClick={() => removeMachine(m)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={13} /> {t('delete')}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'parts' && !isLoading && (
        parts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
            <p className="text-sm text-slate-500">{t('noParts')}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {parts.map(p => {
                const low = p.minStock != null && Number(p.quantity) <= Number(p.minStock);
                return (
                  <li key={p.id} className="p-4 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.machine?.name ? `${t('forMachine')}: ${p.machine.name}` : t('anyMachine')}{Number(p.unitCost) > 0 ? ` · ${rupee(Number(p.unitCost))} / ${t('each')}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-lg font-black', low ? 'text-red-600' : 'text-slate-900 dark:text-white')}>{Number(p.quantity)}</p>
                      {low && <p className="text-[10px] font-bold text-red-600 flex items-center gap-1"><AlertTriangle size={10} /> {t('low')}</p>}
                    </div>
                    <button onClick={() => setStockFor({ part: p, type: 'in' })} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" title={t('addStock')}><PackagePlus size={18} /></button>
                    <button onClick={() => setStockFor({ part: p, type: 'out' })} className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10" title={t('usedQty')}><PackageMinus size={18} /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}

      {confirmDialog}
      {machineForm && <MachineModal machine={machineForm.machine} onClose={() => setMachineForm(null)} onSaved={() => { setMachineForm(null); reload(); }} />}
      {workFor && <WorkModal machine={workFor} parts={parts} onClose={() => setWorkFor(null)} onSaved={() => { setWorkFor(null); setOpenId(workFor.id); reload(); }} />}
      {partForm && <PartModal machines={machines} onClose={() => setPartForm(false)} onSaved={() => { setPartForm(false); mutateParts(); }} />}
      {stockFor && <StockModal part={stockFor.part} type={stockFor.type} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); mutateParts(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-black">{title}</h2>
          <button onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">{label}</span>{children}</label>;
}

function SaveBar({ saving, error, disabled, onClose }: { saving: boolean; error: string; disabled?: boolean; onClose: () => void }) {
  const t = useTranslations('MachineHub');
  return (
    <>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">{t('cancel')}</button>
        <button type="submit" disabled={saving || disabled} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />} {t('save')}
        </button>
      </div>
    </>
  );
}

function MachineModal({ machine, onClose, onSaved }: { machine: Machine | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('MachineHub');
  const [f, setF] = useState({ name: machine?.name ?? '', machineType: machine?.machineType ?? '', purchaseDate: machine?.purchaseDate?.slice(0, 10) ?? '', cost: machine?.cost != null ? String(machine.cost) : '', notes: machine?.notes ?? '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const body = { ...f, cost: f.cost === '' ? undefined : Number(f.cost), purchaseDate: f.purchaseDate || undefined };
      if (machine) await api.patch(`/management/machines/${machine.id}`, body); else await api.post('/management/machines', body);
      onSaved();
    } catch (err) { setError(errText(err, t('failed'))); } finally { setSaving(false); }
  };
  return (
    <Modal title={machine ? t('edit') : t('addMachine')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <L label={`${t('machineName')} *`}><input autoFocus className={input} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></L>
        <L label={t('machineType')}><input className={input} list="machine-types" value={f.machineType} onChange={e => setF({ ...f, machineType: e.target.value })} /><datalist id="machine-types">{TYPE_SUGGESTIONS.map(x => <option key={x} value={x} />)}</datalist></L>
        <div className="grid grid-cols-2 gap-3">
          <L label={t('purchaseDate')}><input type="date" className={input} value={f.purchaseDate} onChange={e => setF({ ...f, purchaseDate: e.target.value })} /></L>
          <L label={t('machineCost')}><input type="number" min="0" className={input} value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></L>
        </div>
        <L label={t('notes')}><input className={input} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></L>
        <SaveBar saving={saving} error={error} disabled={!f.name.trim()} onClose={onClose} />
      </form>
    </Modal>
  );
}

function WorkModal({ machine, parts, onClose, onSaved }: { machine: Machine; parts: Part[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('MachineHub');
  const [f, setF] = useState({ description: '', cost: '', paymentMethod: 'Cash', performedBy: '', serviceDate: today(), nextDueDate: '', notes: '', after: machine.status === 'under_maintenance' ? 'under_maintenance' : 'working' });
  const [used, setUsed] = useState<Array<{ sparePartId: string; quantity: string }>>([]);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const ordered = useMemo(() => [...parts].sort((a, b) => Number(b.machineId === machine.id) - Number(a.machineId === machine.id) || a.name.localeCompare(b.name)), [parts, machine.id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/management/maintenance', {
        machineId: machine.id, description: f.description, cost: f.cost === '' ? undefined : Number(f.cost), paymentMethod: f.paymentMethod,
        performedBy: f.performedBy, serviceDate: f.serviceDate, nextDueDate: f.nextDueDate || undefined, notes: f.notes,
        setStatus: f.after !== machine.status ? f.after : undefined,
        parts: used.filter(u => u.sparePartId && Number(u.quantity) > 0).map(u => ({ sparePartId: u.sparePartId, quantity: Number(u.quantity) })),
      });
      onSaved();
    } catch (err) { setError(errText(err, t('failed'))); } finally { setSaving(false); }
  };
  return (
    <Modal title={`${t('addWork')} — ${machine.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <L label={`${t('workDone')} *`}><textarea autoFocus rows={2} className={cn(input, 'h-auto py-2')} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder={t('workPlaceholder')} required /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label={t('cost')}><input type="number" min="0" className={input} value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></L>
          <L label={t('paidBy')}><select className={input} value={f.paymentMethod} onChange={e => setF({ ...f, paymentMethod: e.target.value })} disabled={f.cost === ''}>{['Cash', 'UPI', 'Bank', 'Card'].map(m => <option key={m}>{m}</option>)}</select></L>
          <L label={t('doneBy')}><input className={input} value={f.performedBy} onChange={e => setF({ ...f, performedBy: e.target.value })} placeholder={t('doneByPlaceholder')} /></L>
          <L label={t('date')}><input type="date" className={input} value={f.serviceDate} onChange={e => setF({ ...f, serviceDate: e.target.value })} /></L>
        </div>
        <L label={t('nextService')}><input type="date" className={input} value={f.nextDueDate} onChange={e => setF({ ...f, nextDueDate: e.target.value })} /></L>

        <div>
          <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">{t('partsUsed')}</span>
          {used.map((u, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2 mb-2">
              <select className={input} value={u.sparePartId} onChange={e => setUsed(l => l.map((x, j) => (j === i ? { ...x, sparePartId: e.target.value } : x)))}>
                <option value="">—</option>
                {ordered.map(p => <option key={p.id} value={p.id}>{p.name} ({Number(p.quantity)})</option>)}
              </select>
              <input type="number" min="0" step="any" className={input} value={u.quantity} onChange={e => setUsed(l => l.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} placeholder={t('qty')} />
              <button type="button" onClick={() => setUsed(l => l.filter((_, j) => j !== i))} className="px-2 text-red-500" aria-label="Remove"><X size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setUsed(l => [...l, { sparePartId: '', quantity: '1' }])} className="text-xs font-bold text-emerald-700 dark:text-emerald-400">+ {t('addPartRow')}</button>
          {parts.length === 0 && <p className="text-[11px] text-slate-400 mt-1">{t('noPartsHint')}</p>}
        </div>

        <L label={t('afterWork')}>
          <div className="grid grid-cols-2 gap-2">
            {(['working', 'under_maintenance'] as const).map(k => (
              <button key={k} type="button" onClick={() => setF({ ...f, after: k })}
                className={cn('h-9 rounded-lg text-sm font-bold border-2', f.after === k ? (k === 'working' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10' : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10') : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                {k === 'working' ? t('working') : t('stopped')}
              </button>
            ))}
          </div>
        </L>
        <L label={t('notes')}><input className={input} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></L>
        <SaveBar saving={saving} error={error} disabled={!f.description.trim()} onClose={onClose} />
      </form>
    </Modal>
  );
}

function PartModal({ machines, onClose, onSaved }: { machines: Machine[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('MachineHub');
  const [f, setF] = useState({ name: '', machineId: '', quantity: '', minStock: '', unitCost: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.post('/management/spare-parts', { ...f, machineId: f.machineId || undefined }); onSaved(); }
    catch (err) { setError(errText(err, t('failed'))); } finally { setSaving(false); }
  };
  return (
    <Modal title={t('addPart')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <L label={`${t('partName')} *`}><input autoFocus className={input} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></L>
        <L label={t('forMachine')}><select className={input} value={f.machineId} onChange={e => setF({ ...f, machineId: e.target.value })}><option value="">{t('anyMachine')}</option>{machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></L>
        <div className="grid grid-cols-3 gap-3">
          <L label={t('inStock')}><input type="number" min="0" step="any" className={input} value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} /></L>
          <L label={t('minStock')}><input type="number" min="0" step="any" className={input} value={f.minStock} onChange={e => setF({ ...f, minStock: e.target.value })} /></L>
          <L label={t('unitCost')}><input type="number" min="0" className={input} value={f.unitCost} onChange={e => setF({ ...f, unitCost: e.target.value })} /></L>
        </div>
        <SaveBar saving={saving} error={error} disabled={!f.name.trim()} onClose={onClose} />
      </form>
    </Modal>
  );
}

function StockModal({ part, type, onClose, onSaved }: { part: Part; type: 'in' | 'out'; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('MachineHub');
  const [quantity, setQuantity] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.post(`/management/spare-parts/${part.id}/movements`, { type, quantity: Number(quantity), note, paymentMethod }); onSaved(); }
    catch (err) { setError(errText(err, t('failed'))); } finally { setSaving(false); }
  };
  return (
    <Modal title={`${type === 'in' ? t('addStock') : t('usedQty')} — ${part.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <L label={`${t('quantity')} *`}><input autoFocus type="number" min="0" step="any" className={input} value={quantity} onChange={e => setQuantity(e.target.value)} required /></L>
        {type === 'in' && Number(part.unitCost) > 0 && (
          <L label={t('paidBy')}><select className={input} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{['Cash', 'UPI', 'Bank', 'Card'].map(m => <option key={m}>{m}</option>)}</select></L>
        )}
        <L label={t('notes')}><input className={input} value={note} onChange={e => setNote(e.target.value)} /></L>
        <SaveBar saving={saving} error={error} disabled={!(Number(quantity) > 0)} onClose={onClose} />
      </form>
    </Modal>
  );
}
