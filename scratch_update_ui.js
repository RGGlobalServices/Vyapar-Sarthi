const fs = require('fs');

const file = 'c:\\current working project\\kirana-manager-main\\app\\[locale]\\(main)\\raw-material\\page.tsx';
let text = fs.readFileSync(file, 'utf8');

// 1. Update product fetch
text = text.replace(
  "const { data: products = [] } = useSWR<Product[]>(activeShopId ? ['/products', activeShopId] : null, ([u]) => fetcher(u));\n  const rawProducts = useMemo(\n    () => products.filter(p => !p.millCategory || p.millCategory === 'raw_material'),\n    [products],\n  );",
  "const { data: rawProducts = [] } = useSWR<Product[]>(activeShopId ? ['/products?isRawMaterial=true', activeShopId] : null, ([u]) => fetcher(u));\n  const products = rawProducts; // fallback for AddLotModal"
);

// 2. Remove lotNumber from form state
text = text.replace(
  "productId: '', lotNumber: '', supplierId: '', farmerName: '', purchaseDate: new Date().toISOString().slice(0, 10),",
  "productId: '', supplierId: '', farmerName: '', purchaseDate: new Date().toISOString().slice(0, 10),"
);

// 3. Add successMsg to form state area
text = text.replace(
  "const [saving, setSaving] = useState(false);\n  const [error, setError] = useState('');",
  "const [saving, setSaving] = useState(false);\n  const [error, setError] = useState('');\n  const [successMsg, setSuccessMsg] = useState('');"
);

// 4. Update computedTotal logic
text = text.replace(
  "const per = kgPerUnit(form.unit) || 1;\n  const weightInKg = (Number(form.quantity) || 0) * per;\n  const ratePerKg = Number(form.ratePerUnit) || 0;\n  const computedTotal = weightInKg > 0 && ratePerKg > 0 ? Math.round(weightInKg * ratePerKg * 100) / 100 : null;",
  "const qty = Number(form.quantity) || 0;\n  const ratePerUnit = Number(form.ratePerUnit) || 0;\n  const computedTotal = qty > 0 && ratePerUnit > 0 ? Math.round(qty * ratePerUnit * 100) / 100 : null;"
);

// 5. Remove lotNumber from importFromSlip
text = text.replace(
  "productId: w.productId || f.productId,\n      lotNumber: w.slipNumber,\n      supplierId: w.supplierId || f.supplierId,",
  "productId: w.productId || f.productId,\n      supplierId: w.supplierId || f.supplierId,"
);

// 6. Remove lotNumber from importFromPurchase
text = text.replace(
  "productId: c.productId,\n      lotNumber: c.lotNumber,\n      supplierId: (c as any).supplierId || '',",
  "productId: c.productId,\n      supplierId: (c as any).supplierId || '',"
);

// 7. Fix submit function for slipId
text = text.replace(
  "await api.post(`/mill/weighbridge/${slipId}/convert-to-lot`, {\n          productId: form.productId, lotNumber: form.lotNumber, farmerName: form.farmerName,\n          ratePerUnit: form.ratePerUnit || undefined, moisturePct: form.moisturePct || undefined,\n        });\n        onAdded();\n        return;",
  "const res = await api.post(`/mill/weighbridge/${slipId}/convert-to-lot`, {\n          productId: form.productId, farmerName: form.farmerName,\n          ratePerUnit: form.ratePerUnit ? Number(form.ratePerUnit) : undefined, moisturePct: form.moisturePct ? Number(form.moisturePct) : undefined,\n        });\n        setSuccessMsg(`Lot ${res.data?.lotNumber || 'created'} successfully!`);\n        setTimeout(onAdded, 1500);\n        return;"
);

// 8. Fix submit function for raw-lots
text = text.replace(
  "await api.post('/mill/raw-lots', {\n        purchaseItemId: importKey ? importKey.split(':')[1] : undefined,\n        productId: form.productId,\n        godownId: form.godownId || undefined,\n        supplierId: form.supplierId || undefined,\n        lotNumber: form.lotNumber,\n        farmerName: form.farmerName,\n        purchaseDate: form.purchaseDate,\n        quantity: form.quantity,\n        unit: form.unit,\n        moisturePct: form.moisturePct || undefined,\n        ratePerUnit: form.ratePerUnit || undefined,\n        notes: form.notes,\n      });\n      onAdded();",
  "const res = await api.post('/mill/raw-lots', {\n        purchaseItemId: importKey ? importKey.split(':')[1] : undefined,\n        productId: form.productId,\n        godownId: form.godownId || undefined,\n        supplierId: form.supplierId || undefined,\n        farmerName: form.farmerName,\n        purchaseDate: form.purchaseDate,\n        quantity: Number(form.quantity),\n        unit: form.unit,\n        moisturePct: form.moisturePct ? Number(form.moisturePct) : null,\n        ratePerUnit: form.ratePerUnit ? Number(form.ratePerUnit) : null,\n        notes: form.notes,\n      });\n      setSuccessMsg(`Lot ${res.data?.lotNumber || 'created'} successfully!`);\n      setTimeout(onAdded, 1500);"
);

// 9. Fix error cleanup on submit
text = text.replace(
  "setSaving(true); setError('');",
  "setSaving(true); setError(''); setSuccessMsg('');"
);

// 10. Remove lot number from UI inputs
text = text.replace(
  "          <div className=\"grid grid-cols-2 gap-2\">\n            <label className=\"block\">\n              <span className=\"block text-xs font-bold uppercase text-slate-500 mb-1\">Lot Number</span>\n              <input\n                value={form.lotNumber}\n                onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))}\n                placeholder=\"Auto if blank\"\n                className=\"w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm\"\n              />\n            </label>\n            <label className=\"block\">\n              <span className=\"block text-xs font-bold uppercase text-slate-500 mb-1\">Received Date</span>\n              <input\n                type=\"date\"\n                value={form.purchaseDate}\n                onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}\n                className=\"w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm\"\n              />\n            </label>\n          </div>",
  "          <div className=\"grid grid-cols-2 gap-2\">\n            <label className=\"block col-span-2 sm:col-span-1\">\n              <span className=\"block text-xs font-bold uppercase text-slate-500 mb-1\">Received Date</span>\n              <input\n                type=\"date\"\n                value={form.purchaseDate}\n                onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}\n                className=\"w-full h-10 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm\"\n              />\n            </label>\n          </div>"
);

// 11. Rename Rate / Kg
text = text.replace(
  "<span className=\"block text-xs font-bold uppercase text-slate-500 mb-1\">Rate / Kg (₹)</span>",
  "<span className=\"block text-xs font-bold uppercase text-slate-500 mb-1\">Rate per Unit (₹)</span>"
);

// 12. Add success message under error
text = text.replace(
  "{error && <p className=\"text-sm text-red-500\">{error}</p>}\n          <button",
  "{error && <p className=\"text-sm text-red-500\">{error}</p>}\n          {successMsg && <p className=\"text-sm font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30\">{successMsg}</p>}\n          <button"
);

// 13. Disable button when success message is showing
text = text.replace(
  "disabled={saving || !form.quantity || !form.productId}",
  "disabled={saving || !form.quantity || !form.productId || !!successMsg}"
);

fs.writeFileSync(file, text);
console.log('done');
