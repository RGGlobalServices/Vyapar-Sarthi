'use client';

import { useState, useEffect } from 'react';
import { Plus, X, GripVertical, Loader2, CheckCircle2, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

type Props = {
  productId: string;
  productName: string;
  onSaved?: (stages: string[]) => void;
};

/**
 * StageTemplateManager - inline editor for per-product mill processing stages.
 *
 * Stored in Product.metadata.processingStages. No new table or schema migration required.
 * Usage: embed on the Product Master page for raw_material products.
 */
export default function StageTemplateManager({ productId, productName, onSaved }: Props) {
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  // Load existing template on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/mill/stage-templates/${productId}`)
      .then((r) => { if (!cancelled) { setStages(r.data.stages ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const markDirty = (newStages: string[]) => {
    setStages(newStages);
    setDirty(true);
    setSavedOk(false);
    setError('');
  };

  const addStage = () => markDirty([...stages, '']);

  const updateStage = (i: number, val: string) =>
    markDirty(stages.map((s, idx) => (idx === i ? val : s)));

  const removeStage = (i: number) =>
    markDirty(stages.filter((_, idx) => idx !== i));

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...stages];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    markDirty(next);
  };

  const moveDown = (i: number) => {
    if (i === stages.length - 1) return;
    const next = [...stages];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    markDirty(next);
  };

  const save = async () => {
    const cleaned = stages.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setError('Add at least one stage before saving.');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await api.put(`/mill/stage-templates/${productId}`, { stages: cleaned });
      setStages(res.data.stages);
      setDirty(false);
      setSavedOk(true);
      onSaved?.(res.data.stages);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to save stages');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-slate-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading stage template...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stage list */}
      <div className="space-y-2">
        {stages.length === 0 && (
          <p className="text-[11px] text-slate-400 italic">
            No stages configured. Add stages below to auto-populate them on new batches.
          </p>
        )}
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-2">
            {/* Order badge */}
            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-black flex items-center justify-center shrink-0">
              {i + 1}
            </span>

            {/* Stage name input */}
            <input
              value={stage}
              onChange={(e) => updateStage(i, e.target.value)}
              placeholder={`Stage ${i + 1} name (e.g. Cleaning)`}
              className="flex-1 h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 outline-none"
              maxLength={60}
            />

            {/* Move up/down */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="h-4 w-6 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                title="Move up"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === stages.length - 1}
                className="h-4 w-6 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                title="Move down"
              >
                <ChevronDown size={12} />
              </button>
            </div>

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeStage(i)}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              title="Remove stage"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add stage button */}
      <button
        type="button"
        onClick={addStage}
        disabled={stages.length >= 20}
        className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 disabled:opacity-40 px-2 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <Plus size={13} /> Add Stage
      </button>

      {/* Flow preview */}
      {stages.filter(Boolean).length > 0 && (
        <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          {stages.filter(Boolean).map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                {s.trim()}
              </span>
              {i < stages.filter(Boolean).length - 1 && (
                <span className="text-slate-400 text-[10px]">→</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Error / success */}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </p>
      )}
      {savedOk && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={12} /> Stage template saved for {productName}
        </p>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={save}
        disabled={!dirty || saving}
        className={cn(
          'h-9 px-4 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors',
          dirty
            ? 'bg-amber-600 hover:bg-amber-700 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
        )}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        {saving ? 'Saving...' : 'Save Stages'}
      </button>
    </div>
  );
}