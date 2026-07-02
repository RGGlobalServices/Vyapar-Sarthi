'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, X, FileText, Loader2, ArrowLeft, Package, Clock } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface AlertDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function AlertDetailsPage({ params }: AlertDetailsPageProps) {
  const router = useRouter();
  const t = useTranslations('AlertDetails');
  const { id } = use(params);
  const [alertData, setAlertData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadAlert();
    }
  }, [id]);

  async function loadAlert() {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/dukandar/my-alerts/${id}`);
      setAlertData(res.data);
    } catch (err: any) {
      console.error('Failed to load alert details', err);
      setError(err?.response?.data?.detail || 'Failed to load alert details.');
    } finally {
      setLoading(false);
    }
  }

  async function respond(response: string) {
    if (!alertData) return;
    setResponding(true);
    try {
      await api.post('/dukandar/respond-alert', { alertId: alertData.id, response });
      setAlertData((prev: any) =>
        prev ? { ...prev, status: response, respondedAt: new Date().toISOString() } : null
      );
    } catch (err: any) {
      window.alert(err?.response?.data?.detail || 'Failed to respond');
    } finally {
      setResponding(false);
    }
  }

  function getStatusConfig(status: string) {
    const map: Record<string, { label: string; bg: string; text: string }> = {
      pending:        { label: t('statusPending'),          bg: 'bg-amber-500/15',   text: 'text-amber-400' },
      accepted:       { label: t('statusAccepted'),         bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
      rejected:       { label: t('statusRejected'),         bg: 'bg-red-500/15',     text: 'text-red-400' },
      quotation:      { label: t('statusQuotation'),        bg: 'bg-purple-500/15',  text: 'text-purple-400' },
      quotation_sent: { label: t('statusQuotationReceived'),bg: 'bg-indigo-500/15',  text: 'text-indigo-400' },
    };
    return map[status] || map.pending;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 bg-slate-950 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm text-slate-400">{t('loading')}</p>
      </div>
    );
  }

  if (error || !alertData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <X className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold mb-2">{t('errorTitle')}</h2>
        <p className="text-sm text-slate-400 text-center max-w-sm mb-6">{error || t('alertNotFound')}</p>
        <button
          onClick={() => router.push('/dukandar-alerts')}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> {t('goToAllAlerts')}
        </button>
      </div>
    );
  }

  const status = getStatusConfig(alertData.status);
  const receivedDate = new Date(alertData.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const respondedDate = alertData.respondedAt
    ? new Date(alertData.respondedAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : '';

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-3 sm:px-4 py-3">
        <div className="flex items-center gap-2 sm:gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/dukandar-alerts')}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white leading-tight">{t('stockAlertDetails')}</h1>
            <p className="text-xs text-slate-500 truncate">{t('from', { name: alertData.wholesalerShop || alertData.wholesalerName })}</p>
          </div>
          <span className={cn('text-[10px] font-bold px-2 sm:px-2.5 py-1 rounded-full uppercase tracking-wide flex-shrink-0', status.bg, status.text)}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="px-3 sm:px-4 pt-4 sm:pt-6 max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 sm:space-y-6">

          {/* Wholesaler info card */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-base sm:text-lg shrink-0">
              {(alertData.wholesalerShop || alertData.wholesalerName || 'W').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">{alertData.wholesalerShop || alertData.wholesalerName}</h3>
              <p className="text-xs text-slate-500">{t('received', { date: receivedDate })}</p>
            </div>
          </div>

          {/* Message */}
          <div className="bg-slate-950/60 rounded-xl p-3 sm:p-4 border border-slate-800/80">
            <p className="text-xs sm:text-sm font-semibold text-slate-400 mb-1">{t('messageFromWholesaler')}</p>
            <p className="text-sm text-slate-200 leading-relaxed">{alertData.message}</p>
          </div>

          {/* Low Stock Products (only for non-quotation_sent) */}
          {alertData.products && alertData.products.length > 0 && alertData.status !== 'quotation_sent' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Package className="w-4 h-4 text-slate-400 shrink-0" />
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('lowStockToReorder')}</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alertData.products.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 sm:p-3 bg-red-500/5 border border-red-500/10 rounded-xl gap-2">
                    <span className="text-xs sm:text-sm font-medium text-red-200 truncate">{p.name}</span>
                    <span className="text-xs font-bold text-red-400 shrink-0 bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/25">
                      {p.currentStock ?? 0}/{p.minStock ?? 0} {p.baseUnit || p.unit || 'pcs'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Responded status log */}
          {alertData.status !== 'pending' && alertData.status !== 'quotation_sent' && alertData.status !== 'quotation' && alertData.respondedAt && (
            <div className="flex items-start gap-2 p-3 bg-slate-950/40 rounded-xl text-xs text-slate-500 border border-slate-800/50">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('respondedOn', { date: respondedDate })}</span>
            </div>
          )}

          {/* Actions for standard pending alerts */}
          {alertData.status === 'pending' && (
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <p className="text-xs text-center text-slate-500">{t('howToRespond')}</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => respond('accepted')}
                  disabled={responding}
                  className="flex flex-col items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-3.5 bg-emerald-500 text-slate-950 rounded-xl hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-40 font-bold"
                >
                  {responding ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Check className="w-4 h-4 text-slate-950" />}
                  <span className="text-[10px] sm:text-[11px]">{t('yesSend')}</span>
                </button>
                <button
                  onClick={() => respond('quotation')}
                  disabled={responding}
                  className="flex flex-col items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-3.5 bg-purple-600 text-white rounded-xl hover:bg-purple-500 active:scale-[0.98] transition-all disabled:opacity-40 font-bold"
                >
                  {responding ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <FileText className="w-4 h-4 text-white" />}
                  <span className="text-[10px] sm:text-[11px]">{t('quotation')}</span>
                </button>
                <button
                  onClick={() => respond('rejected')}
                  disabled={responding}
                  className="flex flex-col items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-3.5 hover:bg-slate-800 text-red-400 border border-slate-700/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-40 font-bold"
                >
                  {responding ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <X className="w-4 h-4 text-red-400" />}
                  <span className="text-[10px] sm:text-[11px]">{t('decline')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quotation pricing breakdown */}
          {alertData.status === 'quotation_sent' && (
            <div className="pt-4 border-t border-slate-800 space-y-4">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('wholesaleQuotationReceived')}</h4>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800/80 -mx-1">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/40 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2 sm:p-3">{t('colItemName')}</th>
                      <th className="p-2 sm:p-3 text-right">{t('colWholesaleCost')}</th>
                      <th className="p-2 sm:p-3 text-right">{t('colOrderQty')}</th>
                      <th className="p-2 sm:p-3 text-right">{t('colTotal')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {alertData.products.map((p: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-950/10">
                        <td className="p-2 sm:p-3 font-medium text-white text-xs sm:text-sm">{p.name}</td>
                        <td className="p-2 sm:p-3 text-right font-mono text-slate-300">₹{(p.wholesaleCost || 0).toFixed(2)}</td>
                        <td className="p-2 sm:p-3 text-right text-slate-300">{p.quantity || 0} {p.baseUnit || p.unit || 'pcs'}</td>
                        <td className="p-2 sm:p-3 text-right font-bold text-emerald-400 font-mono">₹{((p.wholesaleCost || 0) * (p.quantity || 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between font-bold text-white px-1">
                <span className="text-sm text-slate-400">{t('grandTotal')}</span>
                <span className="text-lg sm:text-xl text-emerald-400 font-mono">
                  ₹{alertData.products.reduce((sum: number, p: any) => sum + (p.wholesaleCost || 0) * (p.quantity || 0), 0).toFixed(2)}
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-center text-slate-500">{t('approveQuotationPrompt')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <button
                    onClick={() => respond('accepted')}
                    disabled={responding}
                    className="flex items-center justify-center gap-2 py-3 bg-emerald-500 text-slate-950 rounded-xl hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-40 font-bold text-sm"
                  >
                    {responding ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Check className="w-4 h-4 text-slate-950" />}
                    {t('approveReorder')}
                  </button>
                  <button
                    onClick={() => respond('rejected')}
                    disabled={responding}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-red-400 border border-slate-700/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-40 font-bold text-sm"
                  >
                    {responding ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <X className="w-4 h-4 text-red-400" />}
                    {t('declineQuotation')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Waiting for quotation response */}
          {alertData.status === 'quotation' && (
            <div className="p-5 sm:p-6 bg-slate-950/40 border border-slate-800/80 rounded-xl flex flex-col items-center justify-center text-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <p className="text-sm font-semibold text-slate-300">{t('quotationRequested')}</p>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">{t('waitingForQuotation')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
