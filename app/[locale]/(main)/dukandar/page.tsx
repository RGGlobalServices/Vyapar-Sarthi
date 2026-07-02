'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Store, AlertTriangle, Plus, Users, Copy, Check, Send, Loader2, Trash2, ChevronDown, FileText, X } from 'lucide-react';
import api from '@/lib/api';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';

export default function DukandarPage() {
  const t = useTranslations('Dukandar');
  const locale = useLocale();
  const { profile } = useBusinessStore();
  const [dukandar, setDukandar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'email' | 'code'>('email');
  const [retailerEmail, setRetailerEmail] = useState('');
  const [retailerCode, setRetailerCode] = useState('');
  const [addStatus, setAddStatus] = useState<{ type: string; msg: string } | null>(null);
  const [myAccessCode, setMyAccessCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [alertSending, setAlertSending] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedShopMap, setSelectedShopMap] = useState<Record<string, string>>({});
  const [alertStatusMap, setAlertStatusMap] = useState<Record<string, { type: 'success' | 'error' | 'info'; msg: string }>>({});

  // Tab and Quotation builder state
  const [activeTab, setActiveTab] = useState<'list' | 'history'>('list');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedQuotationAlert, setSelectedQuotationAlert] = useState<any | null>(null);
  const [quotationProducts, setQuotationProducts] = useState<any[]>([]);
  const [submittingQuotation, setSubmittingQuotation] = useState(false);

  useEffect(() => {
    if (profile.subscriptionPlan === 'wholesale') {
      loadDukandar();
    } else {
      loadMyAccessCode();
      setLoading(false);
    }
  }, [profile.subscriptionPlan]);

  async function loadDukandar() {
    try {
      const res = await api.get('/dukandar/my-dukandar');
      setDukandar(res.data || []);
    } catch (err) {
      console.error('Failed to load dukandar', err);
    } finally {
      setLoading(false);
    }
  }

  async function addDukandar(e: React.FormEvent) {
    e.preventDefault();
    setAddStatus(null);
    setAdding(true);
    setAddSuccess(false);
    try {
      if (addMode === 'email') {
        await api.post('/dukandar/add-dukandar', { retailerEmail });
      } else {
        await api.post('/dukandar/add-dukandar-by-code', { accessCode: retailerCode });
      }
      setAddSuccess(true);
      setAddStatus({ type: 'success', msg: t('addedSuccess') });
      setRetailerEmail('');
      setRetailerCode('');
      loadDukandar();
      setTimeout(() => {
        setShowAddModal(false);
        setAddSuccess(false);
      }, 1200);
    } catch (err: any) {
      setAddStatus({ type: 'error', msg: err?.response?.data?.detail || t('failedAdd') });
    } finally {
      setAdding(false);
    }
  }

  async function loadMyAccessCode() {
    try {
      const res = await api.get('/dukandar/my-access-code');
      setMyAccessCode(res.data.accessCode || '');
    } catch (err) {
      console.error('Failed to load dukandar access code', err);
    }
  }

  async function copyCode() {
    if (!myAccessCode) return;
    await navigator.clipboard.writeText(myAccessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function sendStockAlert(retailerId: string) {
    setAlertSending(retailerId);
    setAlertStatusMap(prev => {
      const copy = { ...prev };
      delete copy[retailerId];
      return copy;
    });
    try {
      await api.post('/dukandar/send-stock-alert', { retailerId });
      setAlertStatusMap(prev => ({
        ...prev,
        [retailerId]: { type: 'success', msg: t('alertSentSuccess') }
      }));
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t('failedSendAlert');
      const isNoStock = err?.response?.status === 400 && detail.includes('No low stock');
      setAlertStatusMap(prev => ({
        ...prev,
        [retailerId]: { type: isNoStock ? 'info' : 'error', msg: detail }
      }));
    } finally {
      setAlertSending(null);
      setTimeout(() => {
        setAlertStatusMap(prev => {
          const copy = { ...prev };
          delete copy[retailerId];
          return copy;
        });
      }, 5000);
    }
  }

  async function removeDukandar(relationshipId: string) {
    setDeletingId(relationshipId);
    try {
      await api.delete('/dukandar/remove', { data: { relationshipId } });
      setDukandar(prev => prev.filter(d => d.relationshipId !== relationshipId));
      setConfirmDeleteId(null);
      setAddStatus({ type: 'success', msg: t('removedSuccess') });
      setTimeout(() => setAddStatus(null), 3000);
    } catch (err: any) {
      setAddStatus({ type: 'error', msg: err?.response?.data?.detail || t('failedRemove') });
    } finally {
      setDeletingId(null);
    }
  }

  function switchShop(relationshipId: string, shopId: string) {
    setSelectedShopMap(prev => ({ ...prev, [relationshipId]: shopId }));
    loadDukandar();
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await api.get('/dukandar/sent-alerts');
      setHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load history alerts', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function openQuotationModal(alert: any) {
    setSelectedQuotationAlert(alert);
    setQuotationProducts([]);
    try {
      const res = await api.get(`/dukandar/quotation/${alert.id}`);
      setQuotationProducts(res.data.products || []);
    } catch (err: any) {
      window.alert(err?.response?.data?.detail || t('failedLoadQuotation'));
      setSelectedQuotationAlert(null);
    }
  }

  function handleQuotationFieldChange(productId: string, field: string, value: any) {
    setQuotationProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, [field]: value } : p
    ));
  }

  async function submitQuotation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQuotationAlert) return;
    setSubmittingQuotation(true);
    try {
      await api.post(`/dukandar/quotation/${selectedQuotationAlert.id}`, {
        products: quotationProducts.map(p => ({
          id: p.id,
          name: p.name,
          currentStock: p.currentStock,
          minStock: p.minStock,
          baseUnit: p.baseUnit || p.unit,
          quantity: Number(p.quantity || 0),
          sellingPrice: Number(p.sellingPrice || 0),
          wholesaleCost: Number(p.wholesaleCost || 0),
        }))
      });
      setAddStatus({ type: 'success', msg: t('quotationSentSuccess') });
      setSelectedQuotationAlert(null);
      loadHistory();
      setTimeout(() => setAddStatus(null), 3000);
    } catch (err: any) {
      window.alert(err?.response?.data?.detail || t('failedSendQuotation'));
    } finally {
      setSubmittingQuotation(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (profile.subscriptionPlan !== 'wholesale') {
    return (
      <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
        <Card className="border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-600/5 shadow-sm">
          <CardContent className="p-6 sm:p-8 text-center">
            <Store className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-amber-500 dark:text-amber-400" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2">{t('udyogRequired')}</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-4">{t('udyogDesc')}</p>
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-3 sm:p-4 max-w-sm mx-auto">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2">{t('yourAccessCode')}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 dark:text-white">{myAccessCode || '---'}</span>
                <button
                  onClick={copyCode}
                  className="p-2 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm dark:shadow-none transition-colors"
                  title="Copy code"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{t('shareCode')}</p>
            </div>
            <a
              href={`/${locale}/payment?plan=wholesale`}
              className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all text-sm sm:text-base"
            >
              {t('upgradeBtn')}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      {addStatus && !showAddModal && (
        <p className={cn(
          "text-sm p-3 rounded-xl",
          addStatus.type === 'success' ? 'text-emerald-400 bg-emerald-500/10' : addStatus.type === 'info' ? 'text-blue-400 bg-blue-500/10' : 'text-red-400 bg-red-500/10'
        )}>
          {addStatus.msg}
        </p>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-emerald-400 active:scale-[0.98] transition-all text-sm w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          {t('addDukandar')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 sm:gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('list')}
          className={cn(
            "pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'list'
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          {t('tabRetailers')}
        </button>
        <button
          onClick={() => { setActiveTab('history'); loadHistory(); }}
          className={cn(
            "pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'history'
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          {t('tabHistory')}
        </button>
      </div>

      {/* Tab: My Retailers */}
      {activeTab === 'list' ? (
        dukandar.length === 0 ? (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-8 sm:p-12 text-center">
              <Users className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-slate-400 dark:text-slate-600" />
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-400 mb-2">{t('noDukandarTitle')}</h3>
              <p className="text-sm text-slate-500 mb-4">{t('noDukandarDesc')}</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all text-sm"
              >
                {t('addFirstDukandar')}
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {dukandar.map((d: any) => {
              const relId = d.relationshipId;
              const isDeleting = deletingId === relId;
              const isConfirming = confirmDeleteId === relId;
              const activeSending = alertSending === d.id;
              return (
                <Card key={relId} className={cn(
                  "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all",
                  isDeleting && "opacity-50 scale-[0.99]"
                )}>
                  <CardContent className="p-4 sm:p-6">
                    {/* Header row: name + delete */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">{d.shopName || d.name}</h3>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{d.name || d.email}</p>
                        <p className="text-xs text-slate-400">{d.email}{d.mobile && ` · ${d.mobile}`}</p>
                      </div>
                      <button
                        onClick={() => setConfirmDeleteId(isConfirming ? null : relId)}
                        disabled={isDeleting}
                        className="ml-3 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                        title={t('remove')}
                      >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Inline delete confirmation */}
                    {isConfirming && (
                      <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <p className="text-sm text-red-600 dark:text-red-400 font-medium">{t('removeConfirm', { name: d.shopName || d.name })}</p>
                        <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
                          >{t('cancel')}</button>
                          <button
                            onClick={() => removeDukandar(relId)}
                            className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >{t('remove')}</button>
                        </div>
                      </div>
                    )}

                    {/* Multi-store selector */}
                    {d.shops && d.shops.length > 1 && (
                      <div className="mb-4">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          {t('monitoringStore')}
                        </label>
                        <div className="relative">
                          <select
                            className="w-full pl-3 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                            value={selectedShopMap[relId] || d.selectedShopId || d.shops[0]?.id}
                            onChange={e => switchShop(relId, e.target.value)}
                          >
                            {d.shops.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
                      <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('lowStockProducts')}</p>
                        <p className={cn("text-base sm:text-lg font-bold", d.stockAlerts?.length > 0 ? "text-red-500 dark:text-red-400" : "text-slate-700 dark:text-slate-300")}>{d.stockAlerts?.length || 0}</p>
                      </div>
                      <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('status')}</p>
                        <p className="text-base sm:text-lg font-bold text-emerald-500 dark:text-emerald-400">{d.isActive ? t('active') : t('inactive')}</p>
                      </div>
                    </div>

                    {/* Stock alerts */}
                    {d.stockAlerts && d.stockAlerts.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-bold text-red-500 dark:text-red-400 mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {t('lowStockAlerts')}
                        </p>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
                          {d.stockAlerts.map((item: any, i: number) => (
                            <span key={i} className="px-2 py-1 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded text-xs text-red-600 dark:text-red-300">
                              {item.productName} ({item.currentStock ?? 0}/{item.minStock ?? 0} {item.unit || 'pcs'})
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => sendStockAlert(d.id)}
                          disabled={activeSending}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-orange-400 transition-all disabled:opacity-50 text-sm w-full sm:w-auto justify-center sm:justify-start"
                        >
                          {activeSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {t('sendRestockAlert')}
                        </button>

                        {alertStatusMap[d.id] && (
                          <p className={cn(
                            "text-xs font-semibold mt-2.5 p-2.5 rounded-lg border",
                            alertStatusMap[d.id].type === 'success' && "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                            alertStatusMap[d.id].type === 'info' && "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400",
                            alertStatusMap[d.id].type === 'error' && "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400"
                          )}>
                            {alertStatusMap[d.id].type === 'success' && '✓ '}
                            {alertStatusMap[d.id].msg}
                          </p>
                        )}
                      </div>
                    )}

                    {(!d.stockAlerts || d.stockAlerts.length === 0) && (
                      <p className="text-xs text-slate-500">{t('allStockHealthy')}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* Tab: History */
        loadingHistory ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : history.length === 0 ? (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-8 sm:p-12 text-center text-slate-500 text-sm">
              {t('noHistoryFound')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {history.map((a: any) => {
              const statusColors = ({
                pending: 'bg-blue-500/10 border-blue-200 text-blue-600 dark:text-blue-400',
                accepted: 'bg-emerald-500/10 border-emerald-200 text-emerald-600 dark:text-emerald-400',
                rejected: 'bg-red-500/10 border-red-200 text-red-600 dark:text-red-400',
                quotation: 'bg-purple-500/10 border-purple-200 text-purple-600 dark:text-purple-400',
                quotation_sent: 'bg-indigo-500/10 border-indigo-200 text-indigo-600 dark:text-indigo-400',
              } as Record<string, string>)[a.status] || 'bg-slate-100 border-slate-200 text-slate-600';

              const statusLabel = ({
                pending: t('statusAlertSent'),
                accepted: t('statusAccepted'),
                rejected: t('statusRejected'),
                quotation: t('statusQuotation'),
                quotation_sent: t('statusQuotationSent'),
              } as Record<string, string>)[a.status] || a.status;

              return (
                <Card key={a.id} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3">
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{a.retailerShop || a.retailerName}</h4>
                        <p className="text-xs text-slate-500">
                          {t('sent')} {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={cn("px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-lg border shrink-0", statusColors)}>
                        {statusLabel}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-4 italic">"{a.message}"</p>

                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
                      {a.products.map((p: any, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {p.name} {p.wholesaleCost ? `(₹${p.wholesaleCost})` : ''} {p.quantity ? `x${p.quantity}` : ''}
                        </span>
                      ))}
                    </div>

                    {a.status === 'quotation' && (
                      <button
                        onClick={() => openQuotationModal(a)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all w-full sm:w-auto justify-center sm:justify-start"
                      >
                        <FileText className="w-4 h-4" />
                        {t('createQuotation')}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Quotation Builder Modal */}
      {selectedQuotationAlert && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{t('quotationBuilder')}</h3>
                <p className="text-xs text-slate-500">{t('quotationBuilderFor', { name: selectedQuotationAlert.retailerShop || selectedQuotationAlert.retailerName })}</p>
              </div>
              <button
                onClick={() => setSelectedQuotationAlert(null)}
                disabled={submittingQuotation}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitQuotation} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto py-4 space-y-3 sm:space-y-4">
                {quotationProducts.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  </div>
                ) : (
                  quotationProducts.map((p: any) => {
                    const totalItemPrice = (p.wholesaleCost || 0) * (p.quantity || 1);
                    return (
                      <div key={p.id} className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</span>
                          <span className="text-xs font-medium text-slate-500 shrink-0">{t('stockLabel', { current: p.currentStock, min: p.minStock, unit: p.baseUnit || 'pcs' })}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('wholesaleCostLabel')}</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={p.wholesaleCost ?? ''}
                              onChange={e => handleQuotationFieldChange(p.id, 'wholesaleCost', Number(e.target.value))}
                              required
                              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('orderQtyLabel', { unit: p.baseUnit || 'pcs' })}</label>
                            <input
                              type="number"
                              min="1"
                              value={p.quantity ?? ''}
                              onChange={e => handleQuotationFieldChange(p.id, 'quantity', Number(e.target.value))}
                              required
                              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                        <div className="text-right text-xs font-bold text-slate-500 dark:text-slate-400">
                          {t('totalItem', { amount: totalItemPrice.toFixed(2) })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                  <span className="text-sm sm:text-base">{t('grandTotal')}</span>
                  <span className="text-base sm:text-lg text-emerald-600 dark:text-emerald-400">
                    ₹{quotationProducts.reduce((sum, p) => sum + (p.wholesaleCost || 0) * (p.quantity || 1), 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedQuotationAlert(null)}
                    disabled={submittingQuotation}
                    className="flex-1 px-4 py-2.5 sm:py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 font-medium disabled:opacity-40 transition-opacity text-sm"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingQuotation || quotationProducts.length === 0}
                    className="flex-1 px-4 py-2.5 sm:py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {submittingQuotation ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('sending')}</>
                    ) : (
                      t('sendQuotation')
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Dukandar Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-md shadow-2xl">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2 sm:mb-4">{t('addModalTitle')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('addModalDesc')}</p>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setAddMode('email')}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  addMode === 'email' ? "bg-emerald-500 text-white dark:text-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {t('byEmail')}
              </button>
              <button
                type="button"
                onClick={() => setAddMode('code')}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  addMode === 'code' ? "bg-emerald-500 text-white dark:text-slate-900 shadow-sm" : "text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {t('byCode')}
              </button>
            </div>
            <form onSubmit={addDukandar}>
              {addMode === 'email' ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('retailerEmail')}</label>
                  <input
                    type="email"
                    value={retailerEmail}
                    onChange={(e) => setRetailerEmail(e.target.value)}
                    disabled={adding}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm"
                    placeholder="shopkeeper@example.com"
                    required
                  />
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('accessCode')}</label>
                  <input
                    type="text"
                    value={retailerCode}
                    onChange={(e) => setRetailerCode(e.target.value.toUpperCase())}
                    disabled={adding}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity font-mono tracking-widest text-sm"
                    placeholder="e.g. PATIL123"
                    required
                  />
                </div>
              )}
              {addStatus && (
                <p className={cn(
                  "text-sm mb-3 p-2 rounded",
                  addStatus.type === 'success' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : addStatus.type === 'info' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10'
                )}>
                  {addStatus.msg}
                </p>
              )}
              <div className="flex gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddStatus(null); setAddSuccess(false); }}
                  disabled={adding}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 font-medium disabled:opacity-40 transition-opacity text-sm"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={adding || addSuccess}
                  className={cn(
                    'relative flex-1 px-4 py-3 font-bold rounded-xl transition-all flex items-center justify-center gap-2 overflow-hidden text-sm',
                    addSuccess
                      ? 'bg-emerald-400 text-slate-900'
                      : adding
                      ? 'bg-emerald-500 text-slate-900 ring-2 ring-emerald-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
                  )}
                >
                  {adding && (
                    <span className="absolute inset-0 overflow-hidden rounded-xl">
                      <span className="absolute inset-0 bg-emerald-300/40"
                        style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }}
                      />
                    </span>
                  )}
                  {addSuccess ? (
                    <><Check className="w-4 h-4" /> {t('added')}</>
                  ) : adding ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('adding')}</>
                  ) : (
                    t('add')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
