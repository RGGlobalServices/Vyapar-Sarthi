'use client';
import { useMemo, useState } from 'react';
import { X, Edit, Loader2, AlertCircle, Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';
import { cssColor } from '@/components/ColorSizeVariantGrid';

// Same "Colour / Size" composite key used by Purchases/Billing/variantStock.ts
// (see ColorSizeVariantGrid's makeVariantKey) — duplicated here since that
// helper takes separate (color, size) args and variant rows here are objects.
function variantRowKey(v: any): string {
  return v.color ? `${v.color} / ${v.size || ''}` : (v.size || '');
}

export default function AdjustDrawer({
  product,
  godowns,
  onClose,
  onSuccess
}: {
  product: any,
  godowns: any[],
  onClose: () => void,
  onSuccess: (data?: any) => void
}) {
  const t = useTranslations('Stock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    warehouseId: '',
    difference: '',
    reason: 'Physical Count',
    notes: ''
  });

  // Per-variant mode: one delta per colour/size row instead of a single flat
  // difference. Raw text (not a parsed number) so a lone "-" while typing a
  // negative adjustment doesn't get snapped back to '' mid-keystroke — see
  // the memory note on number-input test artifacts for why a fully-parsed
  // controlled value breaks negative typing.
  const [deltaText, setDeltaText] = useState<Record<string, string>>({});

  const variantRows: any[] = Array.isArray(product.variants) ? product.variants : [];
  const hasVariants = variantRows.length > 0;

  const colorGroups = useMemo(() => {
    if (!hasVariants) return [] as [string, any[]][];
    const byColor = new Map<string, any[]>();
    for (const v of variantRows) {
      const color = v.color || '';
      if (!byColor.has(color)) byColor.set(color, []);
      byColor.get(color)!.push(v);
    }
    return Array.from(byColor.entries());
  }, [variantRows, hasVariants]);

  function getDelta(key: string): number {
    const raw = deltaText[key];
    if (!raw || raw === '-') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function step(key: string, dir: 1 | -1, currentStock: number) {
    const next = getDelta(key) + dir;
    if (currentStock + next < 0) return;
    setDeltaText(prev => ({ ...prev, [key]: next === 0 ? '' : String(next) }));
  }

  function handleDeltaInput(key: string, raw: string) {
    if (raw !== '' && raw !== '-' && !/^-?\d+$/.test(raw)) return;
    setDeltaText(prev => ({ ...prev, [key]: raw }));
  }

  function handleDeltaBlur(key: string, currentStock: number) {
    const clamped = Math.max(-currentStock, getDelta(key));
    setDeltaText(prev => ({ ...prev, [key]: clamped === 0 ? '' : String(clamped) }));
  }

  const variantTotals = useMemo(() => {
    const current = variantRows.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    const delta = variantRows.reduce((s, v) => s + getDelta(variantRowKey(v)), 0);
    return { current, delta, next: current + delta };
  }, [variantRows, deltaText]);

  const reasons = [
    { value: 'Physical Count', label: t('physicalCount') || 'Physical Count' },
    { value: 'Damaged', label: t('damaged') || 'Damaged' },
    { value: 'Expired', label: t('expired') || 'Expired' },
    { value: 'Theft', label: t('theft') || 'Theft' },
    { value: 'Lost', label: t('lost') || 'Lost' },
    { value: 'Opening Balance', label: t('openingBalance') || 'Opening Balance' }
  ];

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasVariants) {
      const deltas = variantRows
        .map(v => ({ variantKey: variantRowKey(v), delta: getDelta(variantRowKey(v)) }))
        .filter(d => d.delta !== 0);

      if (!form.warehouseId || deltas.length === 0) {
        setError(deltas.length === 0 ? (t('enterAtLeastOneVariant') || 'Adjust at least one variant.') : t('fillRequiredFields'));
        return;
      }

      const totalDiff = deltas.reduce((s, d) => s + d.delta, 0);

      api.post('/stock/adjust', {
        productId: product.id,
        warehouseId: form.warehouseId,
        variantDeltas: deltas,
        reason: form.reason,
        notes: form.notes
      }).catch(err => {
        console.error('[API Error] Adjust:', err);
      });

      onSuccess({
        type: 'adjust',
        productId: product.id,
        quantity: totalDiff,
        warehouseId: form.warehouseId
      });
      onClose();
      return;
    }

    if (!form.warehouseId || !form.difference) {
      setError(t('fillRequiredFields'));
      return;
    }

    // Fire and forget so UI closes instantly
    api.post('/stock/adjust', {
      productId: product.id,
      warehouseId: form.warehouseId,
      difference: Number(form.difference),
      reason: form.reason,
      notes: form.notes
    }).catch(err => {
      console.error('[API Error] Adjust:', err);
    });

    onSuccess({
      type: 'adjust',
      productId: product.id,
      quantity: Number(form.difference),
      warehouseId: form.warehouseId
    });
    onClose();
  };

  return (
    <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 lg:border border-slate-200 dark:border-slate-800 lg:rounded-xl shadow-xl flex flex-col transition-all animate-in slide-in-from-right-4 duration-300 h-full max-h-full z-30 absolute right-0">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Edit size={20} /> {t('adjustStock')}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-5 flex-1 overflow-y-auto">
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{product.name}</p>
          <p className="text-xs text-slate-500 mt-1">{t('barcode') || 'Barcode'}: {product.barcode || product.sku}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg border border-red-200 flex items-center gap-2 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form id="adjust-form" onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('warehouse')} *</label>
            <select 
              required
              value={form.warehouseId}
              onChange={e => setForm({...form, warehouseId: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500"
            >
              <option value="">{t('selectWarehouse')}</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {hasVariants ? (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('adjustmentDifference')}</label>
              <p className="text-[10px] text-slate-400 mb-3">{t('adjustmentHintVariant') || 'Adjust each colour/size — the total difference is applied automatically.'}</p>

              <div className="space-y-3">
                {colorGroups.map(([color, rows]) => (
                  <div key={color || '__none__'} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                    {color && (
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                        <span className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" style={{ background: cssColor(color) }} />
                        {color}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {rows.map((v: any) => {
                        const key = variantRowKey(v);
                        const currentStock = Number(v.stock) || 0;
                        const delta = getDelta(key);
                        const nextStock = currentStock + delta;
                        return (
                          <div key={key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-slate-700 dark:text-slate-200">{v.size || t('size') || 'Size'}</span>
                              <span className="text-slate-400" title={t('currentInStock') || 'Current stock'}>{currentStock}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => step(key, -1, currentStock)}
                                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={deltaText[key] || ''}
                                placeholder="0"
                                onChange={e => handleDeltaInput(key, e.target.value)}
                                onBlur={() => handleDeltaBlur(key, currentStock)}
                                className={cn(
                                  'w-full min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1 py-1 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500',
                                  delta > 0 && 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/50',
                                  delta < 0 && 'text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-500/50'
                                )}
                              />
                              <button
                                type="button"
                                onClick={() => step(key, 1, currentStock)}
                                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            {delta !== 0 && (
                              <div className={cn('text-center text-[9px] font-bold uppercase tracking-wide', delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                → {nextStock}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 rounded-lg px-4 py-2.5 mt-3 border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('newTotalStock') || 'New Total Stock'}</span>
                <span className={cn('text-lg font-black', variantTotals.delta === 0 ? 'text-slate-700 dark:text-slate-200' : variantTotals.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                  {variantTotals.next} <span className="text-xs font-medium text-slate-400">{product.baseUnit}</span>
                  {variantTotals.delta !== 0 && <span className="ml-1 text-xs font-bold">({variantTotals.delta > 0 ? '+' : ''}{variantTotals.delta})</span>}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('adjustmentDifference')}</label>
              <p className="text-[10px] text-slate-400 mb-2">{t('adjustmentHint')}</p>
              <div className="relative">
                <input
                  required
                  type="number"
                  step="any"
                  value={form.difference}
                  onChange={e => setForm({...form, difference: e.target.value})}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500 font-mono font-bold"
                  placeholder="-5 or +10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{product.baseUnit}</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('reasonRequired')}</label>
            <select 
              required
              value={form.reason}
              onChange={e => setForm({...form, reason: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500"
            >
              {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('notesOptional')}</label>
            <textarea 
              value={form.notes}
              onChange={e => setForm({...form, notes: e.target.value})}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-slate-500 min-h-[80px]"
              placeholder={t('notesPlaceholder') || "Detailed explanation..."}
            />
          </div>
        </form>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <button 
          form="adjust-form"
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />} 
          {t('confirmAdjustment')}
        </button>
      </div>
    </div>
  );
}
