'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, FileText, Loader2, ArrowLeft, Bell, Package, Clock } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  accepted:  { label: 'Accepted',  bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  rejected:  { label: 'Rejected',  bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30' },
  quotation: { label: 'Quotation', bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/30' },
};

export default function DukandarAlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => { loadAlerts(); }, []);

  async function loadAlerts() {
    try {
      const res = await api.get('/dukandar/my-alerts');
      setAlerts(res.data || []);
    } catch (err) {
      console.error('Failed to load alerts', err);
    } finally {
      setLoading(false);
    }
  }

  async function respond(alertId: string, response: string) {
    setResponding(alertId);
    try {
      await api.post('/dukandar/respond-alert', { alertId, response });
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, status: response, respondedAt: new Date().toISOString() } : a
      ));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to respond');
    } finally {
      setResponding(null);
    }
  }

  const pending = alerts.filter(a => a.status === 'pending');
  const responded = alerts.filter(a => a.status !== 'pending');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm text-slate-500">Loading alerts…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24">

      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white leading-tight">Stock Alerts</h1>
            <p className="text-xs text-slate-500">From your wholesalers</p>
          </div>
          {pending.length > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 text-amber-400 text-xs font-bold rounded-full border border-amber-500/25">
              <Bell className="w-3 h-3" />
              {pending.length} New
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-6">

        {/* Empty State */}
        {alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-3xl bg-slate-800/60 flex items-center justify-center">
              <Bell className="w-9 h-9 text-slate-600" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-300 mb-1">No Alerts</h3>
              <p className="text-sm text-slate-500 max-w-xs">No stock alerts from wholesalers at the moment. You're all caught up!</p>
            </div>
          </div>
        )}

        {/* Pending Alerts */}
        {pending.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Needs Your Response</p>
            <div className="space-y-3">
              {pending.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  responding={responding}
                  onRespond={respond}
                />
              ))}
            </div>
          </section>
        )}

        {/* Responded Alerts */}
        {responded.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Responded</p>
            <div className="space-y-3">
              {responded.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  responding={responding}
                  onRespond={respond}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function AlertCard({ alert, responding, onRespond }: {
  alert: any;
  responding: string | null;
  onRespond: (id: string, response: string) => void;
}) {
  const status = STATUS_CONFIG[alert.status] || STATUS_CONFIG.pending;
  const isBusy = responding === alert.id;

  return (
    <div className={cn(
      'rounded-2xl border bg-slate-900 overflow-hidden',
      alert.status === 'pending' ? 'border-slate-700' : status.border,
    )}>
      {/* Card Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0 text-sm font-bold text-emerald-400">
              {(alert.wholesalerShop || alert.wholesalerName || 'W').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{alert.wholesalerShop || alert.wholesalerName}</p>
              <p className="text-xs text-slate-500">
                {alert.createdAt ? new Date(alert.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              </p>
            </div>
          </div>
          <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide flex-shrink-0', status.bg, status.text)}>
            {status.label}
          </span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{alert.message}</p>
      </div>

      {/* Low Stock Products */}
      {alert.products && alert.products.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Package className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-xs font-semibold text-slate-400">Low Stock Items</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alert.products.map((p: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 font-medium">
                {p.name}
                <span className="text-red-400/70">· {p.currentStock ?? 0}/{p.minStock ?? 0}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Responded timestamp */}
      {alert.status !== 'pending' && alert.respondedAt && (
        <div className="px-4 pb-3 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-600" />
          <p className="text-xs text-slate-600">
            Responded {new Date(alert.respondedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {alert.status === 'pending' && (
        <div className="border-t border-slate-800 grid grid-cols-3">
          <button
            onClick={() => onRespond(alert.id, 'accepted')}
            disabled={isBusy}
            className="flex flex-col items-center gap-1 py-3 text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/15 transition-colors disabled:opacity-40 border-r border-slate-800"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span className="text-[11px] font-semibold">Yes, Send</span>
          </button>
          <button
            onClick={() => onRespond(alert.id, 'quotation')}
            disabled={isBusy}
            className="flex flex-col items-center gap-1 py-3 text-purple-400 hover:bg-purple-500/10 active:bg-purple-500/15 transition-colors disabled:opacity-40 border-r border-slate-800"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span className="text-[11px] font-semibold">Quotation</span>
          </button>
          <button
            onClick={() => onRespond(alert.id, 'rejected')}
            disabled={isBusy}
            className="flex flex-col items-center gap-1 py-3 text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors disabled:opacity-40"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            <span className="text-[11px] font-semibold">Decline</span>
          </button>
        </div>
      )}
    </div>
  );
}
