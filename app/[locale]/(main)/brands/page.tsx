'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Tag, Trash2, Factory, Store } from 'lucide-react';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type Brand = { id: string; name: string; manufacturer: boolean | null };

/**
 * Master Brand list — create, rename, delete, and flip the "manufacturer"
 * flag on a brand. The flag is what powers the by_company report roll-up:
 * without any manufacturer=true rows, that report groups everything under
 * "Unassigned". Anchoring this on a dedicated small page keeps Settings from
 * getting even longer; a Reports empty-state link can point here.
 */
export default function BrandsPage() {
  const t = useTranslations('Brands');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', manufacturer: false });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/master-data');
      setBrands(res.data?.brands || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (activeShopId) load(); }, [activeShopId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/master-data', { type: 'brand', name: form.name.trim(), manufacturer: form.manufacturer });
      setForm({ name: '', manufacturer: false });
      await load();
    } finally { setSaving(false); }
  };

  const toggleMfg = async (b: Brand) => {
    setBusyId(b.id);
    try {
      await api.patch('/master-data', { type: 'brand', id: b.id, manufacturer: !b.manufacturer });
      // Local swap so the row flips instantly; a refetch would flicker.
      setBrands(prev => prev.map(x => x.id === b.id ? { ...x, manufacturer: !b.manufacturer } : x));
    } catch (err: any) {
      alert(err?.response?.data?.error || t('failedToUpdate'));
    } finally { setBusyId(null); }
  };

  const doRename = async (b: Brand, next: string) => {
    if (!next.trim() || next === b.name) return;
    setBusyId(b.id);
    try {
      await api.patch('/master-data', { type: 'brand', id: b.id, name: next.trim() });
      setBrands(prev => prev.map(x => x.id === b.id ? { ...x, name: next.trim() } : x));
    } catch (err: any) {
      alert(err?.response?.data?.error || t('failedToRename'));
    } finally { setBusyId(null); }
  };

  const doDelete = async (b: Brand) => {
    if (!confirm(t('confirmDelete', { name: b.name }))) return;
    setBusyId(b.id);
    try {
      await api.delete(`/master-data?type=brand&id=${b.id}`);
      setBrands(prev => prev.filter(x => x.id !== b.id));
    } catch (err: any) {
      alert(err?.response?.data?.error || t('cannotDelete'));
    } finally { setBusyId(null); }
  };

  const mfgCount = brands.filter(b => b.manufacturer).length;
  const brandCount = brands.length - mfgCount;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Tag size={22} className="text-emerald-500" /> {t('title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1" dangerouslySetInnerHTML={{ __html: t('description') }} />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center gap-2">
          <Store size={16} className="text-slate-500" />
          <span className="text-xs text-slate-500">{t('brandsCount')}</span>
          <span className="ml-auto text-lg font-black text-slate-900 dark:text-white">{brandCount}</span>
        </div>
        <div className="flex-1 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 p-3 flex items-center gap-2">
          <Factory size={16} className="text-violet-600 dark:text-violet-300" />
          <span className="text-xs text-violet-700 dark:text-violet-300">{t('companiesCount')}</span>
          <span className="ml-auto text-lg font-black text-violet-700 dark:text-violet-200">{mfgCount}</span>
        </div>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row gap-3">
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={t('addBrandPlaceholder')}
          className="flex-1 h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
          <input type="checkbox" checked={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.checked }))}
            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
          {t('addLabel')}
        </label>
        <button type="submit" disabled={saving || !form.name.trim()}
          className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-2">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {t('addBtn')}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center text-slate-500"><Loader2 size={20} className="animate-spin" /></div>
        ) : brands.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t('noBrands')}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {brands.map(b => (
              <li key={b.id} className="flex items-center gap-3 p-3">
                <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  b.manufacturer ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}>
                  {b.manufacturer ? <Factory size={14} /> : <Tag size={14} />}
                </span>
                <input
                  defaultValue={b.name}
                  onBlur={(e) => doRename(b, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-semibold text-slate-900 dark:text-white p-0"
                />
                <button
                  onClick={() => toggleMfg(b)}
                  disabled={busyId === b.id}
                  className={cn('text-[10px] font-bold uppercase px-2 py-1 rounded-full transition-colors',
                    b.manufacturer
                      ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700')}
                >
                  {b.manufacturer ? t('tagCompany') : t('tagBrand')}
                </button>
                <button
                  onClick={() => doDelete(b)}
                  disabled={busyId === b.id}
                  title={t('deleteTitle')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  {busyId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
