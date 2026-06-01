'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Check, X, FileText, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function DukandarAlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Stock Alerts from Wholesalers</h1>
        <p className="text-slate-400 mt-1">Review and respond to restock requests from your wholesalers</p>
      </div>

      {alerts.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-12 text-center">
            <Check className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
            <h3 className="text-lg font-bold text-slate-400 mb-2">No Alerts</h3>
            <p className="text-slate-500">No stock alerts from wholesalers at the moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert.id} className={cn(
              "border-slate-800 bg-slate-900",
              alert.status === 'accepted' && "border-emerald-500/30",
              alert.status === 'rejected' && "border-red-500/30",
              alert.status === 'quotation' && "border-purple-500/30",
            )}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">From: <span className="font-bold text-slate-300">{alert.wholesalerShop || alert.wholesalerName}</span></p>
                    <p className="text-sm text-slate-300">{alert.message}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                    alert.status === 'pending' && "bg-amber-500/20 text-amber-400",
                    alert.status === 'accepted' && "bg-emerald-500/20 text-emerald-400",
                    alert.status === 'rejected' && "bg-red-500/20 text-red-400",
                    alert.status === 'quotation' && "bg-purple-500/20 text-purple-400",
                  )}>
                    {alert.status}
                  </span>
                </div>

                {alert.products && alert.products.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-slate-400 mb-2">Low Stock Products:</p>
                    <div className="flex flex-wrap gap-2">
                      {alert.products.map((p: any, i: number) => (
                        <span key={i} className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                          {p.name} ({p.currentStock ?? 0}/{p.minStock ?? 0} {p.unit || 'pcs'})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {alert.status === 'pending' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => respond(alert.id, 'accepted')}
                      disabled={responding === alert.id}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all disabled:opacity-50 text-sm"
                    >
                      {responding === alert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Yes, Send Me
                    </button>
                    <button
                      onClick={() => respond(alert.id, 'quotation')}
                      disabled={responding === alert.id}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-400 transition-all disabled:opacity-50 text-sm"
                    >
                      {responding === alert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      Give Me Quotation Bill
                    </button>
                    <button
                      onClick={() => respond(alert.id, 'rejected')}
                      disabled={responding === alert.id}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 text-sm"
                    >
                      <X className="w-4 h-4" />
                      No, Thanks
                    </button>
                  </div>
                )}

                {alert.status !== 'pending' && (
                  <p className="text-xs text-slate-500">
                    Responded: {alert.respondedAt ? new Date(alert.respondedAt).toLocaleString() : 'N/A'}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
