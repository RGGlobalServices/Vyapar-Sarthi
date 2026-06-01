'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, IndianRupee, FileText, Send, Loader2, Check, Clock, Download, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { useBusinessStore } from '@/lib/businessStore';

export default function DukandarCreditPage() {
  const { profile } = useBusinessStore();
  const [dukandars, setDukandars] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRetailer, setSelectedRetailer] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ retailerId: '', amount: '', description: '', items: '', dueDate: '' });
  const [sending, setSending] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);

  const isWholesale = profile.subscriptionPlan === 'wholesale';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      if (isWholesale) {
        const [dRes, sRes, cRes] = await Promise.all([
          api.get('/dukandar/my-dukandar'),
          api.get('/dukandar/credit/summary'),
          selectedRetailer ? api.get(`/dukandar/credit/list?retailerId=${selectedRetailer}`) : Promise.resolve({ data: [] }),
        ]);
        setDukandars(dRes.data || []);
        setSummary(sRes.data || {});
        setCredits(cRes.data || []);
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

  useEffect(() => {
    if (selectedRetailer) {
      api.get(`/dukandar/credit/list?retailerId=${selectedRetailer}`)
        .then(r => setCredits(r.data || []))
        .catch(() => {});
    }
  }, [selectedRetailer]);

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
      loadData();
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
    div.style.width = '320px';
    div.style.backgroundColor = '#ffffff';
    div.style.color = '#000000';
    div.style.fontFamily = 'monospace';
    div.style.padding = '20px';
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    div.innerHTML = `
      <div style="text-align:center;border-bottom:1px solid #000;padding-bottom:10px;margin-bottom:10px">
        <h1 style="font-size:17px;font-weight:900">${credit.wholesalerShop || 'Wholesaler'}</h1>
        <p style="font-size:9px">CREDIT BILL</p>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:bold;margin-bottom:4px">
        <span>Bill: CRD-${credit.id?.slice(0, 8)}</span>
        <span>${credit.createdAt ? new Date(credit.createdAt).toLocaleDateString() : ''}</span>
      </div>
      <div style="font-size:9px;margin-bottom:4px">Dukandar: <strong>${credit.retailerShop || credit.retailerName}</strong></div>
      ${credit.description ? `<div style="font-size:9px;margin-bottom:10px">${credit.description}</div>` : ''}
      <table style="width:100%;border-top:1px dashed #000;border-bottom:1px dashed #000;margin-bottom:10px">
        <thead><tr style="font-size:9px"><th style="text-align:left;padding:4px 0">ITEM</th><th style="text-align:right;padding:4px 0">AMOUNT</th></tr></thead>
        <tbody style="border-top:1px dotted #000">
          ${(credit.items || []).map((item: any) => `
            <tr><td style="padding:2px 0;font-size:10px">${item.name || ''}</td><td style="text-align:right;padding:2px 0;font-size:10px">₹0</td></tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;border-top:1px solid #000;padding-top:4px">
        <span>TOTAL</span><span>₹${(credit.amount || 0).toLocaleString('en-IN')}</span>
      </div>
      ${credit.dueDate ? `<div style="font-size:9px;margin-top:6px">Due Date: ${new Date(credit.dueDate).toLocaleDateString()}</div>` : ''}
      <div style="text-align:center;margin-top:16px;padding-top:8px;border-top:1px dashed #000;font-size:8px">
        <p>THANK YOU</p>
        <p style="margin-top:4px">Powered by Vyapar Sarthi</p>
      </div>
    `;
    document.body.appendChild(div);

    const canvas = await html2canvas(div, { scale: 3, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const imgHeight = (canvas.height * 80) / canvas.width;
    const pdf = new jsPDF({ format: [80, imgHeight], unit: 'mm' });
    pdf.addImage(imgData, 'PNG', 0, 0, 80, imgHeight);
    document.body.removeChild(div);
    pdf.save(`Credit_Bill_${credit.id?.slice(0, 8)}.pdf`);
  }

  async function sendWhatsAppReminder(credit: any) {
    const div = document.createElement('div');
    div.style.width = '320px';
    div.style.backgroundColor = '#ffffff';
    div.style.color = '#000000';
    div.style.fontFamily = 'monospace';
    div.style.padding = '20px';
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    div.innerHTML = `
      <div style="text-align:center;border-bottom:1px solid #000;padding-bottom:10px;margin-bottom:10px">
        <h1 style="font-size:17px;font-weight:900">${credit.wholesalerShop || ''}</h1>
        <p style="font-size:9px">CREDIT BILL</p>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:bold;margin-bottom:4px">
        <span>Bill: CRD-${credit.id?.slice(0, 8)}</span>
        <span>${credit.createdAt ? new Date(credit.createdAt).toLocaleDateString() : ''}</span>
      </div>
      <div style="font-size:9px;margin-bottom:4px">Dukandar: <strong>${credit.retailerShop || credit.retailerName}</strong></div>
      ${credit.description ? `<div style="font-size:9px;margin-bottom:10px">${credit.description}</div>` : ''}
      <table style="width:100%;border-top:1px dashed #000;border-bottom:1px dashed #000;margin-bottom:10px">
        <thead><tr style="font-size:9px"><th style="text-align:left;padding:4px 0">ITEM</th><th style="text-align:right;padding:4px 0">AMOUNT</th></tr></thead>
        <tbody style="border-top:1px dotted #000">
          ${(credit.items || []).map((item: any) => `
            <tr><td style="padding:2px 0;font-size:10px">${item.name || ''}</td><td style="text-align:right;padding:2px 0;font-size:10px">₹0</td></tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;border-top:1px solid #000;padding-top:4px">
        <span>TOTAL</span><span>₹${(credit.amount || 0).toLocaleString('en-IN')}</span>
      </div>
      ${credit.dueDate ? `<div style="font-size:9px;margin-top:6px">Due Date: ${new Date(credit.dueDate).toLocaleDateString()}</div>` : ''}
      <div style="text-align:center;margin-top:16px;padding-top:8px;border-top:1px dashed #000;font-size:8px">
        <p>THANK YOU</p>
        <p style="margin-top:4px">Powered by Vyapar Sarthi</p>
      </div>
    `;
    document.body.appendChild(div);

    const canvas = await html2canvas(div, { scale: 3, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const imgHeight = (canvas.height * 80) / canvas.width;
    const pdf = new jsPDF({ format: [80, imgHeight], unit: 'mm' });
    pdf.addImage(imgData, 'PNG', 0, 0, 80, imgHeight);
    document.body.removeChild(div);

    const blob = pdf.output('blob');
    const file = new File([blob], `Credit_Bill_${credit.id?.slice(0, 8)}.pdf`, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      const text = [
        `*Credit Bill Reminder*`,
        `From: ${credit.wholesalerShop || 'Wholesaler'}`,
        `To: ${credit.retailerShop || credit.retailerName}`,
        `Amount Due: *₹${(credit.amount || 0).toLocaleString('en-IN')}*`,
        credit.dueDate ? `Due Date: ${new Date(credit.dueDate).toLocaleDateString()}` : '',
        `Bill: CRD-${credit.id?.slice(0, 8)}`,
        '',
        'Please arrange payment at the earliest.',
        '',
        '_Powered by Vyapar Sarthi_',
      ].filter(Boolean).join('\n');

      try {
        await navigator.share({ files: [file], title: 'Credit Bill', text });
        return;
      } catch {}
    }

    const text = encodeURIComponent([
      `*Credit Bill Reminder*`,
      `From: ${credit.wholesalerShop || 'Wholesaler'}`,
      `To: ${credit.retailerShop || credit.retailerName}`,
      `Amount Due: *₹${(credit.amount || 0).toLocaleString('en-IN')}*`,
      credit.dueDate ? `Due Date: ${new Date(credit.dueDate).toLocaleDateString()}` : '',
      `Bill No: CRD-${credit.id?.slice(0, 8)}`,
      '',
      'Please arrange payment at the earliest.',
      '',
      '_Powered by Vyapar Sarthi_',
    ].filter(Boolean).join('\n'));

    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  const totalPending = Object.values(summary).reduce((sum: number, s: any) => sum + (s.pending || 0), 0);
  const totalPaid = Object.values(summary).reduce((sum: number, s: any) => sum + (s.paid || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dukandar Credit</h1>
          <p className="text-slate-400 mt-1">Track credit given to your dukandar and send reminders</p>
        </div>
        {isWholesale && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400"
          >
            <Plus className="w-4 h-4" /> Add Credit
          </button>
        )}
      </div>

      {isWholesale && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="p-5">
                <p className="text-xs text-slate-400">Total Pending</p>
                <p className="text-2xl font-bold text-red-400">₹{totalPending.toLocaleString('en-IN')}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="p-5">
                <p className="text-xs text-slate-400">Total Paid</p>
                <p className="text-2xl font-bold text-emerald-400">₹{totalPaid.toLocaleString('en-IN')}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {dukandars.map((d: any) => {
              const s = summary[d.id] || { total: 0, pending: 0, paid: 0 };
              return (
                <Card
                  key={d.id}
                  className={cn("border-slate-800 bg-slate-900 cursor-pointer transition-all hover:border-slate-600",
                    selectedRetailer === d.id && "border-emerald-500")}
                  onClick={() => setSelectedRetailer(selectedRetailer === d.id ? null : d.id)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white">{d.shopName || d.name}</h3>
                        <p className="text-xs text-slate-500">{d.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">Pending: <span className="font-bold text-red-400">₹{s.pending.toLocaleString('en-IN')}</span></p>
                        <p className="text-xs text-slate-500">Total: ₹{s.total.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedRetailer && credits.length === 0 && (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="p-8 text-center">
                <IndianRupee className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400">No credit records for this dukandar</p>
              </CardContent>
            </Card>
          )}

          {selectedRetailer && credits.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">Credit History</h2>
              {credits.map((c: any) => (
                <Card key={c.id} className={cn("border-slate-800 bg-slate-900",
                  c.status === 'paid' && 'border-emerald-500/30')}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-bold text-white">₹{c.amount.toLocaleString('en-IN')}</p>
                        {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        c.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400')}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mb-3">
                      {c.createdAt && <span>Date: {new Date(c.createdAt).toLocaleDateString()} | </span>}
                      {c.dueDate && <span>Due: {new Date(c.dueDate).toLocaleDateString()}</span>}
                    </div>
                    {c.items?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {c.items.map((item: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-300">{item.name}</span>
                        ))}
                      </div>
                    )}
                    {c.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => generateBillPDF(c)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 text-xs">
                          <Download className="w-3 h-3" /> Bill PDF
                        </button>
                        <button onClick={() => sendWhatsAppReminder(c)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 text-xs">
                          <Send className="w-3 h-3" /> WhatsApp Reminder
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isWholesale && credits.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">My Dues to Wholesalers</h2>
              {credits.map((c: any) => (
                <Card key={c.id} className="border-slate-800 bg-slate-900">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm text-slate-400">{c.wholesalerShop || c.wholesalerName}</p>
                        <p className="font-bold text-white">₹{c.amount.toLocaleString('en-IN')}</p>
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                        c.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400')}>
                        {c.status}
                      </span>
                    </div>
                    {c.description && <p className="text-xs text-slate-400 mb-1">{c.description}</p>}
                    <p className="text-xs text-slate-500">
                      {c.createdAt && <span>Date: {new Date(c.createdAt).toLocaleDateString()}</span>}
                      {c.dueDate && <span> | Due: {new Date(c.dueDate).toLocaleDateString()}</span>}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isWholesale && credits.length === 0 && (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="p-12 text-center">
                <Check className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-400 mb-2">No Dues</h3>
                <p className="text-slate-500">You have no pending credit from any wholesaler.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">Add Credit</h2>
            <form onSubmit={addCredit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Dukandar</label>
                <select
                  value={addForm.retailerId}
                  onChange={e => setAddForm(f => ({ ...f, retailerId: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  required
                >
                  <option value="">Select dukandar</option>
                  {dukandars.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.shopName || d.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Amount (₹)</label>
                <input type="number" step="0.01" value={addForm.amount}
                  onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  required />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Description (optional)</label>
                <input type="text" value={addForm.description}
                  onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Weekly grocery stock" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Items (comma separated, optional)</label>
                <input type="text" value={addForm.items}
                  onChange={e => setAddForm(f => ({ ...f, items: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Rice 50kg, Oil 15L, Sugar 25kg" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Due Date (optional)</label>
                <input type="date" value={addForm.dueDate}
                  onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancel</button>
                <button type="submit" disabled={sending}
                  className="flex-1 px-4 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 disabled:opacity-50">
                  {sending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
