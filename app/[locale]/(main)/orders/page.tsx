'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { Loader2, Plus, ClipboardList, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrdersPage() {
  const t = useTranslations('Orders');
  const activeShopId = useBusinessStore(s => s.activeShopId);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const [orderNumber, setOrderNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingOrder, setDeletingOrder] = useState<any>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [activeShopId]);

  async function fetchOrders() {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } catch (err) {
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/orders', {
        orderNumber,
        totalAmount: parseFloat(totalAmount)
      });
      toast.success(t('createSuccess'));
      setShowAdd(false);
      setOrderNumber('');
      setTotalAmount('');
      fetchOrders();
    } catch (err) {
      toast.error(t('createError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    try {
      await api.put(`/orders/${editingOrder.id}`, {
        orderNumber: editingOrder.orderNumber,
        status: editingOrder.status,
        totalAmount: parseFloat(editingOrder.totalAmount)
      });
      toast.success(t('orderUpdatedSuccessfully') || 'Order updated successfully');
      setEditingOrder(null);
      fetchOrders();
    } catch (err) {
      toast.error(t('updateError') || 'Failed to update order');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    setDeleteSaving(true);
    try {
      await api.delete(`/orders/${deletingOrder.id}`);
      toast.success(t('orderDeletedSuccessfully') || 'Order deleted successfully');
      setDeletingOrder(null);
      fetchOrders();
    } catch (err) {
      toast.error(t('deleteError') || 'Failed to delete order');
    } finally {
      setDeleteSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ClipboardList size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-500 font-medium">{t('subtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> {t('newOrder')}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('orderNumber')}</label>
              <input required value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder={t('orderNumberPlaceholder')} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('totalAmount')}</label>
              <input required type="number" min="0" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">{t('cancel')}</button>
            <button type="submit" disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
              {saving ? t('saving') : t('saveOrder')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {t('noOrdersFound')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('colDate')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('colOrderNumber')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t('colAmount')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t('colActions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900 dark:text-white text-right">
                      ₹{order.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingOrder({ ...order, totalAmount: order.totalAmount.toString() })}
                          className="p-1.5 text-slate-400 hover:text-emerald-500 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingOrder(order)}
                          className="p-1.5 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <form onSubmit={handleUpdate} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil size={18} className="text-emerald-500" />
                {t('editOrder') || 'Edit Order'}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Order Number <span className="text-red-500">*</span></label>
                <input required value={editingOrder.orderNumber} onChange={e => setEditingOrder({...editingOrder, orderNumber: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status <span className="text-red-500">*</span></label>
                <select required value={editingOrder.status} onChange={e => setEditingOrder({...editingOrder, status: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white">
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Total Amount <span className="text-red-500">*</span></label>
                <input required type="number" min="0" step="0.01" value={editingOrder.totalAmount} onChange={e => setEditingOrder({...editingOrder, totalAmount: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
              <button type="button" onClick={() => setEditingOrder(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">{t('cancel') || 'Cancel'}</button>
              <button type="submit" disabled={editSaving} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-2">
                {editSaving ? <><Loader2 size={16} className="animate-spin" /> {t('saving') || 'Saving...'}</> : (t('saveOrder') || 'Save Changes')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center mx-auto mb-5">
                <Trash2 size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('deleteOrder') || 'Delete Order'}?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{t('confirmDeleteOrder') || 'Are you sure you want to delete order'} <strong className="text-slate-700 dark:text-slate-300">{deletingOrder.orderNumber}</strong>? {t('cannotBeUndone') || 'This action cannot be undone.'}</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeletingOrder(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors">{t('cancel') || 'Cancel'}</button>
                <button onClick={handleDelete} disabled={deleteSaving} className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {deleteSaving ? <><Loader2 size={16} className="animate-spin" /> {t('deleting') || 'Deleting'}</> : (t('deleteOrder') || 'Delete Order')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
