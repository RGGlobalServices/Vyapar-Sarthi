'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { fieldLabel, optionLabel, sectionLabel } from '@/lib/millLabels';
import { cn } from '@/lib/utils';
import { Check, Loader2, Layers, Cpu, ShieldCheck, Scale, PackageCheck, FileText, AlertTriangle } from 'lucide-react';

// All DECIMAL field codes that contribute to the output side of the balance
const BALANCE_OUTPUT_CODES = new Set([
  'output_qty', 'cleaned_output_qty', 'destoned_output_qty', 'milled_output_qty',
  'fine_main_output_qty', 'accepted_output_qty', 'packed_qty',
  'grade_1_output_qty', 'grade_2_output_qty', 'grade_3_output_qty',
]);
const BALANCE_WASTE_CODES = new Set([
  'waste_loss_qty', 'dust_foreign_matter_qty', 'stone_foreign_matter_qty',
  'rejected_qty', 'bran_byproduct_qty', 'coarse_broken_qty',
  'byproduct_qty', 'packing_waste_qty',
]);

const fetcher = (url: string) => api.get(url).then((res) => res.data);

interface Props {
  batchId: string;
  stageId: string;
  isReadOnly: boolean;
  onRefreshBatch: () => void;
  products?: any[];
  batch?: any;
}

