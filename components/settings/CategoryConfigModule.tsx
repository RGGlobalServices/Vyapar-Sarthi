'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight, GripVertical, Tag } from 'lucide-react';
import api from '@/lib/api';
import { DEFAULT_CATEGORY_CONFIGS, type CategoryConfig, type AttributeDef, type AttributeType } from '@/lib/categoryConfig';

const ATTR_TYPES: AttributeType[] = ['select', 'text', 'number', 'date', 'boolean'];

// ─── tiny helpers ───────────────────────────────────────────────────────────

function emptyAttr(): AttributeDef {
  return { key: '', label: '', type: 'text', required: false, inVariant: false, options: [] };
}

function emptyConfig(): CategoryConfig {
  return {
    slug: '',
    name: '',
    emoji: '',
    industryCategoryName: '',
    sortOrder: 0,
    active: true,
    attributeSchema: {
      variantAxes: [],
      attributes: [],
      billingDisplayFields: [],
      cartColumns: [],
      showBatch: false,
      showExpiry: false,
      showSerial: false,
      showWarranty: false,
      dualUnit: false,
    },
  };
}

// ─── AttributeRow ────────────────────────────────────────────────────────────

function AttributeRow({
  attr,
  onChange,
  onRemove,
}: {
  attr: AttributeDef;
  onChange: (a: AttributeDef) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg mb-2">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 shrink-0 w-28 truncate">{attr.key || '(new)'}</span>
        <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">{attr.label || '—'}</span>
        <span className="text-xs text-slate-400 shrink-0">{attr.type}</span>
        {attr.inVariant && (
          <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 rounded shrink-0">variant axis</span>
        )}
        {attr.required && (
          <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded shrink-0">required</span>
        )}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-slate-400 hover:text-rose-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-700/50 pt-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">Key (machine)</span>
            <input
              value={attr.key}
              onChange={e => onChange({ ...attr, key: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
              className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm font-mono"
              placeholder="e.g. color"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">Label (display)</span>
            <input
              value={attr.label}
              onChange={e => onChange({ ...attr, label: e.target.value })}
              className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
              placeholder="e.g. Color"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">Type</span>
            <select
              value={attr.type}
              onChange={e => onChange({ ...attr, type: e.target.value as AttributeType })}
              className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
            >
              {ATTR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">Hindi label</span>
            <input
              value={attr.labelHi ?? ''}
              onChange={e => onChange({ ...attr, labelHi: e.target.value })}
              className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
            />
          </label>

          <div className="col-span-2 flex gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={attr.required}
                onChange={e => onChange({ ...attr, required: e.target.checked })}
                className="rounded"
              />
              <span>Required</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={attr.inVariant}
                onChange={e => onChange({ ...attr, inVariant: e.target.checked })}
                className="rounded"
              />
              <span>Variant axis (separate cart line per value)</span>
            </label>
          </div>

          {attr.type === 'select' && (
            <div className="col-span-2 flex flex-col gap-1 text-xs">
              <span className="text-slate-500">Options (comma-separated, leave blank for free-form)</span>
              <input
                value={(attr.options ?? []).join(', ')}
                onChange={e => onChange({ ...attr, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
                placeholder="e.g. Black, Brown, White"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ConfigEditor ─────────────────────────────────────────────────────────────

function ConfigEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CategoryConfig;
  onSave: (cfg: CategoryConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<CategoryConfig>(JSON.parse(JSON.stringify(initial)));
  const [saving, setSaving] = useState(false);

  const schema = cfg.attributeSchema;
  const setSchema = (patch: Partial<typeof schema>) =>
    setCfg(c => ({ ...c, attributeSchema: { ...c.attributeSchema, ...patch } }));

  const updateAttr = (i: number, a: AttributeDef) => {
    const attrs = [...schema.attributes];
    attrs[i] = a;
    setSchema({ attributes: attrs });
  };
  const removeAttr = (i: number) => {
    const attrs = schema.attributes.filter((_, idx) => idx !== i);
    setSchema({ attributes: attrs });
  };
  const addAttr = () => setSchema({ attributes: [...schema.attributes, emptyAttr()] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(cfg); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-4">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Slug <span className="text-rose-500">*</span></span>
          <input
            required
            value={cfg.slug}
            onChange={e => setCfg(c => ({ ...c, slug: e.target.value.replace(/\s+/g, '-').toLowerCase() }))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm font-mono"
            placeholder="e.g. footwear"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Name <span className="text-rose-500">*</span></span>
          <input
            required
            value={cfg.name}
            onChange={e => setCfg(c => ({ ...c, name: e.target.value }))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
            placeholder="e.g. Footwear Wholesale"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Hindi Name</span>
          <input
            value={cfg.nameHi ?? ''}
            onChange={e => setCfg(c => ({ ...c, nameHi: e.target.value }))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Marathi Name</span>
          <input
            value={cfg.nameMr ?? ''}
            onChange={e => setCfg(c => ({ ...c, nameMr: e.target.value }))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Emoji</span>
          <input
            value={cfg.emoji ?? ''}
            onChange={e => setCfg(c => ({ ...c, emoji: e.target.value }))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm w-20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">Industry Category Name (matches IndustryCategory.name)</span>
          <input
            value={cfg.industryCategoryName ?? ''}
            onChange={e => setCfg(c => ({ ...c, industryCategoryName: e.target.value }))}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
            placeholder="e.g. Footwear Wholesale"
          />
        </label>
      </div>

      {/* Feature toggles */}
      <div>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Features</p>
        <div className="flex flex-wrap gap-4">
          {([
            ['showBatch', 'Batch tracking'],
            ['showExpiry', 'Expiry date'],
            ['showSerial', 'Serial / IMEI'],
            ['showWarranty', 'Warranty'],
            ['dualUnit', 'Dual unit (e.g. Bags × Kg)'],
          ] as [keyof typeof schema, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!!(schema as any)[key]}
                onChange={e => setSchema({ [key]: e.target.checked } as any)}
                className="rounded"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Dual unit config */}
      {schema.dualUnit && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40">
          <p className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-400">Dual Unit Config</p>
          {[
            ['primaryUnit', 'Primary Unit (e.g. Bag)'],
            ['secondaryUnit', 'Secondary Unit (e.g. Kg)'],
            ['conversionLabel', 'Label (e.g. 25 Kg / Bag)'],
          ].map(([k, l]) => (
            <label key={k} className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">{l}</span>
              <input
                value={(schema.dualUnitConfig as any)?.[k] ?? ''}
                onChange={e => setSchema({ dualUnitConfig: { ...schema.dualUnitConfig, primaryUnit: schema.dualUnitConfig?.primaryUnit ?? '', secondaryUnit: schema.dualUnitConfig?.secondaryUnit ?? '', conversionFactor: schema.dualUnitConfig?.conversionFactor ?? 1, conversionLabel: schema.dualUnitConfig?.conversionLabel ?? '', [k]: e.target.value } as any })}
                className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">Conversion Factor</span>
            <input
              type="number"
              value={schema.dualUnitConfig?.conversionFactor ?? 1}
              onChange={e => setSchema({ dualUnitConfig: { ...schema.dualUnitConfig, primaryUnit: schema.dualUnitConfig?.primaryUnit ?? '', secondaryUnit: schema.dualUnitConfig?.secondaryUnit ?? '', conversionLabel: schema.dualUnitConfig?.conversionLabel ?? '', conversionFactor: Number(e.target.value) } })}
              className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
            />
          </label>
        </div>
      )}

      {/* Attributes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Attributes ({schema.attributes.length})</p>
          <button
            type="button"
            onClick={addAttr}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            <Plus className="w-3.5 h-3.5" /> Add Attribute
          </button>
        </div>
        {schema.attributes.length === 0 && (
          <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            No attributes yet. Click "Add Attribute" to start.
          </p>
        )}
        {schema.attributes.map((a, i) => (
          <AttributeRow key={i} attr={a} onChange={v => updateAttr(i, v)} onRemove={() => removeAttr(i)} />
        ))}
      </div>

      {/* Billing display fields */}
      <div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500 font-medium">Billing Display Fields (comma-separated attribute keys)</span>
          <p className="text-slate-400 text-[11px]">These appear as sub-text under the product name in the cart and invoice.</p>
          <input
            value={schema.billingDisplayFields.join(', ')}
            onChange={e => setSchema({ billingDisplayFields: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm font-mono"
            placeholder="e.g. color, size"
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Config
        </button>
      </div>
    </form>
  );
}

// ─── Main module ──────────────────────────────────────────────────────────────

export default function CategoryConfigModule() {
  const [configs, setConfigs] = useState<CategoryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CategoryConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const flash = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/category-configs');
      setConfigs(res.data);
    } catch {
      // Fall back to built-in defaults so the UI is always useful
      setConfigs(DEFAULT_CATEGORY_CONFIGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (cfg: CategoryConfig) => {
    await api.post('/category-configs', cfg);
    flash('success', `"${cfg.name}" saved.`);
    setEditing(null);
    setCreating(false);
    load();
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Deactivate this category config?')) return;
    await api.delete(`/category-configs/${slug}`);
    flash('success', 'Config deactivated.');
    load();
  };

  if (creating) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setCreating(false)} className="text-slate-500 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">New Category Config</h2>
        </div>
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <ConfigEditor initial={emptyConfig()} onSave={handleSave} onCancel={() => setCreating(false)} />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Edit — {editing.name}</h2>
        </div>
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <ConfigEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-500" />
            Category Attribute Config
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure which product attributes and billing columns each industry category uses.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> New Config
        </button>
      </div>

      {/* Status toast */}
      {status && (
        <div className={`text-sm px-4 py-2.5 rounded-lg ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700'}`}>
          {status.msg}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {configs.map(cfg => (
            <div
              key={cfg.slug}
              className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 flex items-start gap-3"
            >
              <span className="text-2xl shrink-0 mt-0.5">{cfg.emoji ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{cfg.name}</span>
                  <span className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{cfg.slug}</span>
                  {!cfg.active && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">inactive</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {cfg.attributeSchema.attributes.map(a => (
                    <span key={a.key} className={`text-[11px] px-1.5 py-0.5 rounded border ${a.inVariant ? 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-300' : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'}`}>
                      {a.label}
                      {a.inVariant && <span className="ml-1 opacity-60">↗</span>}
                    </span>
                  ))}
                  {cfg.attributeSchema.showBatch && <span className="text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">Batch</span>}
                  {cfg.attributeSchema.showExpiry && <span className="text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">Expiry</span>}
                  {cfg.attributeSchema.showSerial && <span className="text-[11px] px-1.5 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">Serial</span>}
                  {cfg.attributeSchema.showWarranty && <span className="text-[11px] px-1.5 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">Warranty</span>}
                  {cfg.attributeSchema.dualUnit && <span className="text-[11px] px-1.5 py-0.5 rounded border bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300">Dual Unit</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditing(cfg)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(cfg.slug)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                  title="Deactivate"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
