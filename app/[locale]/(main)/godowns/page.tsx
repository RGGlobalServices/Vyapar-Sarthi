'use client';

import { useState, useEffect } from 'react';
import { Warehouse, Plus, X, Pencil, Trash2, Package, ArrowRightLeft, ChevronRight, Check, Search, Loader2, Hash, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { useLocale } from 'next-intl';

const inp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

export default function GodownsPage() {
  const { profile } = useBusinessStore();
  const locale = useLocale();
  const isWholesale = profile.subscriptionPlan === 'wholesale';

  const [godowns, setGodowns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Modals
  const [modal, setModal] = useState<'new' | 'edit' | 'addProduct' | 'transfer' | null>(null);
  const [godownForm, setGodownForm] = useState({ name: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Product-in-godown form
  const [productSearch, setProductSearch] = useState('');
  const [shopProducts, setShopProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [savingStock, setSavingStock] = useState(false);

  // Transfer form
  const [transfer, setTransfer] = useState({ fromId: '', toId: '', productId: '', qty: '' });
  const [transferring, setTransferring] = useState(false);

  useEffect(() => { if (isWholesale) loadGodowns(); else setLoading(false); }, [isWholesale]);

  async function loadGodowns() {
    setLoading(true);
    try {
      const r = await api.get('/godowns');
      setGodowns(r.data || []);
    } catch {}
    finally { setLoading(false); }
  }

  async function loadShopProducts() {
    if (shopProducts.length > 0) return;
    setLoadingProducts(true);
    try {
      const r = await api.get('/products');
      setProducts(r.data || []);
      setShopProducts(r.data || []);
    } catch {}
    finally { setLoadingProducts(false); }
  }

  async function handleSaveGodown(e: React.FormEvent) {
    e.preventDefault();
    if (!godownForm.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'new') {
        await api.post('/godowns', godownForm);
      } else if (modal === 'edit' && selected) {
        await api.patch(`/godowns/${selected.id}`, godownForm);
      }
      await loadGodowns();
      setModal(null);
      setGodownForm({ name: '', location: '' });
      if (modal === 'edit') {
        const r = await api.get(`/godowns/${selected.id}`);
        setSelected(r.data);
      }
    } catch { alert('Failed to save godown.'); }
    finally { setSaving(false); }
  }

  async function handleDeleteGodown() {
    if (!deleteId) return;
    try {
      await api.delete(`/godowns/${deleteId}`);
      setGodowns(g => g.filter(d => d.id !== deleteId));
      if (selected?.id === deleteId) setSelected(null);
    } catch { alert('Failed to delete godown.'); }
    finally { setDeleteId(null); }
  }

  async function handleAddStock(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !selectedProduct || !stockQty) return;
    setSavingStock(true);
    try {
      await api.post(`/godowns/${selected.id}/inventory`, {
        productId: selectedProduct.id,
        quantity: parseFloat(stockQty),
      });
      const r = await api.get(`/godowns/${selected.id}`);
      setSelected(r.data);
      setModal(null);
      setSelectedProduct(null);
      setStockQty('');
      setProductSearch('');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to add stock.');
    } finally { setSavingStock(false); }
  }

  async function handleRemoveFromGodown(productId: string) {
    if (!selected) return;
    try {
      await api.delete(`/godowns/${selected.id}/inventory/${productId}`);
      setSelected((s: any) => ({ ...s, inventory: s.inventory.filter((i: any) => i.productId !== productId) }));
    } catch { alert('Failed to remove product.'); }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transfer.fromId || !transfer.toId || !transfer.productId || !transfer.qty) return;
    setTransferring(true);
    try {
      await api.post('/godowns/transfer', {
        fromGodownId: transfer.fromId,
        toGodownId: transfer.toId,
        productId: transfer.productId,
        quantity: parseFloat(transfer.qty),
      });
      await loadGodowns();
      if (selected) {
        const r = await api.get(`/godowns/${selected.id}`);
        setSelected(r.data);
      }
      setModal(null);
      setTransfer({ fromId: '', toId: '', productId: '', qty: '' });
      alert('Stock transferred successfully!');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Transfer failed.');
    } finally { setTransferring(false); }
  }

  if (!isWholesale) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Warehouse className="text-emerald-400" /> Godowns</h1>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5">
          <CardContent className="p-8 text-center">
            <Warehouse className="w-16 h-16 mx-auto mb-4 text-amber-400" />
            <h2 className="text-xl font-bold text-white mb-2">Wholesale Plan Required</h2>
            <p className="text-slate-400 mb-6">Godown management is available on the Wholesale plan.</p>
            <a href={`/${locale}/payment?plan=wholesale`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all">
              Upgrade to Wholesale
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Detail view for a selected godown ──────────────────────────────────────
  if (selected) {
    const filteredInventory = (selected.inventory || []).filter((i: any) =>
      !productSearch || i.product?.name?.toLowerCase().includes(productSearch.toLowerCase())
    );
    const totalItems = (selected.inventory || []).length;
    const totalQty = (selected.inventory || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);

    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white truncate">{selected.name}</h1>
              <span className="text-xs font-mono bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                {selected.godownCode}
              </span>
            </div>
            {selected.location && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={11} />{selected.location}</p>}
          </div>
          <button onClick={() => { setGodownForm({ name: selected.name, location: selected.location || '' }); setModal('edit'); }}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"><Pencil size={16} /></button>
          <button onClick={() => setDeleteId(selected.id)}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Products', value: totalItems, color: 'text-blue-400' },
            { label: 'Total Units', value: totalQty.toLocaleString('en-IN'), color: 'text-emerald-400' },
            { label: 'Godown ID', value: selected.godownCode, color: 'text-slate-300', mono: true },
          ].map(({ label, value, color, mono }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <p className={cn('text-base font-bold', color, mono && 'font-mono text-sm')}>{value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={() => { loadShopProducts(); setModal('addProduct'); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-colors text-sm">
            <Plus size={16} /> Add Product Stock
          </button>
          {godowns.length > 1 && (
            <button onClick={() => { setTransfer({ fromId: selected.id, toId: '', productId: '', qty: '' }); setModal('transfer'); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors text-sm">
              <ArrowRightLeft size={16} /> Transfer
            </button>
          )}
        </div>

        {/* Inventory list */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
              <p className="text-sm font-bold text-slate-200 flex-1">Inventory</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-40"
                  placeholder="Search products…" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              </div>
            </div>
            {filteredInventory.length === 0 ? (
              <p className="px-5 py-12 text-center text-slate-500 text-sm">
                {totalItems === 0 ? 'No products added yet. Click "Add Product Stock" to start.' : 'No products match your search.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-800">
                {filteredInventory.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <Package size={15} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{item.product?.name}</p>
                      <p className="text-[11px] text-slate-500">{item.product?.category} · {item.product?.baseUnit}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-emerald-400">{item.quantity.toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-slate-500">{item.product?.baseUnit}</p>
                    </div>
                    <button onClick={() => handleRemoveFromGodown(item.productId)}
                      className="p-1.5 text-slate-700 hover:text-red-400 transition-colors ml-1">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit modal */}
        {modal === 'edit' && (
          <GModal title="Edit Godown" onClose={() => setModal(null)}>
            <form onSubmit={handleSaveGodown} className="space-y-4">
              <GField label="Godown Name"><input required className={inp} value={godownForm.name} onChange={e => setGodownForm(f => ({ ...f, name: e.target.value }))} /></GField>
              <GField label="Location (optional)"><input className={inp} placeholder="e.g. Sector 12, Warehouse B" value={godownForm.location} onChange={e => setGodownForm(f => ({ ...f, location: e.target.value }))} /></GField>
              <GActions onCancel={() => setModal(null)} saving={saving} label="Save Changes" />
            </form>
          </GModal>
        )}

        {/* Add product modal */}
        {modal === 'addProduct' && (
          <GModal title="Add Product Stock" onClose={() => setModal(null)}>
            <form onSubmit={handleAddStock} className="space-y-4">
              <GField label="Search Product">
                {loadingProducts ? (
                  <div className="flex justify-center py-4"><Loader2 className="animate-spin text-emerald-400" size={20} /></div>
                ) : (
                  <>
                    <input className={inp} placeholder="Search by name…"
                      value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                      {(shopProducts).filter(p => !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase())).map((p: any) => (
                        <button key={p.id} type="button"
                          onClick={() => { setSelectedProduct(p); setProductSearch(p.name); }}
                          className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors',
                            selectedProduct?.id === p.id ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>
                          <span>{p.name}</span>
                          <span className="text-xs text-slate-500">{p.baseUnit}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </GField>
              {selectedProduct && (
                <GField label={`Quantity (${selectedProduct.baseUnit || 'units'})`}>
                  <input type="number" min="0" step="0.01" required className={inp} placeholder="0"
                    value={stockQty} onChange={e => setStockQty(e.target.value)} />
                </GField>
              )}
              <GActions onCancel={() => setModal(null)} saving={savingStock} label="Add Stock" disabled={!selectedProduct || !stockQty} />
            </form>
          </GModal>
        )}

        {/* Transfer modal */}
        {modal === 'transfer' && (
          <GModal title="Transfer Stock Between Godowns" onClose={() => setModal(null)}>
            <form onSubmit={handleTransfer} className="space-y-4">
              <GField label="From Godown">
                <select className={inp} value={transfer.fromId} onChange={e => setTransfer(f => ({ ...f, fromId: e.target.value, productId: '', qty: '' }))}>
                  <option value="">Select source godown</option>
                  {godowns.map(g => <option key={g.id} value={g.id}>{g.name} ({g.godownCode})</option>)}
                </select>
              </GField>
              <GField label="To Godown">
                <select className={inp} value={transfer.toId} onChange={e => setTransfer(f => ({ ...f, toId: e.target.value }))}>
                  <option value="">Select destination godown</option>
                  {godowns.filter(g => g.id !== transfer.fromId).map(g => <option key={g.id} value={g.id}>{g.name} ({g.godownCode})</option>)}
                </select>
              </GField>
              {transfer.fromId && (
                <GField label="Product">
                  <select className={inp} value={transfer.productId} onChange={e => setTransfer(f => ({ ...f, productId: e.target.value }))}>
                    <option value="">Select product</option>
                    {(godowns.find(g => g.id === transfer.fromId)?.inventory || []).map((i: any) => (
                      <option key={i.productId} value={i.productId}>{i.product?.name} (Avail: {i.quantity} {i.product?.baseUnit})</option>
                    ))}
                  </select>
                </GField>
              )}
              {transfer.productId && (
                <GField label="Quantity to Transfer">
                  <input type="number" min="0.01" step="0.01" required className={inp} placeholder="0"
                    value={transfer.qty} onChange={e => setTransfer(f => ({ ...f, qty: e.target.value }))} />
                </GField>
              )}
              <GActions onCancel={() => setModal(null)} saving={transferring} label="Transfer" disabled={!transfer.fromId || !transfer.toId || !transfer.productId || !transfer.qty} />
            </form>
          </GModal>
        )}

        {/* Delete confirm */}
        {deleteId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <p className="font-bold text-slate-100">Delete this godown?</p>
              <p className="text-sm text-slate-400">All inventory records will be removed.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium">Cancel</button>
                <button onClick={handleDeleteGodown} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold hover:bg-red-400">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Godown list view ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Warehouse className="text-emerald-400" /> Godowns
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage warehouse locations and track inventory per godown</p>
        </div>
        <button
          onClick={() => { setGodownForm({ name: '', location: '' }); setModal('new'); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all text-sm">
          <Plus size={16} /> New Godown
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
      ) : godowns.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-16 text-center">
            <Warehouse className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-base font-bold text-slate-300 mb-2">No Godowns Yet</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">Create your first godown to manage inventory across multiple warehouse locations.</p>
            <button onClick={() => { setGodownForm({ name: '', location: '' }); setModal('new'); }}
              className="px-6 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400">
              + Create First Godown
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {godowns.map(g => {
            const totalProducts = (g.inventory || []).length;
            const totalQty = (g.inventory || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
            return (
              <button key={g.id} onClick={() => setSelected(g)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 text-left transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <Warehouse size={20} className="text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-400 px-2 py-1 rounded-lg border border-slate-700">
                    {g.godownCode}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-1 truncate">{g.name}</h3>
                {g.location && <p className="text-xs text-slate-500 flex items-center gap-1 mb-3"><MapPin size={10} />{g.location}</p>}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Products</p>
                    <p className="text-lg font-bold text-blue-400">{totalProducts}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Total Units</p>
                    <p className="text-lg font-bold text-emerald-400">{totalQty.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* New godown modal */}
      {modal === 'new' && (
        <GModal title="New Godown" onClose={() => setModal(null)}>
          <form onSubmit={handleSaveGodown} className="space-y-4">
            <GField label="Godown Name"><input required autoFocus className={inp} placeholder="e.g. Main Warehouse, Cold Storage" value={godownForm.name} onChange={e => setGodownForm(f => ({ ...f, name: e.target.value }))} /></GField>
            <GField label="Location (optional)"><input className={inp} placeholder="e.g. Sector 12, Near Bus Stand" value={godownForm.location} onChange={e => setGodownForm(f => ({ ...f, location: e.target.value }))} /></GField>
            <div className="bg-slate-800/50 rounded-xl px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
              <Hash size={12} className="text-emerald-400" />
              A unique Godown ID (e.g. <span className="font-mono text-emerald-400">GDN-MAIN1234</span>) will be auto-generated.
            </div>
            <GActions onCancel={() => setModal(null)} saving={saving} label="Create Godown" />
          </form>
        </GModal>
      )}
    </div>
  );
}

function GModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={19} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function GField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>{children}</div>;
}

function GActions({ onCancel, saving, label, disabled }: { onCancel: () => void; saving: boolean; label: string; disabled?: boolean }) {
  return (
    <div className="flex gap-3 pt-1">
      <button type="button" onClick={onCancel} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-medium text-sm hover:bg-slate-700">Cancel</button>
      <button type="submit" disabled={saving || disabled} className="flex-1 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl text-sm hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2">
        {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : label}
      </button>
    </div>
  );
}