export default function DynamicExecutionFields({
  batchId,
  stageId,
  isReadOnly,
  onRefreshBatch,
  products = [],
  batch,
}: Props) {
  const t = useTranslations('Mill');
  const { data: rawFields, mutate: mutateFields } = useSWR<any[]>(
    `/mill/batches/${batchId}/stages/${stageId}/execution`,
    fetcher
  );

  const fields: any[] = Array.isArray(rawFields) ? rawFields : [];

  const { data: batchData } = useSWR<any>(
    !batch && batchId ? `/mill/batches/${batchId}` : null,
    fetcher
  );
  const currentBatch = batch || batchData || null;

  const { data: machinesData } = useSWR<any[]>('/mill/machines', fetcher);
  const machines: any[] = Array.isArray(machinesData) ? machinesData : [];

  const { data: rawLotsData } = useSWR<any[]>('/mill/raw-lots', fetcher);
  const rawLots: any[] = Array.isArray(rawLotsData) ? rawLotsData : [];

  const { data: productsData } = useSWR<any[]>('/mill/products', fetcher);
  const productList: any[] = products.length > 0 ? products : (Array.isArray(productsData) ? productsData : []);

  const [formValues, setFormValues] = useState<{ [fieldCode: string]: any }>({});
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fields.length > 0) {
      const initial: { [fieldCode: string]: any } = {};
      const batchLotId = currentBatch?.rawLotId || currentBatch?.rawLot?.id || '';
      const batchProdId = currentBatch?.rawLot?.productId || currentBatch?.rawLot?.product?.id || currentBatch?.outputProductId || currentBatch?.outputProduct?.id || '';
      const batchInputKg = currentBatch?.inputKg ? String(currentBatch.inputKg) : '';

      fields.forEach((f) => {
        let val = f.actualValue ?? '';
        if (val === '' || val === null || val === '0.00' || val === 0) {
          if (f.fieldCode === 'input_material' && batchProdId) {
            val = batchProdId;
          } else if (f.fieldCode === 'input_lot' && batchLotId) {
            val = batchLotId;
          } else if (f.fieldCode === 'input_qty' && batchInputKg) {
            val = batchInputKg;
          }
        }
        initial[f.fieldCode] = val;
      });
      setFormValues(initial);
    }
  }, [fields, currentBatch]);

  if (!rawFields) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500 text-xs gap-2">
        <Loader2 className="animate-spin text-indigo-600" size={18} />
        <span>{t('exec_loading')}</span>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        {t('exec_noFields')}
      </div>
    );
  }

  // Group fields by section
  const sections: { [sectionName: string]: any[] } = {};
  fields.forEach((f) => {
    const sec = f.section?.trim() || 'General Details';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(f);
  });

  const sectionOrderMap: { [key: string]: { order: number; icon: any; title: string } } = {
    INPUT: { order: 1, icon: Layers, title: t('sec_input') },
    PROCESS: { order: 2, icon: Cpu, title: t('sec_process') },
    MACHINE: { order: 2, icon: Cpu, title: t('sec_machine') },
    OPERATOR: { order: 2, icon: Cpu, title: t('sec_operator') },
    TIMING: { order: 2, icon: Cpu, title: t('sec_timing') },
    OUTPUT: { order: 3, icon: Scale, title: t('sec_output') },
    QUALITY: { order: 4, icon: ShieldCheck, title: t('sec_quality') },
    PACKAGING: { order: 5, icon: PackageCheck, title: t('sec_packaging') },
    NOTES: { order: 6, icon: FileText, title: t('sec_notes') },
    GENERAL: { order: 7, icon: Layers, title: t('sec_general') },
  };

  const sortedSections = Object.entries(sections).sort(([a], [b]) => {
    const orderA = sectionOrderMap[a.toUpperCase()]?.order || 99;
    const orderB = sectionOrderMap[b.toUpperCase()]?.order || 99;
    return orderA - orderB;
  });

  const handleChange = (fieldCode: string, value: any) => {
    setFormValues((prev) => {
      const next = { ...prev, [fieldCode]: value };

      // Packing stage auto-calculations:
      // - When pack_size changes → suggest number_of_packs = floor(input / size), packed_qty = packs * size
      // - When number_of_packs changes → update packed_qty = packs * size
      if (fieldCode === 'pack_size' || fieldCode === 'number_of_packs') {
        const packSize = fieldCode === 'pack_size' ? Number(value) : Number(prev['pack_size']);
        const inputQty = Number(prev['input_qty'] || 0);

        if (packSize > 0) {
          if (fieldCode === 'pack_size' && inputQty > 0) {
            const bags = Math.floor(inputQty / packSize);
            next['number_of_packs'] = String(bags);
            next['packed_qty'] = String(bags * packSize);
            next['packaging_material_qty'] = String(bags);
          } else {
            const bags = fieldCode === 'number_of_packs' ? Number(value) : Number(prev['number_of_packs'] || 0);
            if (bags > 0) {
              next['packed_qty'] = String(bags * packSize);
              next['packaging_material_qty'] = String(bags);
            }
          }
        }
      }

      return next;
    });
    setSavedSuccess(false);
  };

  const handleSaveExecution = async () => {
    setSaving(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const payload = {
        executionFields: Object.entries(formValues).map(([fieldCode, actualValue]) => ({
          fieldCode,
          actualValue: actualValue !== '' ? actualValue : null,
        })),
      };

      const res = await api.patch(`/mill/batches/${batchId}/stages/${stageId}/execution`, payload);
      // Update fields cache with response data — no extra network round-trip needed
      mutateFields(res.data, { revalidate: false });
      setSavedSuccess(true);
      // Fire batch refresh in background without blocking the save-success state
      onRefreshBatch();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || t('exec_saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const renderFieldInput = (field: any) => {
    const val = formValues[field.fieldCode] ?? '';
    const disabled = isReadOnly;

    switch (field.fieldType) {
      case 'NUMBER':
      case 'DECIMAL':
        return (
          <div className="relative mt-1 flex items-center">
            <input
              type="number"
              step={field.fieldType === 'DECIMAL' ? 'any' : '1'}
              disabled={disabled}
              value={val}
              placeholder={field.placeholder || '0.00'}
              onChange={(e) => handleChange(field.fieldCode, e.target.value)}
              className={cn(
                'w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
                disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
              )}
            />
            {field.unit && (
              <span className="absolute right-3 text-xs font-bold text-slate-400 uppercase pointer-events-none">
                {field.unit}
              </span>
            )}
          </div>
        );

      case 'SELECT': {
        const opts = Array.isArray(field.options) ? field.options : [];
        return (
          <select
            disabled={disabled}
            value={val}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          >
            <option value="">{t('exec_selectOption')}</option>
            {opts.map((opt: string) => (
              <option key={opt} value={opt}>
                {optionLabel(t, opt)}
              </option>
            ))}
          </select>
        );
      }

      case 'PRODUCT': {
        return (
          <select
            disabled={disabled}
            value={val}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          >
            <option value="">{t('exec_selectProduct')}</option>
            {productList.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.baseUnit ? `(${p.baseUnit})` : ''}
              </option>
            ))}
          </select>
        );
      }

      case 'LOT': {
        return (
          <select
            disabled={disabled}
            value={val}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          >
            <option value="">{t('exec_selectLot')}</option>
            {rawLots.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.lotNumber || t('exec_lot')} – {l.product?.name || ''} ({l.remainingQuantity ?? l.quantity} kg)
              </option>
            ))}
          </select>
        );
      }

      case 'MACHINE': {
        return (
          <select
            disabled={disabled}
            value={val}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          >
            <option value="">{t('exec_selectMachine')}</option>
            {machines.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.machineType ? `· ${m.machineType}` : ''} {m.status === 'under_maintenance' ? t('exec_inService') : ''}
              </option>
            ))}
          </select>
        );
      }

      case 'MULTI_SELECT': {
        const opts = Array.isArray(field.options) ? field.options : [];
        const currentArr: string[] = Array.isArray(val) ? val : [];
        return (
          <div className="mt-1 flex flex-wrap gap-2 p-2 border rounded-lg bg-slate-50 dark:bg-slate-800">
            {opts.map((opt: string) => {
              const isChecked = currentArr.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={isChecked}
                    onChange={(e) => {
                      let nextArr: string[];
                      if (e.target.checked) {
                        nextArr = [...currentArr, opt];
                      } else {
                        nextArr = currentArr.filter((item) => item !== opt);
                      }
                      handleChange(field.fieldCode, nextArr);
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  {optionLabel(t, opt)}
                </label>
              );
            })}
          </div>
        );
      }

      case 'BOOLEAN':
        return (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(val)}
              onChange={(e) => handleChange(field.fieldCode, e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {field.helpText || (val ? t('exec_yes') : t('exec_no'))}
            </span>
          </div>
        );

      case 'DATE':
        return (
          <input
            type="date"
            disabled={disabled}
            value={val ? String(val).split('T')[0] : ''}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          />
        );

      case 'DATETIME':
        return (
          <input
            type="datetime-local"
            disabled={disabled}
            value={val ? String(val).substring(0, 16) : ''}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          />
        );

      case 'TEXTAREA':
        return (
          <textarea
            rows={2}
            disabled={disabled}
            value={val}
            placeholder={field.placeholder || t('exec_notesPh')}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          />
        );

      case 'TEXT':
      case 'OPERATOR':
      default:
        return (
          <input
            type="text"
            disabled={disabled}
            value={val}
            placeholder={field.placeholder || (field.fieldType === 'OPERATOR' ? t('exec_operatorPh') : '')}
            onChange={(e) => handleChange(field.fieldCode, e.target.value)}
            className={cn(
              'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
              disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800/60'
            )}
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      {savedSuccess && (
        <div className="flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
          <Check className="w-4 h-4 mr-1.5 text-emerald-600" /> {t('exec_saved')}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200" role="alert">
          {error}
        </div>
      )}

      <LiveBalanceBar formValues={formValues} t={t} />

      {sortedSections.map(([secName, secFields]) => {
        const secMeta = sectionOrderMap[secName.toUpperCase()] || { icon: Layers, title: secName };
        const IconComponent = secMeta.icon;

        return (
          <div key={secName} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <IconComponent className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  {secMeta.title || sectionLabel(t, secName.toLowerCase(), secName)}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {secFields.map((field) => (
                <div key={field.id} className="bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {fieldLabel(t, field.fieldName)}
                    {field.unit && <span className="ml-1 text-slate-400 font-normal">({field.unit})</span>}
                    {field.isRequired && <span className="text-red-500 font-bold ml-1">*</span>}
                  </label>
                  {field.description && (
                    <p className="text-[11px] text-slate-400">{field.description}</p>
                  )}
                  {renderFieldInput(field)}
                  {field.helpText && (
                    <p className="text-[11px] text-slate-400 italic mt-0.5">{field.helpText}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!isReadOnly && (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSaveExecution}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 shadow transition"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} {t('exec_save')}
          </button>
        </div>
      )}
    </div>
  );
}

function computeBalance(formValues: Record<string, any>) {
  const inputKg = parseFloat(formValues['input_qty'] ?? '') || 0;
  let outputKg = 0;
  let wasteKg = 0;
  for (const [code, val] of Object.entries(formValues)) {
    const num = parseFloat(val ?? '') || 0;
    if (!num) continue;
    if (BALANCE_OUTPUT_CODES.has(code)) outputKg += num;
    else if (BALANCE_WASTE_CODES.has(code)) wasteKg += num;
  }
  const totalOut = parseFloat((outputKg + wasteKg).toFixed(3));
  const remaining = parseFloat((inputKg - totalOut).toFixed(3));
  const isOver = remaining < -0.001;
  const isBalanced = inputKg > 0 && Math.abs(remaining) < 0.001;
  return { inputKg, outputKg, wasteKg, totalOut, remaining, isOver, isBalanced };
}

/** Compact live balance bar — sits at the TOP of the form so it updates in view as the user types. */
function LiveBalanceBar({ formValues, t }: { formValues: Record<string, any>; t: (k: string) => string }) {
  const { inputKg, outputKg, wasteKg, remaining, isOver, isBalanced } = computeBalance(formValues);
  const hasAny = inputKg > 0 || outputKg > 0 || wasteKg > 0;
  if (!hasAny) return null;

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 text-sm transition-colors',
      isOver
        ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
        : isBalanced
          ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700'
          : 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700'
    )}>
      {/* Title row */}
      <div className="flex items-center gap-2 mb-2">
        {isOver
          ? <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
          : isBalanced
            ? <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            : <Scale className="h-4 w-4 text-amber-600 flex-shrink-0" />}
        <span className={cn('font-bold text-xs uppercase tracking-wide',
          isOver ? 'text-red-700 dark:text-red-400'
          : isBalanced ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-amber-700 dark:text-amber-400'
        )}>
          {isOver ? t('exec_overInput') : isBalanced ? t('exec_balanced') : t('exec_materialBalance')}
        </span>
      </div>

      {/* Inline equation */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
        <span className="text-slate-600 dark:text-slate-400">
          {t('exec_input')} <span className="text-base font-black text-slate-800 dark:text-white">{inputKg > 0 ? inputKg.toLocaleString() : '—'}</span> kg
        </span>
        <span className="text-slate-400">=</span>
        <span className="text-blue-600 dark:text-blue-400">
          {t('exec_output')} <span className="text-base font-black">{outputKg > 0 ? outputKg.toLocaleString() : '—'}</span> kg
        </span>
        <span className="text-slate-400">+</span>
        <span className="text-orange-500 dark:text-orange-400">
          {t('exec_waste')} <span className="text-base font-black">{wasteKg > 0 ? wasteKg.toLocaleString() : '—'}</span> kg
        </span>
        {inputKg > 0 && (
          <>
            <span className="text-slate-400">+</span>
            <span className={cn('font-black text-base', isOver ? 'text-red-600' : isBalanced ? 'text-emerald-600' : 'text-amber-600')}>
              {isOver ? `+${Math.abs(remaining).toLocaleString()}` : remaining.toLocaleString()} kg
            </span>
            <span className={cn('text-[10px] font-semibold',
              isOver ? 'text-red-500' : isBalanced ? 'text-emerald-600' : 'text-amber-500'
            )}>
              {isOver ? t('exec_over') : isBalanced ? t('exec_balancedLabel') : t('exec_unaccounted')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

