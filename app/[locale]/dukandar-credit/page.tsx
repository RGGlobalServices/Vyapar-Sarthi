'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, IndianRupee, Send, Loader2, Check, Download,
  ArrowLeft, TrendingUp, Clock, ChevronDown, Users,
  AlertCircle, X, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

export default function DukandarCreditPage() {
  const router = useRouter();
  const { profile } = useBusinessStore();
  const [dukandars, setDukandars] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [credits, setCredits] = useState<any[]>([]);
  const [creditsMap, setCreditsMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingCredits, setLoadingCredits] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ retailerId: '', amount: '', description: '', items: '', dueDate: '' });
  const [sending, setSending] = useState(false);

  const isWholesale = profile.subscriptionPlan === 'wholesale';

  useEffect(() => { loadData(); }, [isWholesale]);

  async function loadData() {
    setLoading(true);
    try {
      if (isWholesale) {
        const [dRes, sRes] = await Promise.all([
          api.get('/dukandar/my-dukandar'),
          api.get('/dukandar/credit/summary'),
        ]);
        setDukandars(dRes.data || []);
        setSummary(sRes.data || {});
      } else {
        const cRes = await api.get('/dukandar/credit/my-dues');
        setCredits(cRes.data || []);
      }
    } catch (err) {
      console.error('Load error', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleDukandar(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!creditsMap[id]) {
      setLoadingCredits(id);
      try {
        const r = await api.get(`/dukandar/credit/list?retailerId=${id}`);
        setCreditsMap(m => ({ ...m, [id]: r.data || [] }));
      } catch {}
      finally { setLoadingCredits(null); }
    }
  }

  async function addCredit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const items = addForm.items ? addForm.items.split(',').map((s: string) => ({ name: s.trim() })) : [];
      await api.post('/dukandar/credit/add', {
        retailerId: addForm.retailerId,
        amount: parseFloat(addForm.amount),
        description: addForm.description,
        items,
        dueDate: addForm.dueDate || undefined,
      });
      setShowAddModal(false);
      setAddForm({ retailerId: '', amount: '', description: '', items: '', dueDate: '' });
      // Refresh summary + clear cached credits for that retailer
      const sRes = await api.get('/dukandar/credit/summary');
      setSummary(sRes.data || {});
      setCreditsMap(m => { const n = { ...m }; delete n[addForm.retailerId]; return n; });
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to add credit');
    } finally {
      setSending(false);
    }
  }

  async function generateBillPDF(credit: any) {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas-pro');
    const div = document.createElement('div');
    div.style.cssText = 'width:320px;background:#fff;color:#000;font-family:monospace;padding:20px;position:absolute;left:-9999px';
    div.innerHTML = `
      <div style="text-align:center;border-bottom:1px solid #000;padding-bottom:10px;margin-bottom:10px">
        <h1 style="font-size:17px;font-weight:900">${credit.wholesalerShop || 'Wholesaler'}</h1>
        <p style="font-size:9px">CREDIT BILL</p>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:bold;margin-bottom:4px">
        <span>Bill: CRD-${credit.id?.slice(0, 8)}</span>
        <span>${credit.createdAt ? new Date(credit.createdAt).toLocaleDateString() : ''}</span>
      </div>
      <div style="font-size:9px;margin-bottom:10px">Dukandar: <strong>${credit.retailerShop || credit.retailerName}</strong></div>
      <table style="width:100%;border-top:1px dashed #000;border-bottom:1px dashed #000;margin-bottom:10px">
        <thead><tr style="font-size:9px"><th style="text-align:left;padding:4px 0">ITEM</th><th style="text-align:right;padding:4px 0">AMT</th></tr></thead>
        <tbody>${(credit.items || []).map((item: any) => `<tr><td style="padding:2px 0;font-size:10px">${item.name}</td><td style="text-align:right;font-size:10px">-</td></tr>`).join('')}</tbody>
      </table>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;border-top:1px solid #000;padding-top:4px">
        <span>TOTAL</span><span>₹${(credit.amount || 0).toLocaleString('en-IN')}</span>
      </div>
      ${credit.dueDate ? `<div style="font-size:9px;margin-top:6px">Due: ${new Date(credit.dueDate).toLocaleDateString()}</div>` : ''}
      <div style="text-align:center;margin-top:16px;padding-top:8px;border-top:1px dashed #000;font-size:8px">THANK YOU — Powered by Vyapar Sarthi</div>
    `;
    document.body.appendChild(div);
    const canvas = await html2canvas(div, { scale: 3, useCORS: true });
    const imgHeight = (canvas.height * 80) / canvas.width;
    const pdf = new jsPDF({ format: [80, imgHeight], unit: 'mm' });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 80, imgHeight);
    document.body.removeChild(div);
    pdf.save(`Credit_CRD-${credit.id?.slice(0, 8)}.pdf`);
  }

  async function sendWhatsAppReminder(credit: any) {
    const text = encodeURIComponent([
      `*Credit Bill Reminder*`,
      `From: ${credit.wholesalerShop || 'Wholesaler'}`,
      `Amount Due: *₹${(credit.amount || 0).toLocaleString('en-IN')}*`,
      credit.dueDate ? `Due Date: ${new Date(credit.dueDate).toLocaleDateString()}` : '',
      `Bill No: CRD-${credit.id?.slice(0, 8)}`,
      '',
      'Please arrange payment at the earliest.',
      '_Powered by Vyapar Sarthi_',
    ].filter(Boolean).join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  const totalPending = Object.values(summary).reduce((s: number, v: any) => s + (v.pending || 0), 0);
  const totalPaid = Object.values(summary).reduce((s: number, v: any) => s + (v.paid || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-28">

      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white leading-tight">
              {isWholesale ? 'Dukandar Credit' : 'My Dues'}
            </h1>
            <p className="text-xs text-slate-500">
              {isWholesale ? 'Track & manage credit for your dukandars' : 'Credit owed to wholesalers'}
            </p>
          </div>
          {isWholesale && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-slate-900 font-bold rounded-xl text-xs active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-5">

        {/* ── WHOLESALE VIEW ── */}
        {isWholesale && (
          <>
            {/* Summary Strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Pending', value: `₹${totalPending.toLocaleString('en-IN')}`, icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10' },
                { label: 'Received', value: `₹${totalPaid.toLocaleString('en-IN')}`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { label: 'Dukandars', value: String(dukandars.length), icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 flex flex-col gap-2">
                  <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', bg)}>
                    <Icon className={cn('w-4 h-4', color)} />
                  </div>
                  <div>
                    <p className={cn('text-base font-bold leading-tight', color)}>{value}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Dukandar List */}
            {dukandars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-20 h-20 rounded-3xl bg-slate-800/60 flex items-center justify-center">
                  <Users className="w-9 h-9 text-slate-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold text-slate-300 mb-1">No Dukandars Yet</h3>
                  <p className="text-sm text-slate-500 max-w-xs">Add dukandars from the Dukandar page to start tracking credit.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Your Dukandars</p>
                {dukandars.map((d: any) => {
                  const s = summary[d.id] || { total: 0, pending: 0, paid: 0 };
                  const isOpen = expandedId === d.id;
                  const dukandarCredits = creditsMap[d.id] || [];

                  return (
                    <div key={d.id} className={cn(
                      'rounded-2xl border bg-slate-900 overflow-hidden transition-all',
                      isOpen ? 'border-emerald-500/40' : 'border-slate-800'
                    )}>
                      {/* Row */}
                      <button
                        className="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-slate-800/50 transition-colors"
                        onClick={() => toggleDukandar(d.id)}
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-base font-bold text-emerald-400 flex-shrink-0">
                          {(d.shopName || d.name || 'D').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{d.shopName || d.name}</p>
                          <p className="text-xs text-slate-500 truncate">{d.email}</p>
                        </div>
                        <div className="text-right flex-shrink-0 mr-2">
                          <p className="text-sm font-bold text-red-400">₹{s.pending.toLocaleString('en-IN')}</p>
                          <p className="text-[11px] text-slate-500">pending</p>
                        </div>
                        <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform flex-shrink-0', isOpen && 'rotate-180 text-emerald-400')} />
                      </button>

                      {/* Expanded Credits */}
                      {isOpen && (
                        <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-3">
                          {loadingCredits === d.id ? (
                            <div className="flex justify-center py-6">
                              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                            </div>
                          ) : dukandarCredits.length === 0 ? (
                            <div className="flex flex-col items-center py-6 gap-2">
                              <Wallet className="w-8 h-8 text-slate-700" />
                              <p className="text-sm text-slate-500">No credit records yet</p>
                            </div>
                          ) : (
                            dukandarCredits.map((c: any) => {
                              const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && c.status === 'pending';
                              return (
                                <div key={c.id} className={cn(
                                  'rounded-xl border p-3.5',
                                  c.status === 'paid' ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-slate-800/50 border-slate-700/50',
                                  isOverdue && 'border-red-500/30 bg-red-500/5'
                                )}>
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <p className="text-base font-bold text-white">₹{c.amount.toLocaleString('en-IN')}</p>
                                    <span className={cn(
                                      'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                                      c.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                                    )}>
                                      {c.status}
                                    </span>
                                  </div>
                                  {c.description && <p className="text-xs text-slate-400 mb-2">{c.description}</p>}
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
                                    {c.createdAt && <span>Added {new Date(c.createdAt).toLocaleDateString('en-IN')}</span>}
                                    {c.dueDate && (
                                      <span className={cn('flex items-center gap-1', isOverdue && 'text-red-400 font-medium')}>
                                        {isOverdue && <AlertCircle className="w-3 h-3" />}
                                        <Clock className="w-3 h-3" />
                                        Due {new Date(c.dueDate).toLocaleDateString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                  {c.items?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                      {c.items.map((item: any, i: number) => (
                                        <span key={i} className="px-2 py-0.5 bg-slate-700 rounded-md text-[11px] text-slate-300">{item.name}</span>
                                      ))}
                                    </div>
                                  )}
                                  {c.status === 'pending' && (
                                    <div className="flex gap-2 mt-1">
                                      <button onClick={() => generateBillPDF(c)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold active:bg-slate-600 transition-colors">
                                        <Download className="w-3.5 h-3.5" /> PDF
                                      </button>
                                      <button onClick={() => sendWhatsAppReminder(c)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500/15 text-green-400 rounded-xl text-xs font-semibold active:bg-green-500/25 transition-colors">
                                        <Send className="w-3.5 h-3.5" /> WhatsApp
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── RETAIL / SHOP VIEW — MY DUES ── */}
        {!isWholesale && (
          <>
            {credits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-20 h-20 rounded-3xl bg-slate-800/60 flex items-center justify-center">
                  <Check className="w-9 h-9 text-emerald-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold text-slate-300 mb-1">All Clear!</h3>
                  <p className="text-sm text-slate-500 max-w-xs">You have no pending dues to any wholesaler.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {credits.map((c: any) => {
                  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && c.status === 'pending';
                  return (
                    <div key={c.id} className={cn(
                      'rounded-2xl border bg-slate-900 p-4',
                      isOverdue ? 'border-red-500/30' : c.status === 'paid' ? 'border-emerald-500/20' : 'border-slate-800'
                    )}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-base font-bold text-purple-400 flex-shrink-0">
                            {(c.wholesalerShop || c.wholesalerName || 'W').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{c.wholesalerShop || c.wholesalerName}</p>
                            {c.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.description}</p>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-white">₹{c.amount.toLocaleString('en-IN')}</p>
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                            c.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                          )}>
                            {c.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        {c.createdAt && <span>Added {new Date(c.createdAt).toLocaleDateString('en-IN')}</span>}
                        {c.dueDate && (
                          <span className={cn('flex items-center gap-1', isOverdue && 'text-red-400 font-medium')}>
                            {isOverdue && <AlertCircle className="w-3 h-3" />}
                            <Clock className="w-3 h-3" />
                            Due {new Date(c.dueDate).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Credit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Add Credit</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={addCredit} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Dukandar</label>
                <select value={addForm.retailerId} onChange={e => setAddForm(f => ({ ...f, retailerId: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm appearance-none" required>
                  <option value="">Select dukandar…</option>
                  {dukandars.map((d: any) => <option key={d.id} value={d.id}>{d.shopName || d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount (₹)</label>
                <input type="number" step="0.01" inputMode="decimal" value={addForm.amount}
                  onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm"
                  placeholder="0.00" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description <span className="text-slate-600 normal-case font-normal">(optional)</span></label>
                <input type="text" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm"
                  placeholder="e.g. Weekly grocery stock" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items <span className="text-slate-600 normal-case font-normal">(comma separated)</span></label>
                <input type="text" value={addForm.items} onChange={e => setAddForm(f => ({ ...f, items: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm"
                  placeholder="Rice 50kg, Oil 15L, Sugar 25kg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Due Date <span className="text-slate-600 normal-case font-normal">(optional)</span></label>
                <input type="date" value={addForm.dueDate} onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm" />
              </div>
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium text-sm active:bg-slate-700 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={sending}
                  className="flex-1 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl text-sm disabled:opacity-50 active:bg-emerald-400 transition-colors">
                  {sending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add Credit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
