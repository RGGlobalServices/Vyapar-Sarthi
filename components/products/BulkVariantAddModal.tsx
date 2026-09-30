'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Plus, Copy, Trash2, Wand2, ClipboardPaste, Sparkles, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { parseVariantTitle, baseKey } from '@/lib/variantTitleParser';

type Row = { id: number; name: string; color: string; size: string; stock: string; cost: string; price: string; mrp: string };

const emptyRow = (id: number, from?: Partial<Row>): Row => ({
  id, name: from?.name ?? '', color: '', size: '', stock: '', cost: from?.cost ?? '', price: from?.price ?? '', mrp: from?.mrp ?? '',
});

const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const csv = (s: string) => Array.from(new Set(s.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean)));

/**
 * Add many products / many colour-size variants at once.
 *  - "Product family": one name × colours × sizes -> a row per combination, then just type quantities.
 *  - Paste from Excel/Sheets: Name, Colour, Size, Qty, Cost, Price, MRP (tab separated).
 *  - "Split size & colour from title": 'JAANZARA TG0968CD 36X40 PLAIN' -> base + 36X40 + Plain.
 * Rows sharing a base name are saved as ONE product with variants (POST /products/bulk-create).
 */
export default function BulkVariantAddModal({
  onClose, onDone, category,
}: { onClose: () => void; onDone: () => void; category?: string }) {
  const nextId = useMemo(() => { let n = 1; return () => n++; }, []);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(0)]);
  const [famName, setFamName] = useState('');
  const [famColors, setFamColors] = useState('');
  const [famSizes, setFamSizes] = useState('');
  const [famQty, setFamQty] = useState('');
  const [famCost, setFamCost] = useState('');
  const [famPrice, setFamPrice] = useState('');
  const [famMrp, setFamMrp] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = (from?: Row) => setRows((rs) => [...rs, emptyRow(nextId(), from ? { name: from.name, cost: from.cost, price: from.price, mrp: from.mrp } : undefined)]);

  const generateFamily = () => {
    const name = famName.trim();
    if (!name) { toast.error('Enter the product name first'); return; }
    const colors = csv(famColors);
    const sizes = csv(famSizes);
    if (!colors.length && !sizes.length) { toast.error('Enter at least one colour or size'); return; }
    const combos: Array<[string, string]> = [];
    for (const c of colors.length ? colors : ['']) for (const s of sizes.length ? sizes : ['']) combos.push([c, s]);
    const made = combos.map(([c, s]) => ({ ...emptyRow(nextId()), name, color: c, size: s, stock: famQty, cost: famCost, price: famPrice, mrp: famMrp }));
    setRows((rs) => [...rs.filter((r) => r.name || r.color || r.size || r.stock), ...made]);
    toast.success(`${made.length} variant rows added — fill the quantities`);
  };

  const applyPaste = () => {
    const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const made: Row[] = [];
    lines.forEach((line, i) => {
      const c = line.split(/\t|\s{2,}|\s*\|\s*/).map((x) => x.trim());
      // skip a header line (Qty column not numeric)
      if (i === 0 && c.length >= 4 && c[3] !== '' && Number.isNaN(Number(c[3]))) return;
      made.push({ ...emptyRow(nextId()), name: c[0] || '', color: c[1] || '', size: c[2] || '', stock: c[3] || '', cost: c[4] || '', price: c[5] || '', mrp: c[6] || '' });
    });
    setRows((rs) => [...rs.filter((r) => r.name || r.color || r.size || r.stock), ...made]);
    setPasteText(''); setShowPaste(false);
    toast.success(`${made.length} rows pasted`);
  };

  // Suggest base / size / colour from the title for rows that don't have them yet.
  const splitTitles = () => {
    let n = 0;
    setRows((rs) => rs.map((r) => {
      if (r.color || r.size) return r;
      const p = parseVariantTitle(r.name);
      if (p.confidence === 'low') return r;
      n++;
      return { ...r, name: p.baseName, size: p.size, color: p.color };
    }));
    toast.success(n ? `Split ${n} titles into name + size + colour — please check them` : 'No size found in the titles');
  };

  const fillDown = () => setRows((rs) => {
    const f = rs.find((r) => r.cost || r.price || r.mrp);
    if (!f) return rs;
    return rs.map((r) => ({ ...r, cost: r.cost || f.cost, price: r.price || f.price, mrp: r.mrp || f.mrp }));
  });

  const filled = rows.filter((r) => r.name.trim());
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filled) {
      const k = baseKey(r.name);
      m.set(k, [...(m.get(k) || []), r]);
    }
    return m;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalQty = filled.reduce((s, r) => s + num(r.stock), 0);
  const variantCount = filled.filter((r) => r.color || r.size).length;

  const submit = async () => {
    if (!filled.length) { toast.error('Add at least one product row'); return; }
    const products: any[] = [];
    for (const [, g] of groups) {
      const multi = g.length > 1;
      const bad = multi ? g.find((r) => !r.color.trim() && !r.size.trim()) : undefined;
      if (bad) { toast.error(`"${bad.name}": every row of a product with variants needs a colour or a size`); return; }
      const first = g[0];
      products.push({
        name: first.name.trim(),
        category: category || undefined,
        costPrice: num(first.cost) || undefined,
        wholesaleCost: num(first.cost) || undefined,
        sellingPrice: num(first.price) || undefined,
        mrp: num(first.mrp) || undefined,
        stock: multi ? undefined : num(first.stock),
        variants: g.filter((r) => r.color.trim() || r.size.trim()).map((r) => ({
          color: r.color.trim(), size: r.size.trim(), stock: num(r.stock),
          costPrice: num(r.cost) || undefined, wholesalePrice: num(r.cost) || undefined,
          sellingPrice: num(r.price) || undefined, mrp: num(r.mrp) || undefined,
        })),
      });
    }
    setSaving(true);
    try {
      const res = await api.post('/products/bulk-create', { products });
      const { created, updated, failed, results } = res.data || {};
      if (failed) {
        const first = (results || []).find((r: any) => r.status === 'error');
        toast.error(`${failed} failed${first ? `: ${first.name} — ${first.error}` : ''}`);
      }
      if (created || updated) toast.success(`${created || 0} added, ${updated || 0} updated`);
      if (!failed) { onDone(); onClose(); }
      else if (created || updated) onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Bulk add failed');
    } finally { setSaving(false); }
  };

  const cell = 'w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-slate-500';

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-black text-lg text-slate-900 dark:text-white">Bulk Add Products &amp; Variants</h2>
            <p className="text-xs text-slate-500">Same name = one product with colour/size variants. Fill many rows, save once.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Product family generator */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400"><Sparkles size={15} /> Quick: one product, many colours &amp; sizes</div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <div className="col-span-2"><div className={lbl}>Product name</div><input className={cell} value={famName} onChange={(e) => setFamName(e.target.value)} placeholder="e.g. K BEAUTY 7273" /></div>
              <div><div className={lbl}>Colours (comma)</div><input className={cell} value={famColors} onChange={(e) => setFamColors(e.target.value)} placeholder="Red, Blue" /></div>
              <div><div className={lbl}>Sizes (comma)</div><input className={cell} value={famSizes} onChange={(e) => setFamSizes(e.target.value)} placeholder="S, M, L" /></div>
              <div><div className={lbl}>Qty each</div><input className={cell} inputMode="decimal" value={famQty} onChange={(e) => setFamQty(e.target.value)} /></div>
              <div><div className={lbl}>Cost</div><input className={cell} inputMode="decimal" value={famCost} onChange={(e) => setFamCost(e.target.value)} /></div>
              <div><div className={lbl}>Sell price</div><input className={cell} inputMode="decimal" value={famPrice} onChange={(e) => setFamPrice(e.target.value)} /></div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28"><div className={lbl}>MRP</div><input className={cell} inputMode="decimal" value={famMrp} onChange={(e) => setFamMrp(e.target.value)} /></div>
              <button onClick={generateFamily} className="bg-emerald-500 text-slate-900 font-bold text-sm px-4 py-2 rounded-lg hover:bg-emerald-400 flex items-center gap-1.5"><Wand2 size={15} /> Make rows</button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => addRow(rows[rows.length - 1])} className="px-3 py-1.5 text-sm font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Plus size={14} /> Add row</button>
            <button onClick={() => setShowPaste((v) => !v)} className="px-3 py-1.5 text-sm font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><ClipboardPaste size={14} /> Paste from Excel</button>
            <button onClick={splitTitles} title="JAANZARA TG0968CD 36X40 PLAIN → name + 36X40 + Plain" className="px-3 py-1.5 text-sm font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Wand2 size={14} /> Split size &amp; colour from title</button>
            <button onClick={fillDown} className="px-3 py-1.5 text-sm font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Copy prices to all rows</button>
          </div>

          {showPaste && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Columns in order: <b>Name, Colour, Size, Qty, Cost, Price, MRP</b> (copy the cells from Excel / Google Sheets and paste here).</p>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5} className={`${cell} font-mono`} placeholder={'K BEAUTY 7273\tOff White\t32X34\t6\t945\t1100\t1200'} />
              <button onClick={applyPaste} className="bg-emerald-500 text-slate-900 font-bold text-sm px-4 py-1.5 rounded-lg">Add pasted rows</button>
            </div>
          )}

          {/* Rows */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="px-1 py-1">Product name</th><th className="px-1 py-1 w-28">Colour</th><th className="px-1 py-1 w-24">Size</th>
                  <th className="px-1 py-1 w-20">Qty</th><th className="px-1 py-1 w-24">Cost</th><th className="px-1 py-1 w-24">Sell price</th><th className="px-1 py-1 w-24">MRP</th><th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id}>
                    <td className="p-1"><input className={cell} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder="Product name" /></td>
                    <td className="p-1"><input className={cell} value={r.color} onChange={(e) => update(r.id, { color: e.target.value })} /></td>
                    <td className="p-1"><input className={cell} value={r.size} onChange={(e) => update(r.id, { size: e.target.value })} /></td>
                    <td className="p-1"><input className={cell} inputMode="decimal" value={r.stock} onChange={(e) => update(r.id, { stock: e.target.value })} /></td>
                    <td className="p-1"><input className={cell} inputMode="decimal" value={r.cost} onChange={(e) => update(r.id, { cost: e.target.value })} /></td>
                    <td className="p-1"><input className={cell} inputMode="decimal" value={r.price} onChange={(e) => update(r.id, { price: e.target.value })} /></td>
                    <td className="p-1"><input className={cell} inputMode="decimal" value={r.mrp} onChange={(e) => update(r.id, { mrp: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && idx === rows.length - 1) { e.preventDefault(); addRow(r); } }} /></td>
                    <td className="p-1 whitespace-nowrap">
                      <button title="Duplicate row" onClick={() => setRows((rs) => { const i = rs.findIndex((x) => x.id === r.id); const c = { ...r, id: nextId() }; return [...rs.slice(0, i + 1), c, ...rs.slice(i + 1)]; })} className="p-1.5 text-slate-500 hover:text-emerald-500"><Copy size={14} /></button>
                      <button title="Remove row" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : [emptyRow(nextId())]))} className="p-1.5 text-slate-500 hover:text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <b className="text-slate-900 dark:text-white">{groups.size}</b> products · <b className="text-slate-900 dark:text-white">{variantCount}</b> variants · <b className="text-slate-900 dark:text-white">{totalQty}</b> pcs
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Cancel</button>
            <button onClick={submit} disabled={saving || !filled.length} className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />} Save all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
