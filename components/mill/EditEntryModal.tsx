'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import ModalPortal from '@/components/mill/ModalPortal';

/**
 * A small edit form for the mill's money lists (Hamali, Freight, Broker commission): the pencil button opens it with the entry's
 * values, Save sends only what changed to PATCH `url`. The fields are described by the page, so the three lists share one component.
 */
export type EditField = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'choice';
  options?: Array<{ value: string; label: string }>;
  hint?: string;
};

export default function EditEntryModal({ url, title, fields, initial, onDone, onClose }: {
  url: string; title: string; fields: EditField[]; initial: Record<string, any>; onDone: () => void; onClose: () => void;
}) {
  const t = useTranslations('Mill');
  const [vals, setVals] = useState<Record<string, any>>(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const cls = 'w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm';

  const save = async () => {
    const body: Record<string, any> = {};
    for (const f of fields) if (String(vals[f.key] ?? '') !== String(initial[f.key] ?? '')) body[f.key] = vals[f.key];
    if (Object.keys(body).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await api.patch(url, body);
      toast.success(t('pe_saved'));
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || e?.message || t('pe_failed'), { duration: 8000 });
    } finally { setSaving(false); }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
            <button onClick={onClose} aria-label={t('pe_cancel')}><X size={20} className="text-slate-400" /></button>
          </div>
          {fields.map((f) => (
            <label key={f.key} className="block text-[11px] font-bold uppercase text-slate-500">
              {f.label}
              {f.type === 'select' ? (
                <select className={cls + ' mt-1 normal-case'} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                  {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'choice' ? (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {(f.options || []).map((o) => (
                    <button key={o.value} type="button" onClick={() => setVals({ ...vals, [f.key]: o.value })}
                      className={'h-9 rounded-lg text-sm font-bold border-2 normal-case ' + (vals[f.key] === o.value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input className={cls + ' mt-1 normal-case'} type={f.type || 'text'} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} step={f.type === 'number' ? 'any' : undefined} />
              )}
              {f.hint && <span className="block text-[10px] font-normal normal-case text-slate-400 mt-0.5">{f.hint}</span>}
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">{t('pe_cancel')}</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} {t('pe_save')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** The pencil that opens the modal (kept next to the trash button in each row). */
export function EditButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('Mill');
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} title={t('pe_edit')} aria-label={t('pe_edit')}
      className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
      <Pencil size={14} />
    </button>
  );
}
