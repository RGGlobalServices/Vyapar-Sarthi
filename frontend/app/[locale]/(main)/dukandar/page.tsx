'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Package, AlertTriangle, Plus, Eye, Clock, Hash, Users, Search, Copy, Check, Send, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { PAYMENT_URL } from '@/lib/config';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';

export default function DukandarPage() {
  const t = useTranslations('Dukandar');
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
    try {
      if (addMode === 'email') {
        await api.post('/dukandar/add-dukandar', { retailer_email: retailerEmail });
      } else {
        await api.post('/dukandar/add-dukandar-by-code', { access_code: retailerCode });
      }
      setAddStatus({ type: 'success', msg: 'Dukandar added successfully!' });
      setRetailerEmail('');
      setRetailerCode('');
      setTimeout(() => setShowAddModal(false), 1500);
      loadDukandar();
    } catch (err: any) {
      setAddStatus({ type: 'error', msg: err?.response?.data?.detail || 'Failed to add dukandar' });
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
    try {
      await api.post('/dukandar/send-stock-alert', { retailerId });
      alert('Stock alert sent to dukandar successfully!');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send stock alert');
    } finally {
      setAlertSending(null);
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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Dukandar Management</h1>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5">
          <CardContent className="p-8 text-center">
            <Store className="w-16 h-16 mx-auto mb-4 text-amber-400" />
            <h2 className="text-xl font-bold text-white mb-2">Wholesale Plan Required</h2>
            <p className="text-slate-400 mb-4">
              Dukandar management feature is only available on the Wholesale plan.
              Upgrade now to add your shopkeepers and view their stock alerts.
            </p>
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-400 mb-2">Your Dukandar Access Code</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl font-black tracking-widest text-white">{myAccessCode || '---'}</span>
                <button
                  onClick={copyCode}
                  className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  title="Copy code"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Share this code with your wholesaler so they can add your shop and monitor inventory alerts.
              </p>
            </div>
            <a
              href={`${PAYMENT_URL}?plan=wholesale`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all"
            >
              Upgrade to Wholesale
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dukandar Management</h1>
          <p className="text-slate-400 mt-1">Manage your shopkeepers and view their stock</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Dukandar
        </button>
      </div>

      {dukandar.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-bold text-slate-400 mb-2">No Dukandar Added Yet</h3>
            <p className="text-slate-500 mb-4">
              Add your shopkeepers (dukandar) who use Vyapar Sarthi and track their stock
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400"
            >
              + Add Your First Dukandar
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {dukandar.map((d: any) => (
            <Card key={d.id} className="border-slate-800 bg-slate-900">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{d.shopName || d.name}</h3>
                    <p className="text-sm text-slate-400">{d.name || d.email}</p>
                    <p className="text-xs text-slate-500">{d.email}</p>
                  </div>
                  {d.mobile && (
                    <span className="text-xs text-slate-500">{d.mobile}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-xs text-slate-400">Low Stock Products</p>
                    <p className="text-lg font-bold text-red-400">{d.stockAlerts?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-slate-800 rounded-xl">
                    <p className="text-xs text-slate-400">Status</p>
                    <p className="text-lg font-bold text-emerald-400">{d.isActive ? 'Active' : 'Inactive'}</p>
                  </div>
                </div>

                {d.stockAlerts && d.stockAlerts.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> LOW STOCK ALERTS
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {d.stockAlerts.map((item: any, i: number) => (
                        <span key={i} className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                          {item.productName} ({item.currentStock ?? 0}/{item.minStock ?? 0} {item.unit || 'pcs'})
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => sendStockAlert(d.id)}
                      disabled={alertSending === d.id}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-slate-900 font-bold rounded-xl hover:bg-orange-400 transition-all disabled:opacity-50 text-sm"
                    >
                      {alertSending === d.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Send Restock Alert
                    </button>
                  </div>
                )}

                {(!d.stockAlerts || d.stockAlerts.length === 0) && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">No low stock alerts</p>
                    <button
                      onClick={() => sendStockAlert(d.id)}
                      disabled={alertSending === d.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 text-xs"
                    >
                      {alertSending === d.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      Check & Alert
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">Add Dukandar</h2>
            <p className="text-sm text-slate-400 mb-4">
              Add by registered email or by the dukandar access code shared by the retailer.
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setAddMode('email')}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  addMode === 'email' ? "bg-emerald-500 text-slate-900" : "text-slate-300 hover:bg-slate-700"
                )}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setAddMode('code')}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  addMode === 'code' ? "bg-emerald-500 text-slate-900" : "text-slate-300 hover:bg-slate-700"
                )}
              >
                Access Code
              </button>
            </div>
            <form onSubmit={addDukandar}>
              {addMode === 'email' ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Retailer Email</label>
                  <input
                    type="email"
                    value={retailerEmail}
                    onChange={(e) => setRetailerEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    placeholder="shopkeeper@example.com"
                    required
                  />
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Dukandar Access Code</label>
                  <input
                    type="text"
                    value={retailerCode}
                    onChange={(e) => setRetailerCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. PATIL123"
                    required
                  />
                </div>
              )}
              {addStatus && (
                <p className={cn(
                  "text-sm mb-3 p-2 rounded",
                  addStatus.type === 'success' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                )}>
                  {addStatus.msg}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddStatus(null); }}
                  className="flex-1 px-4 py-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
