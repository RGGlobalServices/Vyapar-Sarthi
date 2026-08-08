'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { Loader2, Plus, ClipboardList, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, Filter, X, AlertTriangle, CalendarClock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ExportButton } from '@/lib/hooks/useExport';

const fetcher = (url: string) => api.get(url).then(res => res.data);
const listFetcher = (url: string) => api.get(url).then(res => Array.isArray(res.data) ? res.data : (res.data?.data || []));

type Direction = 'incoming' | 'outgoing';

const emptyForm = (direction: Direction) => ({
  orderNumber: '',
  direction,
  customerId: '',
  supplierId: '',
  totalAmount: '',
  expectedDate: '',
  notes: '',
});

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  processing: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  completed: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400',
};

export default function OrdersPage() {
  const t = useTranslations('Orders');
  const activeShopId = useBusinessStore(s => s.activeShopId);

  const [direction, setDirection] = useState<Direction>('incoming');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [scheduledOnly, setScheduledOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const ordersQuery = useMemo(() => {
    const params = new URLSearchParams({ direction });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return `/orders?${params.toString()}`;
  }, [direction, debouncedSearch, statusFilter, dateFrom, dateTo]);

  const { data: orders = [], mutate: mutateOrders, isLoading } = useSWR(
    activeShopId ? [ordersQuery, activeShopId] : null,
    () => listFetcher(ordersQuery)
  );

  const { data: parties = [] } = useSWR(activeShopId ? ['/crm/customers?type=party', activeShopId] : null, () => listFetcher('/crm/customers?type=party'));
  const { data: suppliers = [] } = useSWR(activeShopId ? ['/suppliers', activeShopId] : null, () => listFetcher('/suppliers'));

  const visibleOrders = scheduledOnly
    ? orders.filter((o: any) => o.expectedDate && o.status !== 'completed' && o.status !== 'cancelled')
    : orders;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = (o: any) => o.expectedDate && o.status !== 'completed' && o.status !== 'cancelled' && new Date(o.expectedDate) < today;

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm('incoming'));
  const [saving, setSaving] = useState(false);

  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingOrder, setDeletingOrder] = useState<any>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const openAdd = () => {
    setForm(emptyForm(direction));
    setShowAdd(true);
  };

  const openEdit = (order: any) => {
    setEditingOrder(order);
    setEditForm({
      orderNumber: order.orderNumber,
      status: order.status,
      direction: order.direction || 'incoming',
      customerId: order.customerId || '',
      supplierId: order.supplierId || '',
      totalAmount: order.totalAmount.toString(),
      expectedDate: order.expectedDate ? new Date(order.expectedDate).toISOString().split('T')[0] : '',
      notes: order.notes || '',
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/orders', {
        orderNumber: form.orderNumber,
        direction: form.direction,
        customerId: form.direction === 'incoming' ? (form.customerId || undefined) : undefined,
        supplierId: form.direction === 'outgoing' ? (form.supplierId || undefined) : undefined,
        totalAmount: parseFloat(form.totalAmount) || 0,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success(t('createSuccess') || 'Order created');
      setShowAdd(false);
      mutateOrders();
    } catch (err) {
      toast.error(t('createError') || 'Failed to create order');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    try {
      await api.put(`/orders/${editingOrder.id}`, {
        orderNumber: editForm.orderNumber,
        status: editForm.status,
        direction: editForm.direction,
        customerId: editForm.direction === 'incoming' ? (editForm.customerId || undefined) : undefined,
        supplierId: editForm.direction === 'outgoing' ? (editForm.supplierId || undefined) : undefined,
        totalAmount: parseFloat(editForm.totalAmount) || 0,
        expectedDate: editForm.expectedDate || undefined,
        notes: editForm.notes || undefined,
      });
      toast.success(t('orderUpdatedSuccessfully') || 'Order updated successfully');
      setEditingOrder(null);
      mutateOrders();
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
      mutateOrders();
    } catch (err) {
      toast.error(t('deleteError') || 'Failed to delete order');
    } finally {
      setDeleteSaving(false);
    }
  }

  const counterpartyLabel = (o: any) => {
    if (o.direction === 'outgoing') return o.supplier?.name || t('noSupplierLinked') || 'No supplier linked';
    return o.customer?.shopName || o.customer?.name || t('noPartyLinked') || 'No party linked';
  };

  const exportRows = useMemo(() => visibleOrders.map((o: any) => ({
    date: o.createdAt,
    orderNumber: o.orderNumber,
    counterparty: counterpartyLabel(o),
    direction: o.direction === 'outgoing' ? 'To Supplier' : 'From Party',
    status: o.status,
    expectedDate: o.expectedDate,
    amount: o.totalAmount,
    notes: o.notes || '',
  })), [visibleOrders]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ClipboardList size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-500 font-medium">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            filename={`orders-${direction}`}
            title={direction === 'outgoing' ? 'Orders to Suppliers' : 'Orders from Parties'}
            dateRange={dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : undefined}
            columns={[
              { key: 'date', label: 'Date', type: 'date' },
              { key: 'orderNumber', label: 'Order #' },
              { key: 'counterparty', label: direction === 'outgoing' ? 'Supplier' : 'Party' },
              { key: 'status', label: 'Status' },
              { key: 'expectedDate', label: 'Expected Date', type: 'date' },
              { key: 'amount', label: 'Amount', type: 'currency' },
              { key: 'notes', label: 'Notes' },
            ]}
            data={exportRows}
          />
          <button
            onClick={openAdd}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={16} /> {t('newOrder')}
          </button>
        </div>
      </div>

      {/* Direction Tabs */}
      <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm font-bold">
        <button
          onClick={() => setDirection('incoming')}
          className={cn('px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
            direction === 'incoming' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500')}
        >
          <ArrowDownToLine size={14} /> {t('fromParties') || 'From Parties'}
        </button>
        <button
          onClick={() => setDirection('outgoing')}
          className={cn('px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
            direction === 'outgoing' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500')}
        >
          <ArrowUpFromLine size={14} /> {t('toSuppliers') || 'To Suppliers'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchOrdersPlaceholder') || 'Search order #, party, or supplier...'}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setScheduledOnly(v => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors shrink-0',
              scheduledOnly
                ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            )}
          >
            <CalendarClock size={15} /> {t('scheduledOnly') || 'Scheduled Only'}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors shrink-0',
              showFilters || statusFilter || dateFrom || dateTo
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            )}
          >
            <Filter size={15} /> {t('filters') || 'Filters'}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 animate-in fade-in slide-in-from-top-1">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t('colStatus') || 'Status'}</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">{t('allStatuses') || 'All Statuses'}</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t('fromDate') || 'From Date'}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t('toDate') || 'To Date'}</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            {(statusFilter || dateFrom || dateTo) && (
              <button type="button" onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); }} className="text-xs font-bold text-slate-500 hover:text-red-500 flex items-center gap-1 self-end pb-2">
                <X size={12} /> {t('clearFilters') || 'Clear filters'}
              </button>
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {form.direction === 'outgoing' ? <ArrowUpFromLine size={15} className="text-emerald-500" /> : <ArrowDownToLine size={15} className="text-emerald-500" />}
            {form.direction === 'outgoing' ? (t('newOutgoingOrder') || 'New Order to Supplier') : (t('newIncomingOrder') || 'New Order from Party')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('orderNumber')}</label>
              <input required value={form.orderNumber} onChange={e => setForm({ ...form, orderNumber: e.target.value })} placeholder={t('orderNumberPlaceholder')} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                {form.direction === 'outgoing' ? (t('supplierLabel') || 'Supplier') : (t('partyLabel') || 'Party')}
              </label>
              {form.direction === 'outgoing' ? (
                <select value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                  <option value="">{t('selectSupplier') || 'Select Supplier'}</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                  <option value="">{t('selectParty') || 'Select Party'}</option>
                  {parties.map((p: any) => <option key={p.id} value={p.id}>{p.shopName || p.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('totalAmount')}</label>
              <input required type="number" min="0" step="0.01" value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })} placeholder="0.00" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('expectedDate') || 'Expected / Scheduled Date'}</label>
              <input type="date" value={form.expectedDate} onChange={e => setForm({ ...form, expectedDate: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('notesOptional') || 'Notes (Optional)'}</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={t('orderNotesPlaceholder') || 'What is this order for...'} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
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
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
        ) : visibleOrders.length === 0 ? (
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
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{direction === 'outgoing' ? (t('supplierLabel') || 'Supplier') : (t('partyLabel') || 'Party')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('expectedDate') || 'Expected Date'}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t('colAmount')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t('colActions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleOrders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {order.orderNumber}
                      {order.notes && <p className="text-xs font-normal text-slate-400 truncate max-w-[180px]">{order.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{counterpartyLabel(order)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={cn('px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider', STATUS_STYLES[order.status] || STATUS_STYLES.pending)}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {order.expectedDate ? (
                        <span className={cn('flex items-center gap-1', isOverdue(order) ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-600 dark:text-slate-400')}>
                          {isOverdue(order) && <AlertTriangle size={12} />}
                          {new Date(order.expectedDate).toLocaleDateString('en-IN')}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900 dark:text-white text-right">
                      ₹{order.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(order)}
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
      {editingOrder && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <form onSubmit={handleUpdate} className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil size={18} className="text-emerald-500" />
                {t('editOrder') || 'Edit Order'}
              </h2>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('orderNumber') || 'Order Number'} <span className="text-red-500">*</span></label>
                <input required value={editForm.orderNumber} onChange={e => setEditForm({ ...editForm, orderNumber: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white" />
              </div>

              <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold w-full">
                <button type="button" onClick={() => setEditForm({ ...editForm, direction: 'incoming' })}
                  className={cn('flex-1 px-3 py-1.5 rounded-md transition-colors', editForm.direction === 'incoming' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500')}>
                  {t('fromParties') || 'From Party'}
                </button>
                <button type="button" onClick={() => setEditForm({ ...editForm, direction: 'outgoing' })}
                  className={cn('flex-1 px-3 py-1.5 rounded-md transition-colors', editForm.direction === 'outgoing' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500')}>
                  {t('toSuppliers') || 'To Supplier'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {editForm.direction === 'outgoing' ? (t('supplierLabel') || 'Supplier') : (t('partyLabel') || 'Party')}
                </label>
                {editForm.direction === 'outgoing' ? (
                  <select value={editForm.supplierId} onChange={e => setEditForm({ ...editForm, supplierId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white">
                    <option value="">{t('selectSupplier') || 'Select Supplier'}</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <select value={editForm.customerId} onChange={e => setEditForm({ ...editForm, customerId: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white">
                    <option value="">{t('selectParty') || 'Select Party'}</option>
                    {parties.map((p: any) => <option key={p.id} value={p.id}>{p.shopName || p.name}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('colStatus') || 'Status'} <span className="text-red-500">*</span></label>
                <select required value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white">
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('expectedDate') || 'Expected / Scheduled Date'}</label>
                <input type="date" value={editForm.expectedDate} onChange={e => setEditForm({ ...editForm, expectedDate: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('totalAmount') || 'Total Amount'} <span className="text-red-500">*</span></label>
                <input required type="number" min="0" step="0.01" value={editForm.totalAmount} onChange={e => setEditForm({ ...editForm, totalAmount: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('notesOptional') || 'Notes (Optional)'}</label>
                <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors text-slate-900 dark:text-white" />
              </div>
              {editForm.status === 'completed' && editingOrder.completedAt && (
                <p className="text-xs text-slate-400">{t('completedOn') || 'Completed on'}: {new Date(editingOrder.completedAt).toLocaleDateString('en-IN')}</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 shrink-0">
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
