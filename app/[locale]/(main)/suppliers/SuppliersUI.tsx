'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { Users, Plus, Search, MapPin, Mail, Phone, IndianRupee, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR from 'swr';

const fetcher = (url: string) => api.get(url).then(res => res.data || []);

export default function SuppliersUI() {
  const t = useTranslations('Suppliers');
  const { data: suppliers = [], mutate: mutateSuppliers, isLoading: loading } = useSWR('/suppliers', fetcher);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'edit' | 'delete' | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const currentForm = { ...form };
    const isEdit = !!currentForm.id;
    setModal(null);
    
    mutateSuppliers((current: any[] = []) => {
      if (isEdit) {
        return current.map(s => s.id === currentForm.id ? { ...s, ...currentForm } : s);
      }
      return [{ ...currentForm, id: 'temp-' + Date.now() }, ...current];
    }, false);

    try {
      if (isEdit) {
        await api.patch(`/suppliers/${currentForm.id}`, currentForm);
      } else {
        await api.post('/suppliers', currentForm);
      }
      await mutateSuppliers();
    } catch (err) {
      alert('Failed to save supplier');
      await mutateSuppliers();
      setModal('edit');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSupplier) return;
    setSaving(true);
    
    const idToDelete = selectedSupplier.id;
    setModal(null);
    mutateSuppliers((current: any[] = []) => current.filter(s => s.id !== idToDelete), false);
    
    try {
      await api.delete(`/suppliers/${idToDelete}`);
      await mutateSuppliers();
    } catch (err) {
      alert('Failed to delete supplier');
      await mutateSuppliers();
    } finally {
      setSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s: any) => 
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.gst && s.gst.toLowerCase().includes(search.toLowerCase()))
  );

  const inp = "w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 flex items-center gap-3">{t('title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">{t('manageDesc')}</p>
        </div>
        <button 
          onClick={() => { setForm({ name: '', contact: '', mobile: '', email: '', address: '', gst: '', balance: 0 }); setModal('edit'); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-sm">
          <Plus size={18} /> {t('addSupplier')}
        </button>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors shadow-sm"
              placeholder={t('searchPlaceholder')} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
        </div>
        
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('noSuppliers')}</h3>
            <p className="text-slate-500 text-sm">{t('noSuppliersFound')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium">
                <tr>
                  <th className="px-5 py-4">{t('supplierDetails')}</th>
                  <th className="px-5 py-4">{t('contactInfo')}</th>
                  <th className="px-5 py-4 text-right">{t('outstanding')}</th>
                  <th className="px-5 py-4 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSuppliers.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900 dark:text-white text-base mb-1">{s.name}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {s.gst && <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded">GST: {s.gst}</span>}
                        {s.contact && <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded">{t('colContact')}: {s.contact}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 space-y-1.5">
                      {s.mobile && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><Phone size={14} className="text-slate-400 dark:text-slate-500"/> {s.mobile}</p>}
                      {s.email && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><Mail size={14} className="text-slate-400 dark:text-slate-500"/> {s.email}</p>}
                      {s.address && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><MapPin size={14} className="text-slate-400 dark:text-slate-500"/> {s.address}</p>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className={cn("font-bold text-base font-mono", (s.balance || 0) > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300')}>
                        {(s.balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => { setForm(s); setModal('edit'); }} className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Pencil size={18} />
                      </button>
                      <button onClick={() => { setSelectedSupplier(s); setModal('delete'); }} className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ml-1">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit/Add Modal */}
      {modal === 'edit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <Card className="relative w-full max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">{form.id ? (t('editSupplier') || 'Edit Supplier') : (t('addSupplier') || 'Add Supplier')}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('companyNameLabel')}</label>
                <input required className={inp} value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. ABC Distributors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('contactPersonLabel')}</label>
                  <input className={inp} value={form.contact || ''} onChange={e => setForm({...form, contact: e.target.value})} placeholder="e.g. Rahul" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('mobileLabel')}</label>
                  <input className={inp} value={form.mobile || ''} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="e.g. 9876543210" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('gstinLabel')}</label>
                  <input className={inp} value={form.gst || ''} onChange={e => setForm({...form, gst: e.target.value})} placeholder="e.g. 27AADCB..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('openingBalanceLabel')}</label>
                  <input type="number" step="0.01" className={inp} value={form.balance || ''} onChange={e => setForm({...form, balance: e.target.value})} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('emailAddressLabel')}</label>
                <input type="email" className={inp} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} placeholder="e.g. contact@abc.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('fullAddressLabel')}</label>
                <textarea className={cn(inp, "resize-none h-20")} value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} placeholder="e.g. 123 Industrial Area, Phase 1" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">{t('cancel')}</button>
                <button type="submit" disabled={saving || !form.name} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                  {saving && <Loader2 size={16} className="animate-spin" />} Save Supplier
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <Card className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl p-5 text-center">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 flex items-center justify-center rounded-full mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-2">{t('deleteSupplier')}?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Are you sure you want to delete <strong className="text-slate-900 dark:text-white">{selectedSupplier?.name}</strong>? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">{t('cancel')}</button>
              <button onClick={handleDelete} disabled={saving} className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
