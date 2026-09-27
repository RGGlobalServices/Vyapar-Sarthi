'use client';
/**
 * DynamicCategoryAttributes
 * Renders product-level attribute inputs (non-variant) driven by CategoryConfig.
 * Variant-axis attributes (color, size, packSize…) are NOT shown here — they
 * appear as columns inside DynamicVariantBuilder.
 *
 * Values are stored under form.metadata.categoryAttributes[key].
 * Known top-level fields (brand, gender) fall through to their dedicated form
 * fields above this section — they are filtered out of the dynamic list.
 */
import { cn } from '@/lib/utils';
import type { CategoryAttributeSchema, AttributeDef } from '@/lib/categoryConfig';

// Keys that already have their own dedicated form fields — skip to avoid duplication
const TOP_LEVEL_KEYS = new Set(['brand', 'gender', 'color', 'size']);

interface Props {
  schema: CategoryAttributeSchema;
  /** Current values: form.metadata?.categoryAttributes */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  className?: string;
}

export default function DynamicCategoryAttributes({ schema, values, onChange, className }: Props) {
  // Only show product-level attributes: inVariant=false, not in TOP_LEVEL_KEYS
  const productAttrs = schema.attributes.filter(
    a => !a.inVariant && !TOP_LEVEL_KEYS.has(a.key)
  );

  if (productAttrs.length === 0) return null;

  const set = (key: string, val: string) => onChange({ ...values, [key]: val });

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-4 rounded bg-violet-500" />
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Category Attributes</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-5 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
        {productAttrs.map(attr => (
          <AttributeField
            key={attr.key}
            attr={attr}
            value={values[attr.key] ?? ''}
            onChange={val => set(attr.key, val)}
          />
        ))}
      </div>
    </section>
  );
}

function AttributeField({ attr, value, onChange }: { attr: AttributeDef; value: string; onChange: (v: string) => void }) {
  const cls = 'w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white shadow-sm transition-colors';

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
        {attr.label}
        {attr.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {attr.type === 'select' && attr.options && attr.options.length > 0 ? (
        <select className={cls} value={value} onChange={e => onChange(e.target.value)} required={attr.required}>
          <option value="">— Select —</option>
          {attr.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : attr.type === 'number' ? (
        <input
          type="number"
          className={cls}
          value={value}
          required={attr.required}
          placeholder={attr.placeholder ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      ) : attr.type === 'date' ? (
        <input type="date" className={cls} value={value} required={attr.required} onChange={e => onChange(e.target.value)} />
      ) : attr.type === 'boolean' ? (
        <select className={cls} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— Select —</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        // text or select-with-no-options (free-form)
        <input
          type="text"
          className={cls}
          value={value}
          required={attr.required}
          placeholder={attr.placeholder ?? `Enter ${attr.label.toLowerCase()}`}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
