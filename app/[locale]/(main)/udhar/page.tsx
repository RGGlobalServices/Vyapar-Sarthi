'use client';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search, UserPlus, Phone, Calendar, ArrowRight,
  X, Check, Pencil, Trash2, Plus, Minus,
  ArrowDownLeft, ArrowUpRight, ChevronLeft, Trash, Send,
  Users, Store, Bell, Clock, Mail, MessageSquare, Download,
  CheckSquare, Square, ChevronRight, Package, IndianRupee,
  Loader2, AlarmClock, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUdharStore, UdharCustomer, UdharTransaction } from '@/lib/store';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { uploadInvoiceToSupabase } from '@/lib/supabaseStorage';
import { UdharSlip, generateUdharWhatsAppText } from '@/components/UdharSlip';
import { canAddUdharCustomer, udharLimitDisplay } from '@/lib/planGates';
import { useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import { exportUdharPDF } from '@/lib/pdf/udharReport';
import { exportUdharCSV } from '@/lib/csv/udharReport';
const TopProductsPieChart = dynamic(() => import('@/components/TopProductsPieChart'), { ssr: false });

function totalDue(c: UdharCustomer) {
  if (c.totalDue !== undefined && c.totalDue !== null) return c.totalDue;
  return (c.transactions || []).reduce((sum, t) => t.type === 'udhar' ? sum + t.amount : sum - t.amount, 0);
}

function relativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const inp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

// ─── WhatsApp & Email reminder helper ─────────────────────────────────────────
import { shareFileOrText, generateEmailLink } from '@/lib/shareUtils';

async function shareCustomerLedger(customer: UdharCustomer, shopName: string, channel: 'whatsapp' | 'email') {
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas-pro');
  const due = totalDue(customer);
  const div = document.createElement('div');
  div.style.cssText = 'width:320px;background:#fff;color:#000;font-family:monospace;padding:20px;position:absolute;left:-9999px';
  const sorted = [...(customer.transactions || [])].reverse().slice(0, 10);
  div.innerHTML = `
    <div style="text-align:center;border-bottom:1px solid #000;padding-bottom:10px;margin-bottom:10px">
      <h1 style="font-size:17px;font-weight:900">${shopName}</h1>
      <p style="font-size:9px">UDHAR STATEMENT</p>
    </div>
    <div style="font-size:9px;margin-bottom:4px">Customer: <strong>${customer.name}</strong></div>
    ${customer.mobile ? `<div style="font-size:9px;margin-bottom:10px">Mobile: ${customer.mobile}</div>` : ''}
    <table style="width:100%;border-top:1px dashed #000;border-bottom:1px dashed #000;margin-bottom:10px">
      <thead><tr style="font-size:9px"><th style="text-align:left;padding:4px 0">DATE</th><th>TYPE</th><th style="text-align:right;padding:4px 0">AMT</th></tr></thead>
      <tbody>${sorted.map((tx: UdharTransaction) => `<tr><td style="font-size:9px;padding:2px 0">${new Date(tx.date).toLocaleDateString()}</td><td style="font-size:9px">${tx.type === 'udhar' ? 'Credit' : 'Payment'}</td><td style="text-align:right;font-size:9px">${tx.type === 'udhar' ? '+' : '-'}₹${tx.amount.toLocaleString('en-IN')}</td></tr>`).join('')}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;border-top:1px solid #000;padding-top:4px">
      <span>OUTSTANDING</span><span>₹${due.toLocaleString('en-IN')}</span>
    </div>
    <div style="text-align:center;margin-top:16px;padding-top:8px;border-top:1px dashed #000;font-size:8px">Please clear your outstanding at the earliest.<br/>Powered by Vyapar Sarthi</div>
  `;
  document.body.appendChild(div);
  const canvas = await html2canvas(div, { scale: 3, useCORS: true });
  const imgHeight = (canvas.height * 80) / canvas.width;
  const pdf = new jsPDF({ format: [80, imgHeight], unit: 'mm' });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 80, imgHeight);
  document.body.removeChild(div);
  const blob = pdf.output('blob');
  const file = new File([blob], `Udhar_${customer.name.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
  const msgLines = [
    `*Udhar Reminder*`,
    `From: ${shopName}`,
    `Customer: ${customer.name}`,
    `Outstanding: *₹${due.toLocaleString('en-IN')}*`,
    '',
    'Please clear your dues at the earliest.',
    '_Powered by Vyapar Sarthi_',
  ].join('\n');
  
  if (channel === 'email') {
    if (customer.email) {
      window.open(generateEmailLink(customer.email, `Udhar Statement - ${shopName}`, msgLines.replace(/\*/g, '').replace(/_/g, '')), '_blank');
    } else {
      alert('Customer has no email address.');
    }
    return;
  }
  
  // WhatsApp / Default share
  const shared = await shareFileOrText(file, msgLines, 'Udhar Statement');
  if (!shared) {
    const phone = (customer.mobile || '').replace(/[^0-9]/g, '');
    const waNum = phone.length === 10 ? `91${phone}` : phone.length > 10 ? phone : '';
    const encoded = encodeURIComponent(msgLines);
    window.open(waNum ? `https://api.whatsapp.com/send?phone=${waNum}&text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank');
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function UdharPage() {
  const t = useTranslations('Udhar');
  const locale = useLocale();
  const { profile } = useBusinessStore();
  const { customers, loading, fetchCustomers, addCustomer, updateCustomer, deleteCustomer, addTransaction, deleteTransaction } = useUdharStore();
  const isWholesale = profile.subscriptionPlan === 'wholesale';

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab]           = useState<'customers' | 'dukandars'>('customers');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<UdharCustomer | null>(null);
  const [modal, setModal]       = useState<'newCustomer' | 'udhar' | 'payment' | 'editCustomer' | 'autoReminder' | 'bulkRemind' | 'exportReport' | null>(null);
  const [recentTx, setRecentTx] = useState<{tx: UdharTransaction, customer: UdharCustomer, newDue: number} | null>(null);
  const slipRef                 = useRef<HTMLDivElement>(null);
  const [deleteId, setDeleteId] = useState<number | string | null>(null);
  const [txDeleteId, setTxDeleteId] = useState<number | string | null>(null);
  const [insightData, setInsightData] = useState<any>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addCustomerSuccess, setAddCustomerSuccess] = useState(false);
  const [addingTx, setAddingTx] = useState(false);

  // Multi-select & Sort
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [selectMode, setSelectMode]   = useState(false);
  const [sortOrder, setSortOrder]     = useState('new_to_old');

  // Dukandar tab state
  const [dukandars, setDukandars]         = useState<any[]>([]);
  const [dukandarSummary, setDukandarSummary] = useState<Record<string, any>>({});
  const [dukandarCredits, setDukandarCredits] = useState<Record<string, any[]>>({});
  const [expandedDukandar, setExpandedDukandar] = useState<string | null>(null);
  const [loadingDukandar, setLoadingDukandar]   = useState(false);
  const [loadingCreditsFor, setLoadingCreditsFor] = useState<string | null>(null);
  // My-dues view (for non-wholesale users who are dukandars of a wholesaler)
  const [myDues, setMyDues] = useState<any[]>([]);
  const [loadingMyDues, setLoadingMyDues] = useState(false);
  // Add-credit modal
  const [creditModal, setCreditModal] = useState<{ dukandar: any } | null>(null);
  const [creditForm, setCreditForm] = useState({ amount: '', description: '', dueDate: '' });
  const [creditSaving, setCreditSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  // Forms
  const [custForm, setCustForm] = useState({ name: '', mobile: '', email: '' });
  const [txForm, setTxForm]     = useState({ amount: '', note: '' });
  const [txError, setTxError]   = useState('');
  const [custError, setCustError] = useState('');
  const [reminderForm, setReminderForm] = useState({ date: '', time: '', message: '', channel: 'whatsapp' });
  const [savingReminder, setSavingReminder] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkChannel, setBulkChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  
  // Export Report State
  const [exportFilter, setExportFilter] = useState({ date: 'all', profile: 'all', format: 'pdf' });
  const [exportCustomDates, setExportCustomDates] = useState({ start: '', end: '' });
  const [exportSpecificProfile, setExportSpecificProfile] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchCustomers();
    api.get('/reports/top-products?group_by=udhar&limit=10').then(r => setInsightData(r.data)).catch(() => {});
  }, [fetchCustomers]);

  useEffect(() => {
    if (tab === 'dukandars') {
      if (isWholesale && dukandars.length === 0) loadDukandars();
      if (!isWholesale && myDues.length === 0) loadMyDues();
    }
  }, [tab, isWholesale]);

  async function loadDukandars() {
    setLoadingDukandar(true);
    try {
      const [dRes, sRes] = await Promise.all([
        api.get('/dukandar/my-dukandar'),
        api.get('/dukandar/credit/summary'),
      ]);
      setDukandars(dRes.data || []);
      setDukandarSummary(sRes.data || {});
    } catch {}
    finally { setLoadingDukandar(false); }
  }

  async function loadMyDues() {
    setLoadingMyDues(true);
    try {
      const r = await api.get('/dukandar/credit/my-dues');
      setMyDues(r.data || []);
    } catch {}
    finally { setLoadingMyDues(false); }
  }

  async function handleAddCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!creditModal) return;
    const amt = Number(creditForm.amount);
    if (!amt || amt <= 0) return;
    setCreditSaving(true);
    try {
      await api.post('/dukandar/credit/add', {
        retailerId: creditModal.dukandar.id,
        amount: amt,
        description: creditForm.description,
        dueDate: creditForm.dueDate || undefined,
      });
      setCreditModal(null);
      setCreditForm({ amount: '', description: '', dueDate: '' });
      // Refresh credits for this dukandar
      const r = await api.get(`/dukandar/credit/list?retailerId=${creditModal.dukandar.id}`);
      setDukandarCredits(m => ({ ...m, [creditModal.dukandar.id]: r.data || [] }));
      // Refresh summary
      const sRes = await api.get('/dukandar/credit/summary');
      setDukandarSummary(sRes.data || {});
    } catch { alert('Failed to add credit.'); }
    finally { setCreditSaving(false); }
  }

  async function handleMarkPaid(creditId: string, retailerId: string) {
    setMarkingPaidId(creditId);
    try {
      await api.patch(`/dukandar/credit/pay/${creditId}`, {});
      const r = await api.get(`/dukandar/credit/list?retailerId=${retailerId}`);
      setDukandarCredits(m => ({ ...m, [retailerId]: r.data || [] }));
      const sRes = await api.get('/dukandar/credit/summary');
      setDukandarSummary(sRes.data || {});
    } catch { alert('Failed to mark as paid.'); }
    finally { setMarkingPaidId(null); }
  }

  function sendDukandarWhatsApp(d: any, pending: number) {
    const phone = (d.mobile || '').replace(/\D/g, '');
    const waNum = phone.length === 10 ? `91${phone}` : phone.length > 10 ? phone : '';
    const msg = [`*Payment Reminder*`, `From: ${profile.shopName || 'Store'}`, `Dear ${d.shopName || d.name},`, ``,
      `You have a pending credit of *₹${pending.toLocaleString('en-IN')}* with us.`, `Please clear your dues at the earliest.`,
      `_Powered by Vyapar Sarthi_`].join('\n');
    const encoded = encodeURIComponent(msg);
    window.open(waNum ? `https://api.whatsapp.com/send?phone=${waNum}&text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank');
  }

  async function toggleDukandar(id: string) {
    if (expandedDukandar === id) { setExpandedDukandar(null); return; }
    setExpandedDukandar(id);
    if (!dukandarCredits[id]) {
      setLoadingCreditsFor(id);
      try {
        const r = await api.get(`/dukandar/credit/list?retailerId=${id}`);
        setDukandarCredits(m => ({ ...m, [id]: r.data || [] }));
      } catch {}
      finally { setLoadingCreditsFor(null); }
    }
  }

  const filtered = useMemo(() => {
    let res = customers.filter(c => {
      const match = c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search);
      if (search.trim().length > 0) return match;
      return match && (totalDue(c) !== 0 || (c.transactions && c.transactions.length > 0));
    });

    res.sort((a, b) => {
      if (sortOrder === 'a_to_z') return a.name.localeCompare(b.name);
      if (sortOrder === 'z_to_a') return b.name.localeCompare(a.name);
      
      const getLatestTxDate = (c: any) => {
        if (!c.transactions || c.transactions.length === 0) return 0;
        return Math.max(...c.transactions.map((t: any) => new Date(t.date).getTime()));
      };

      if (sortOrder === 'recent_tx') {
        return getLatestTxDate(b) - getLatestTxDate(a);
      }
      
      const getSortDate = (c: any) => {
        const txDate = getLatestTxDate(c);
        const createdDate = c.createdAt ? new Date(c.createdAt).getTime() : 0;
        return Math.max(txDate, createdDate);
      };

      const dateA = getSortDate(a);
      const dateB = getSortDate(b);
      
      if (sortOrder === 'old_to_new') return dateA - dateB;
      // Default: new_to_old (Recently Added / Recent Activity)
      return dateB - dateA;
    });

    return res;
  }, [customers, search, sortOrder]);

  const totalOutstanding = useMemo(() => customers.reduce((s, c) => s + totalDue(c), 0), [customers]);

  function toggleSelect(id: string | number) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.filter(c => totalDue(c) > 0).length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.filter(c => totalDue(c) > 0).map(c => c.id)));
    }
  }

  async function handleBulkRemind() {
    setBulkSending(true);
    const targets = customers.filter(c => selectedIds.has(c.id) && totalDue(c) > 0);
    for (const customer of targets) {
      if (bulkChannel === 'whatsapp') {
        await shareCustomerLedger(customer, profile.shopName || 'My Store', 'whatsapp');
        await new Promise(r => setTimeout(r, 600));
      } else {
        const due = totalDue(customer);
        const to = customer.email || '';
        const subject = encodeURIComponent(`Udhar Reminder - ₹${due.toLocaleString('en-IN')} Outstanding`);
        const body = encodeURIComponent(`Dear ${customer.name},\n\nYour outstanding due to ${profile.shopName || 'our store'} is ₹${due.toLocaleString('en-IN')}.\n\nPlease clear at the earliest.\n\nPowered by Vyapar Sarthi`);
        window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
        await new Promise(r => setTimeout(r, 800));
      }
    }
    setBulkSending(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setModal(null);
  }
  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setExporting(true);
    try {
      let filteredCustomers = customers;

      // Profile filter
      if (exportFilter.profile === 'selected' && selectedIds.size > 0) {
        filteredCustomers = customers.filter(c => selectedIds.has(c.id));
      } else if (exportFilter.profile === 'specific' && exportSpecificProfile) {
        filteredCustomers = customers.filter(c => String(c.id) === exportSpecificProfile);
      }

      // Date Filter
      let dateLabel = 'All Time';
      if (exportFilter.date !== 'all') {
        const now = new Date();
        let start = new Date(0);
        let end = new Date();

        if (exportFilter.date === 'today') {
          start = new Date(now.setHours(0, 0, 0, 0));
          dateLabel = 'Today';
        } else if (exportFilter.date === 'week') {
          const first = now.getDate() - now.getDay();
          start = new Date(now.setDate(first));
          start.setHours(0, 0, 0, 0);
          dateLabel = 'This Week';
        } else if (exportFilter.date === 'month') {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          dateLabel = 'This Month';
        } else if (exportFilter.date === 'custom') {
          start = new Date(exportCustomDates.start);
          end = new Date(exportCustomDates.end);
          end.setHours(23, 59, 59, 999);
          dateLabel = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
        }

        // Filter transactions within customer
        filteredCustomers = filteredCustomers.map(c => ({
          ...c,
          transactions: (c.transactions || []).filter((tx: any) => {
            const txDate = new Date(tx.date).getTime();
            return txDate >= start.getTime() && txDate <= end.getTime();
          })
        }));
      }

      // Generate
      if (exportFilter.format === 'pdf') {
        exportUdharPDF(filteredCustomers, profile.shopName || 'My Store', dateLabel);
      } else {
        exportUdharCSV(filteredCustomers, profile.shopName || 'My Store', dateLabel);
      }
      
      setModal(null);
    } catch (err) {
      console.error(err);
      alert('Failed to generate report');
    } finally {
      setExporting(false);
    }
  }


  async function saveAutoReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSavingReminder(true);
    try {
      await api.post('/notifications/set-reminder', {
        customerId: selected.id,
        customerName: selected.name,
        mobile: selected.mobile,
        email: selected.email,
        dueAmount: totalDue(selected),
        reminderDate: reminderForm.date,
        reminderTime: reminderForm.time,
        channel: reminderForm.channel,
        message: reminderForm.message || `Reminder: ₹${totalDue(selected).toLocaleString('en-IN')} is due from ${selected.name}`,
      });
      alert('Auto-reminder set successfully!');
      setModal(null);
    } catch {
      alert('Failed to set reminder. Please try again.');
    } finally {
      setSavingReminder(false);
    }
  }

  function openNew()   { setCustForm({ name: '', mobile: '', email: '' }); setCustError(''); setModal('newCustomer'); }
  function openEdit(c: UdharCustomer) { setCustForm({ name: c.name, mobile: c.mobile, email: c.email || '' }); setCustError(''); setModal('editCustomer'); }
  function openUdhar()   { setTxForm({ amount: '', note: '' }); setTxError(''); setModal('udhar'); }
  function openPayment() { setTxForm({ amount: '', note: '' }); setTxError(''); setModal('payment'); }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!custForm.name.trim()) { setCustError(t('nameRequired')); return; }
    setAddingCustomer(true);
    try {
      const customerId = await addCustomer(custForm.name.trim(), custForm.mobile.trim(), custForm.email.trim());
      const tx: UdharTransaction = { id: Math.random().toString(36).substring(7), type: 'udhar', amount: 0, note: 'Account Created', date: new Date().toISOString() };
      await addTransaction(customerId, tx);
      setAddCustomerSuccess(true);
      setTimeout(() => {
        setModal(null);
        setAddCustomerSuccess(false);
      }, 1500);
    } catch {
      setCustError('Failed to add customer.');
    } finally {
      setAddingCustomer(false);
    }
  }

  function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!custForm.name.trim()) { setCustError(t('nameRequired')); return; }
    updateCustomer(selected!.id, custForm.name.trim(), custForm.mobile.trim(), custForm.email.trim());
    setModal(null);
  }

  function handleDeleteCustomer() {
    deleteCustomer(deleteId!);
    setDeleteId(null);
    setSelected(null);
  }

  async function handleAddUdhar(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(txForm.amount);
    if (!amt || amt <= 0) { setTxError(t('validAmount')); return; }
    const tx: UdharTransaction = { id: Math.random().toString(36).substring(7), type: 'udhar', amount: amt, note: txForm.note, date: new Date().toISOString() };
    setAddingTx(true);
    try {
      await addTransaction(selected!.id, tx);
      const customer = customers.find(c => c.id === selected!.id)!;
      setModal(null);
      setRecentTx({ tx, customer, newDue: totalDue(customer) + amt });
    } catch {
      setTxError(t('addUdharFailed'));
    } finally {
      setAddingTx(false);
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(txForm.amount);
    if (!amt || amt <= 0) { setTxError(t('validAmount')); return; }
    const customer = customers.find(c => c.id === selected!.id)!;
    const due = totalDue(customer);
    if (amt > due) { setTxError(`${t('exceedsDue')} ₹${due}.`); return; }
    const tx: UdharTransaction = { id: Math.random().toString(36).substring(7), type: 'payment', amount: amt, note: txForm.note, date: new Date().toISOString() };
    setAddingTx(true);
    try {
      await addTransaction(selected!.id, tx);
      setModal(null);
      setRecentTx({ tx, customer, newDue: totalDue(customer) - amt });
    } catch {
      setTxError(t('paymentFailed'));
    } finally {
      setAddingTx(false);
    }
  }

  async function handleShareRecentTx() {
    if (!recentTx || !slipRef.current) return;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf')
      ]);

      const clone = slipRef.current.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.top = '0';
      clone.style.left = '-9999px';
      clone.style.width = '320px';
      clone.style.height = 'auto';
      clone.style.backgroundColor = '#ffffff';
      document.body.appendChild(clone);

      await new Promise(r => setTimeout(r, 200));

      const canvas = await html2canvas(clone, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      document.body.removeChild(clone);

      const blob = pdf.output('blob');
      const fileName = `udhar-${Date.now()}.pdf`;
      const pdfUrl = await uploadInvoiceToSupabase(blob, fileName);

      const text = generateUdharWhatsAppText({
        type: recentTx.tx.type,
        storeName: profile.shopName || 'My Store',
        customerName: recentTx.customer.name,
        amount: recentTx.tx.amount,
        date: new Date(recentTx.tx.date).toLocaleDateString('en-IN'),
        due: recentTx.newDue,
        note: recentTx.tx.note,
        pdfUrl: pdfUrl || undefined,
      });

      const phone = (recentTx.customer.mobile || '').replace(/\D/g, '');
      const waNum = phone.length === 10 ? `91${phone}` : phone.length > 10 ? phone : '';
      const encoded = encodeURIComponent(text);
      window.open(waNum ? `https://api.whatsapp.com/send?phone=${waNum}&text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank');
      setRecentTx(null);
    } catch (err) {
      console.error('Failed to share:', err);
    }
  }

  // ─── Customer detail view ──────────────────────────────────────────────────
  if (!mounted) return <div className="h-full flex items-center justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;

  if (selected) {
    const customer = customers.find(c => c.id === selected.id) ?? selected;
    const due = totalDue(customer);
    const sorted = [...(customer.transactions || [])].reverse();

    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)}
              className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:text-white transition-colors active:scale-95">
              <ChevronLeft size={20} />
            </button>
            <div className="w-11 h-11 rounded-2xl bg-orange-500/15 flex items-center justify-center text-lg font-black text-orange-400">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{customer.name}</h1>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Phone size={12} />{customer.mobile || t('noMobile')}
              </p>
              {customer.email && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Mail size={12} />{customer.email}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setReminderForm({ date: '', time: '', message: '', channel: 'whatsapp' }); setModal('autoReminder'); }}
              className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors" title="Set Payment Reminder">
              <AlarmClock size={17} />
            </button>
            <button onClick={() => openEdit(customer)} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"><Pencil size={17} /></button>
            <button onClick={() => setDeleteId(customer.id)} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={17} /></button>
          </div>
        </div>

        {/* Due card + actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-5">
              <p className="text-xs text-slate-400 uppercase font-bold">{t('totalDue')}</p>
              <p className={cn('text-3xl font-black mt-1', due > 0 ? 'text-orange-500' : 'text-emerald-400')}>
                ₹{due.toLocaleString('en-IN')}
              </p>
              {due === 0 && <p className="text-xs text-emerald-400 mt-1">{t('allCleared')}</p>}
            </CardContent>
          </Card>
          <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button onClick={openUdhar}
              className="bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:bg-orange-500/20 transition-colors text-sm active:scale-95">
              <Plus size={16} />{t('addUdhar')}
            </button>
            <button onClick={openPayment} disabled={due <= 0}
              className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-colors text-sm disabled:opacity-40 active:scale-95">
              <Minus size={16} />{t('recordPayment')}
            </button>
            {due > 0 && (
              <>
                <button onClick={() => shareCustomerLedger(customer, profile.shopName || 'My Store', 'whatsapp')}
                  className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:bg-green-500/20 transition-colors text-sm active:scale-95">
                  <Send size={16} /> WhatsApp
                </button>
                <button onClick={() => shareCustomerLedger(customer, profile.shopName || 'My Store', 'email')}
                  className="bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:bg-blue-500/20 transition-colors text-sm active:scale-95">
                  <Mail size={16} /> Email
                </button>
              </>
            )}
          </div>
        </div>

        {/* Transaction history */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <p className="text-sm font-bold text-slate-300">{t('transactionHistory')}</p>
            </div>
            {sorted.length === 0 ? (
              <p className="px-5 py-10 text-center text-slate-500 text-sm">{t('noTransactions')}</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {sorted.map(tx => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-100 dark:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => setRecentTx({ tx, customer: selected!, newDue: totalDue(selected!) })}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        tx.type === 'udhar' ? 'bg-orange-500/15 text-orange-400' : 'bg-emerald-500/15 text-emerald-400')}>
                        {tx.type === 'udhar' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-200">
                          {tx.type === 'udhar' ? t('udharGiven') : t('paymentReceived')}
                          {tx.billNumber && <span className="ml-2 text-xs text-slate-500">#{tx.billNumber}</span>}
                        </p>
                        {tx.note && <p className="text-xs text-slate-500">{tx.note}</p>}
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {new Date(tx.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn('font-bold text-base', tx.type === 'udhar' ? 'text-orange-400' : 'text-emerald-400')}>
                        {tx.type === 'udhar' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                      </p>
                      {txDeleteId === tx.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); deleteTransaction(selected!.id, tx.id); setTxDeleteId(null); }} className="text-red-400 p-1"><Check size={13} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setTxDeleteId(null); }} className="text-slate-400 p-1"><X size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setTxDeleteId(tx.id); }} className="text-slate-700 hover:text-red-400 p-1 transition-colors"><Trash size={13} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modals */}
        {modal === 'editCustomer' && (
          <UModal title={t('editCustomer')} onClose={() => setModal(null)}>
            <form onSubmit={handleEditCustomer} className="space-y-4">
              <UField label={t('nameLabel')}><input required className={inp} value={custForm.name} onChange={e => setCustForm(f => ({ ...f, name: e.target.value }))} /></UField>
              <UField label={t('mobileLabel')}><input className={inp} type="tel" value={custForm.mobile} onChange={e => setCustForm(f => ({ ...f, mobile: e.target.value }))} /></UField>
              <UField label="Email (for reminders)"><input className={inp} type="email" inputMode="email" placeholder="customer@example.com" value={custForm.email} onChange={e => setCustForm(f => ({ ...f, email: e.target.value }))} /></UField>
              {custError && <p className="text-red-400 text-sm">{custError}</p>}
              <UActions onCancel={() => setModal(null)} submitLabel={t('save')} submitCls="bg-emerald-500 text-slate-900 hover:bg-emerald-400" />
            </form>
          </UModal>
        )}
        {modal === 'udhar' && (
          <UModal title={t('addUdhar')} icon={<Plus size={17} className="text-orange-400" />} onClose={() => !addingTx && setModal(null)}>
            <form onSubmit={handleAddUdhar} className="space-y-4">
              <UField label={t('amountLabel')}><input type="number" min="1" required disabled={addingTx} inputMode="numeric" className={cn(inp, 'disabled:opacity-50')} placeholder="0" value={txForm.amount} onChange={e => { setTxForm(f => ({ ...f, amount: e.target.value })); setTxError(''); }} /></UField>
              <UField label={t('noteLabel')}><input disabled={addingTx} className={cn(inp, 'disabled:opacity-50')} placeholder={t('noteHint')} value={txForm.note} onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))} /></UField>
              {txError && <p className="text-red-400 text-sm">{txError}</p>}
              <UActions onCancel={() => setModal(null)} submitLabel={addingTx ? t('adding') : t('addUdhar')} submitCls="bg-orange-500 text-slate-900 hover:bg-orange-400" submitting={addingTx} cancelLabel={t('cancel')} />
            </form>
          </UModal>
        )}
        {modal === 'payment' && (
          <UModal title={t('recordPayment')} icon={<Minus size={17} className="text-emerald-400" />} onClose={() => !addingTx && setModal(null)}>
            <form onSubmit={handlePayment} className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-2 text-sm text-slate-400">
                {t('totalDueLabel')}: <span className="text-orange-400 font-bold">₹{totalDue(customer).toLocaleString('en-IN')}</span>
              </div>
              <UField label={t('amountPaid')}><input type="number" min="1" max={totalDue(customer)} required disabled={addingTx} inputMode="numeric" className={cn(inp, 'disabled:opacity-50')} placeholder="0" value={txForm.amount} onChange={e => { setTxForm(f => ({ ...f, amount: e.target.value })); setTxError(''); }} /></UField>
              <UField label={t('noteLabel')}><input disabled={addingTx} className={cn(inp, 'disabled:opacity-50')} placeholder={t('paymentNoteHint')} value={txForm.note} onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))} /></UField>
              {txError && <p className="text-red-400 text-sm">{txError}</p>}
              <UActions onCancel={() => setModal(null)} submitLabel={addingTx ? t('adding') : t('recordPayment')} submitCls="bg-emerald-500 text-slate-900 hover:bg-emerald-400" submitting={addingTx} cancelLabel={t('cancel')} />
            </form>
          </UModal>
        )}
        {modal === 'autoReminder' && (
          <UModal title="Set Payment Reminder" icon={<AlarmClock size={17} className="text-amber-400" />} onClose={() => setModal(null)}>
            <form onSubmit={saveAutoReminder} className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300">
                Customer: <span className="font-bold text-slate-900 dark:text-white">{customer.name}</span>
                <span className="ml-2 text-orange-400 font-bold">₹{due.toLocaleString('en-IN')} due</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Select:</span>
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: '3 Days', days: 3 },
                    { label: '1 Week', days: 7 },
                  ].map(preset => (
                    <button key={preset.label} type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + preset.days);
                        setReminderForm(f => ({ ...f, date: d.toISOString().split('T')[0], time: f.time || '10:00' }));
                      }}
                      className="px-3 py-1 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={16} />
                      <input type="date" required className={cn(inp, 'pl-10 text-slate-700 dark:text-slate-300 font-semibold focus:ring-orange-500 cursor-pointer w-full appearance-none min-h-[42px]')} value={reminderForm.date} onChange={e => setReminderForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Time</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={16} />
                      <input type="time" required className={cn(inp, 'pl-10 text-slate-700 dark:text-slate-300 font-semibold focus:ring-orange-500 cursor-pointer w-full appearance-none min-h-[42px]')} value={reminderForm.time} onChange={e => setReminderForm(f => ({ ...f, time: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
              <UField label="Notification Channel">
                <div className="flex gap-2">
                  {[{ v: 'whatsapp', label: 'WhatsApp', icon: MessageSquare }, { v: 'email', label: 'Email', icon: Mail }, { v: 'app', label: 'Notify Me', icon: Bell }].map(({ v, label, icon: Icon }) => (
                    <button key={v} type="button"
                      onClick={() => setReminderForm(f => ({ ...f, channel: v }))}
                      className={cn('flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-bold transition-all',
                        reminderForm.channel === v
                          ? 'bg-orange-500/15 border-orange-500/40 text-orange-500 shadow-sm shadow-orange-500/10'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                      )}>
                      <Icon size={18} className={reminderForm.channel === v ? 'text-orange-500' : 'text-slate-400'} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </UField>
              <UField label="Custom Message (optional)">
                <textarea rows={2} className={cn(inp, 'resize-none text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:border-orange-500/50 focus:border-orange-500')} placeholder={`Reminder: ₹${due.toLocaleString('en-IN')} is due`}
                  value={reminderForm.message} onChange={e => setReminderForm(f => ({ ...f, message: e.target.value }))} />
              </UField>
              <UActions onCancel={() => setModal(null)} submitLabel={savingReminder ? 'Saving…' : 'Set Reminder'} submitCls="bg-orange-500 text-slate-900 hover:bg-orange-400 disabled:opacity-50 font-bold" />
            </form>
          </UModal>
        )}
        {deleteId === customer.id && (
          <ConfirmDel name={customer.name} t={t} onConfirm={handleDeleteCustomer} onCancel={() => setDeleteId(null)} />
        )}

        {/* Recent Transaction Receipt Modal */}
        {recentTx && (
          <UModal title="Receipt Generated" onClose={() => setRecentTx(null)}>
            <div className="flex flex-col items-center">
              <div className="border border-slate-200 dark:border-slate-800 p-2 bg-white rounded-lg mb-6 shadow-sm overflow-x-auto w-full flex justify-center">
                <UdharSlip
                  ref={slipRef}
                  type={recentTx.tx.type}
                  amount={recentTx.tx.amount}
                  customerName={recentTx.customer.name}
                  customerMobile={recentTx.customer.mobile}
                  date={new Date(recentTx.tx.date).toLocaleDateString('en-IN')}
                  note={recentTx.tx.note}
                  storeName={profile.shopName || 'My Store'}
                  due={recentTx.newDue}
                />
              </div>
              <div className="flex gap-3 w-full">
                <button onClick={handleShareRecentTx} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                  <Send size={18} /> Share Receipt
                </button>
                <button onClick={() => setRecentTx(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold transition-colors">
                  Done
                </button>
              </div>
              {recentTx.tx.billNumber && (
                <Link href={`/billing/invoices/${recentTx.tx.billNumber}`} className="mt-3 w-full bg-orange-500 hover:bg-orange-400 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                  <FileText size={18} /> View Original Bill
                </Link>
              )}
            </div>
          </UModal>
        )}
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">{t('title')}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {t('totalOutstanding')}: <span className="text-orange-400 font-bold">₹{totalOutstanding.toLocaleString('en-IN')}</span>
            {' · '}{filtered.length}{udharLimitDisplay(profile.subscriptionPlan) !== 'Unlimited' ? `/${udharLimitDisplay(profile.subscriptionPlan)}` : ''} {t('customers')}
          </p>
          {/* Upgrade banner when near/at limit */}
          {!canAddUdharCustomer(profile.subscriptionPlan, customers.length) && (
            <a href={`/${locale}/payment?plan=vyapar`}
              className="mt-1 inline-flex items-center gap-1.5 text-xs bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-3 py-1 rounded-full hover:bg-indigo-500/20 transition-colors font-semibold">
              Limit reached · Upgrade to Vyapar for unlimited customers →
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'customers' && (
            <>
              <button onClick={() => setModal('exportReport')}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                <Download size={16} /> Export
              </button>
              <button
                onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()); }}
                className={cn('px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                  selectMode ? 'bg-blue-500/15 border-blue-500/40 text-blue-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:text-white'
                )}>
                {selectMode ? 'Cancel' : 'Select'}
              </button>
              {selectMode && selectedIds.size > 0 && (
                <button onClick={() => setModal('bulkRemind')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500 text-slate-900 font-bold text-sm active:scale-95">
                  <Send size={15} /> Remind ({selectedIds.size})
                </button>
              )}
              {canAddUdharCustomer(profile.subscriptionPlan, customers.length) ? (
                <button onClick={openNew}
                  className="bg-orange-500 text-slate-900 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-orange-400 transition-colors text-sm active:scale-95">
                  <UserPlus size={16} />{t('newCustomer')}
                </button>
              ) : (
                <a href={`/${locale}/payment?plan=vyapar`}
                  className="bg-indigo-500 text-slate-900 dark:text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-400 transition-colors text-sm active:scale-95">
                  <UserPlus size={16} /> Upgrade for more customers
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs — temporarily hidden as per user request */}
      <div className="hidden gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
        {[
          { key: 'customers', label: t('customersTab') || 'Customers', icon: Users },
          { key: 'dukandars', label: isWholesale ? 'Dukandars' : t('wholesalers') || 'My Wholesalers', icon: Store },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all',
              tab === key ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-300'
            )}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── Customers tab ── */}
      {tab === 'customers' && (
        <>
          {/* Insight chart */}
          {insightData?.items?.length > 0 && (
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-5 bg-orange-500 rounded-full" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wide">Top Debtors</h2>
                </div>
                <TopProductsPieChart items={insightData.items} total={insightData.total} currency={insightData.currency} valueLabel="Udhar Due" />
              </CardContent>
            </Card>
          )}

          {/* Select-all bar */}
          {selectMode && filtered.some(c => totalDue(c) > 0) && (
            <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm text-blue-400 font-semibold">
                {selectedIds.size === filtered.filter(c => totalDue(c) > 0).length
                  ? <CheckSquare size={16} /> : <Square size={16} />}
                Select All ({filtered.filter(c => totalDue(c) > 0).length} with dues)
              </button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-slate-400">{selectedIds.size} selected</span>
              )}
            </div>
          )}

          {/* Search & Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input type="text" placeholder={t('searchPlaceholder')}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-[200px]"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
            >
              <option value="new_to_old">Recently Added</option>
              <option value="old_to_new">Oldest Added</option>
              <option value="a_to_z">Alphabetical (A to Z)</option>
              <option value="z_to_a">Alphabetical (Z to A)</option>
              <option value="recent_tx">Recent Transactions</option>
            </select>
          </div>

          {/* Customer cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(customer => {
              const due = totalDue(customer);
              const lastTx = [...(customer.transactions || [])].pop();
              const isSelected = selectedIds.has(customer.id);
              const canSelect = due > 0;
              return (
                <Card key={customer.id}
                  onClick={() => selectMode && canSelect ? toggleSelect(customer.id) : (!selectMode && setSelected(customer))}
                  className={cn('bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-all cursor-pointer group',
                    selectMode && canSelect ? isSelected ? 'border-blue-500/50 bg-blue-500/5' : 'hover:border-slate-300 dark:border-slate-700' : 'hover:border-orange-500/40',
                    selectMode && !canSelect && 'opacity-40 cursor-not-allowed'
                  )}>
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {selectMode && canSelect && (
                          <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                          )}>
                            {isSelected && <Check size={12} className="text-slate-900 dark:text-white" />}
                          </div>
                        )}
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-base font-bold text-orange-400 flex-shrink-0">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{customer.name}</h3>
                          <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                            <Phone size={11} />{customer.mobile || t('noMobile')}
                          </div>
                        </div>
                      </div>
                      {!selectMode && (
                        <ArrowRight size={18} className="text-slate-700 group-hover:text-orange-500 transition-colors flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">{t('totalDue')}</p>
                        <p className={cn('text-xl font-black', due > 0 ? 'text-orange-500' : 'text-emerald-400')}>
                          ₹{due.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">{t('lastActivity')}</p>
                        <div className="flex items-center justify-end gap-1 text-slate-400 mt-0.5">
                          <Calendar size={11} />
                          <span className="text-xs">{lastTx ? relativeDate(lastTx.date) : t('none')}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              loading ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
                  <span className="text-sm">Loading khata…</span>
                </div>
              ) : (
                <div className="col-span-3 py-16 text-center text-slate-500 text-sm">{t('noCustomers')}</div>
              )
            )}
          </div>
        </>
      )}

      {/* ── Dukandars tab ── */}
      {tab === 'dukandars' && (
        <>
          {/* ── WHOLESALE: manage dukandars & extend credit ── */}
          {isWholesale && (
            <>
              {loadingDukandar ? (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
              ) : dukandars.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-800/ flex items-center justify-center">
                    <Store className="w-9 h-9 text-slate-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-bold text-slate-300 mb-1">No Dukandars Yet</h3>
                    <p className="text-sm text-slate-500 max-w-xs">Add dukandars from the Dukandar page to track credit here.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Pending', value: `₹${Object.values(dukandarSummary).reduce((s: number, v: any) => s + (v.pending || 0), 0).toLocaleString('en-IN')}`, color: 'text-red-400' },
                      { label: 'Received', value: `₹${Object.values(dukandarSummary).reduce((s: number, v: any) => s + (v.paid || 0), 0).toLocaleString('en-IN')}`, color: 'text-emerald-400' },
                      { label: 'Dukandars', value: String(dukandars.length), color: 'text-blue-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center">
                        <p className={cn('text-lg font-bold', color)}>{value}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Dukandar accordion list */}
                  <div className="space-y-3">
                    {dukandars.map((d: any) => {
                      const s = dukandarSummary[d.id] || { total: 0, pending: 0, paid: 0 };
                      const isOpen = expandedDukandar === d.id;
                      const credits = dukandarCredits[d.id] || [];

                      return (
                        <div key={d.id} className={cn('rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden transition-all',
                          isOpen ? 'border-emerald-500/40' : 'border-slate-200 dark:border-slate-800')}>
                          <button className="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-slate-100 dark:bg-slate-800/"
                            onClick={() => toggleDukandar(d.id)}>
                            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-base font-bold text-emerald-400 flex-shrink-0">
                              {(d.shopName || d.name || 'D').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{d.shopName || d.name}</p>
                              <p className="text-xs text-slate-500 truncate">{d.email}</p>
                              {d.stockAlerts?.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-semibold mt-0.5">
                                  <Package size={10} /> {d.stockAlerts.length} low stock
                                </span>
                              )}
                            </div>
                            <div className="text-right mr-2 flex-shrink-0">
                              <p className="text-sm font-bold text-red-400">₹{s.pending.toLocaleString('en-IN')}</p>
                              <p className="text-[11px] text-slate-500">pending</p>
                            </div>
                            <ChevronRight className={cn('w-4 h-4 text-slate-600 flex-shrink-0 transition-transform', isOpen && 'rotate-90 text-emerald-400')} />
                          </button>

                          {isOpen && (
                            <div className="border-t border-slate-200 dark:border-slate-800 px-4 pb-4 pt-3 space-y-4">
                              {/* Stats */}
                              <div className="grid grid-cols-3 gap-3">
                                {[
                                  { label: 'Total Credit', value: `₹${s.total.toLocaleString('en-IN')}`, color: 'text-slate-300' },
                                  { label: 'Pending', value: `₹${s.pending.toLocaleString('en-IN')}`, color: 'text-red-400' },
                                  { label: 'Received', value: `₹${s.paid.toLocaleString('en-IN')}`, color: 'text-emerald-400' },
                                ].map(({ label, value, color }) => (
                                  <div key={label} className="bg-slate-100 dark:bg-slate-800/ rounded-xl p-3 text-center">
                                    <p className={cn('text-base font-bold', color)}>{value}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Action buttons */}
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  onClick={() => { setCreditForm({ amount: '', description: '', dueDate: '' }); setCreditModal({ dukandar: d }); }}
                                  className="flex items-center justify-center gap-1.5 py-2.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl text-xs font-bold hover:bg-orange-500/20 transition-colors">
                                  <Plus size={13} /> Add Credit
                                </button>
                                <button
                                  onClick={() => sendDukandarWhatsApp(d, s.pending)}
                                  disabled={s.pending <= 0}
                                  className="flex items-center justify-center gap-1.5 py-2.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-xs font-bold hover:bg-green-500/20 transition-colors disabled:opacity-40">
                                  <Send size={13} /> WhatsApp
                                </button>
                                <button
                                  onClick={() => { loadDukandars(); toggleDukandar(d.id); }}
                                  className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-400 rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors">
                                  <ArrowRight size={13} /> Refresh
                                </button>
                              </div>

                              {/* Credit history */}
                              {loadingCreditsFor === d.id ? (
                                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /></div>
                              ) : credits.length === 0 ? (
                                <div className="py-4 text-center text-sm text-slate-500">No credit records yet</div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Credit History</p>
                                  {credits.map((c: any) => {
                                    const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && c.status === 'pending';
                                    return (
                                      <div key={c.id} className={cn('rounded-xl border p-3.5',
                                        c.status === 'paid' ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-slate-100 dark:bg-slate-800/ border-slate-300 dark:border-slate-700/50',
                                        isOverdue && 'border-red-500/30')}>
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                          <div>
                                            <p className="text-base font-bold text-slate-900 dark:text-white">₹{c.amount.toLocaleString('en-IN')}</p>
                                            {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                                              c.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400')}>
                                              {c.status}
                                            </span>
                                            {c.status === 'pending' && (
                                              <button
                                                onClick={() => handleMarkPaid(c.id, d.id)}
                                                disabled={markingPaidId === c.id}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-colors disabled:opacity-50">
                                                {markingPaidId === c.id ? '…' : '✓ Paid'}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                                          {c.createdAt && <span className="flex items-center gap-1"><Calendar size={11} />{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                          {c.dueDate && <span className={cn('flex items-center gap-1', isOverdue && 'text-red-400')}><Clock size={11} />Due: {new Date(c.dueDate).toLocaleDateString('en-IN')}</span>}
                                        </div>
                                        {c.items?.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-2">
                                            {c.items.map((item: any, i: number) => (
                                              <span key={i} className="px-2 py-0.5 bg-slate-700 rounded-md text-[11px] text-slate-300">{item.name}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── NON-WHOLESALE: see dues from wholesalers ── */}
          {!isWholesale && (
            <>
              {loadingMyDues ? (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
              ) : myDues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-800/ flex items-center justify-center">
                    <Store className="w-9 h-9 text-slate-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-bold text-slate-300 mb-1">{t('noWholesalerCredits') || 'No Wholesaler Credits'}</h3>
                    <p className="text-sm text-slate-500 max-w-xs">{t('wholesalerCreditsDesc') || 'When a wholesaler adds credit for your shop, it will appear here.'}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Totals */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total Pending', value: `₹${myDues.filter(d => d.status === 'pending').reduce((s: number, d: any) => s + d.amount, 0).toLocaleString('en-IN')}`, color: 'text-red-400' },
                      { label: 'Total Paid', value: `₹${myDues.filter(d => d.status === 'paid').reduce((s: number, d: any) => s + d.amount, 0).toLocaleString('en-IN')}`, color: 'text-emerald-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center">
                        <p className={cn('text-lg font-bold', color)}>{value}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {myDues.map((c: any) => {
                      const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && c.status === 'pending';
                      return (
                        <div key={c.id} className={cn('rounded-2xl border bg-white dark:bg-slate-900 p-4',
                          c.status === 'paid' ? 'border-emerald-500/15' : 'border-slate-200 dark:border-slate-800',
                          isOverdue && 'border-red-500/30')}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{c.wholesalerShop || c.wholesalerName}</p>
                              {c.wholesalerShop && <p className="text-xs text-slate-500">{c.wholesalerName}</p>}
                            </div>
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                              c.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400')}>
                              {c.status}
                            </span>
                          </div>
                          <p className={cn('text-2xl font-black mb-2', c.status === 'pending' ? 'text-red-400' : 'text-emerald-400')}>
                            ₹{c.amount.toLocaleString('en-IN')}
                          </p>
                          {c.description && <p className="text-xs text-slate-400 mb-2">{c.description}</p>}
                          <div className="flex flex-wrap gap-x-4 text-xs text-slate-500">
                            {c.createdAt && <span className="flex items-center gap-1"><Calendar size={11} />{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            {c.dueDate && <span className={cn('flex items-center gap-1', isOverdue && 'text-red-400')}><Clock size={11} />Due: {new Date(c.dueDate).toLocaleDateString('en-IN')}</span>}
                          </div>
                          {c.items?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {c.items.map((item: any, i: number) => (
                                <span key={i} className="px-2 py-0.5 bg-slate-700 rounded-md text-[11px] text-slate-300">{item.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* Add Credit Modal */}
          {creditModal && (
            <UModal title={`Add Credit — ${creditModal.dukandar.shopName || creditModal.dukandar.name}`} icon={<Plus size={17} className="text-orange-400" />} onClose={() => setCreditModal(null)}>
              <form onSubmit={handleAddCredit} className="space-y-4">
                <UField label="Amount (₹)">
                  <input type="number" min="1" required inputMode="numeric" className={inp} placeholder="0" value={creditForm.amount} onChange={e => setCreditForm(f => ({ ...f, amount: e.target.value }))} />
                </UField>
                <UField label="Description / Items">
                  <input className={inp} placeholder="e.g. Rice 50kg, Sugar 20kg" value={creditForm.description} onChange={e => setCreditForm(f => ({ ...f, description: e.target.value }))} />
                </UField>
                <UField label="Due Date (optional)">
                  <input type="date" className={inp} value={creditForm.dueDate} onChange={e => setCreditForm(f => ({ ...f, dueDate: e.target.value }))} />
                </UField>
                <UActions onCancel={() => setCreditModal(null)} submitLabel={creditSaving ? 'Saving…' : 'Add Credit'} submitCls="bg-orange-500 text-slate-900 hover:bg-orange-400 disabled:opacity-50" />
              </form>
            </UModal>
          )}
        </>
      )}

      {/* New Customer Modal */}
      {modal === 'newCustomer' && (
        <UModal title={t('newCustomer')} icon={<UserPlus size={17} className="text-orange-400" />} onClose={() => setModal(null)}>
          {addCustomerSuccess ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <Check size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Successfully Added!</h3>
            </div>
          ) : (
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <UField label={t('nameLabel')}><input required disabled={addingCustomer} className={inp} placeholder={t('namePlaceholder')} value={custForm.name} onChange={e => setCustForm(f => ({ ...f, name: e.target.value }))} /></UField>
              <UField label={t('mobileLabel')}><input className={inp} disabled={addingCustomer} type="tel" placeholder={t('mobilePlaceholder')} value={custForm.mobile} onChange={e => setCustForm(f => ({ ...f, mobile: e.target.value }))} /></UField>
              <UField label="Email (for reminders)"><input className={inp} disabled={addingCustomer} type="email" inputMode="email" placeholder="customer@example.com" value={custForm.email} onChange={e => setCustForm(f => ({ ...f, email: e.target.value }))} /></UField>
              {custError && <p className="text-red-400 text-sm">{custError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(null)} disabled={addingCustomer} className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-3 rounded-xl font-medium hover:bg-slate-700 transition-colors text-sm disabled:opacity-50">{t('cancel')}</button>
                <button type="submit" disabled={addingCustomer} className="flex-1 py-3 rounded-xl font-bold transition-colors text-sm bg-orange-500 text-slate-900 hover:bg-orange-400 disabled:opacity-50 flex items-center justify-center gap-2">
                  {addingCustomer ? <><Loader2 size={16} className="animate-spin" /> {t('adding')}</> : t('addCustomer')}
                </button>
              </div>
            </form>
          )}
        </UModal>
      )}

    {/* Bulk Remind Modal */}
      {modal === 'bulkRemind' && (
        <UModal title={`Send Reminder to ${selectedIds.size} customers`} icon={<Send size={17} className="text-emerald-400" />} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Choose how to send the reminder:</p>
            <div className="flex gap-2">
              {[{ v: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/40' },
                { v: 'email', label: 'Email', icon: Mail, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/40' }].map(({ v, label, icon: Icon, color, bg }) => (
                <button key={v} onClick={() => setBulkChannel(v as any)}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all',
                    bulkChannel === v ? cn(bg, color) : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                  )}>
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
              {customers.filter(c => selectedIds.has(c.id)).map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{c.name}</span>
                  <span className="text-orange-400 font-bold">₹{totalDue(c).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 py-3 bg-slate-50 dark:bg-slate-800 text-slate-300 rounded-xl font-medium text-sm">Cancel</button>
              <button onClick={handleBulkRemind} disabled={bulkSending}
                className="flex-1 py-3 bg-emerald-500 text-slate-900 font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {bulkSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send size={15} /> Send All</>}
              </button>
            </div>
          </div>
        </UModal>
      )}

      {/* Export Report Modal */}
      {modal === 'exportReport' && (
        <UModal title="Export Udhar Report" icon={<Download size={17} className="text-blue-400" />} onClose={() => setModal(null)}>
          <form onSubmit={handleExport} className="space-y-5">
            <UField label="Date Range">
              <select className={inp} value={exportFilter.date} onChange={e => setExportFilter(f => ({ ...f, date: e.target.value }))}>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="custom">Custom Range...</option>
              </select>
            </UField>
            
            {exportFilter.date === 'custom' && (
              <div className="flex gap-3">
                <UField label="Start Date">
                  <input type="date" className={inp} required value={exportCustomDates.start} onChange={e => setExportCustomDates(d => ({ ...d, start: e.target.value }))} />
                </UField>
                <UField label="End Date">
                  <input type="date" className={inp} required value={exportCustomDates.end} onChange={e => setExportCustomDates(d => ({ ...d, end: e.target.value }))} />
                </UField>
              </div>
            )}

            <UField label="Profiles">
              <select className={inp} value={exportFilter.profile} onChange={e => setExportFilter(f => ({ ...f, profile: e.target.value }))}>
                <option value="all">All Customers</option>
                {selectedIds.size > 0 && <option value="selected">Selected Customers ({selectedIds.size})</option>}
                <option value="specific">Specific Customer...</option>
              </select>
            </UField>

            {exportFilter.profile === 'specific' && (
              <UField label="Select Customer">
                <select className={inp} required value={exportSpecificProfile} onChange={e => setExportSpecificProfile(e.target.value)}>
                  <option value="">-- Choose Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.mobile ? `(${c.mobile})` : ''}</option>
                  ))}
                </select>
              </UField>
            )}

            <UField label="Export Format">
              <div className="flex gap-2">
                {[{ v: 'pdf', label: 'PDF Report' }, { v: 'csv', label: 'CSV/Excel' }].map(fmt => (
                  <button type="button" key={fmt.v} onClick={() => setExportFilter(f => ({ ...f, format: fmt.v }))}
                    className={cn('flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all',
                      exportFilter.format === fmt.v ? 'bg-blue-500/15 border-blue-500/40 text-blue-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:text-white'
                    )}>
                    {fmt.label}
                  </button>
                ))}
              </div>
            </UField>

            <UActions onCancel={() => setModal(null)} submitLabel={exporting ? 'Generating…' : 'Download Report'} submitCls="bg-blue-500 text-white hover:bg-blue-400" submitting={exporting} cancelLabel="Cancel" />
          </form>
        </UModal>
      )}
    </div>
  );
}

// ─── Reusable components ───────────────────────────────────────────────────────
function UModal({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">{icon}<h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:text-white p-1"><X size={19} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function UField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>{children}</div>;
}

function UActions({ onCancel, submitLabel, submitCls, submitting, cancelLabel }: { onCancel: () => void; submitLabel: string; submitCls: string; submitting?: boolean; cancelLabel?: string }) {
  return (
    <div className="flex gap-3 pt-1">
      <button type="button" onClick={onCancel} disabled={submitting} className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-3 rounded-xl font-medium hover:bg-slate-700 transition-colors text-sm disabled:opacity-50">{cancelLabel || 'Cancel'}</button>
      <button type="submit" disabled={submitting} className={cn('flex-1 py-3 rounded-xl font-bold transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95', submitCls)}>
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}

function ConfirmDel({ name, t, onConfirm, onCancel }: { name: string; t: any; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center"><Trash2 size={18} className="text-red-400" /></div>
          <div><p className="font-bold text-slate-900 dark:text-slate-100">{t('deleteCustomer')}</p><p className="text-sm text-slate-400">{t('deleteWarning')}</p></div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-900 dark:text-slate-200 font-medium">{name}</div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700">{t('cancel')}</button>
          <button onClick={onConfirm} className="flex-1 bg-red-500 text-slate-900 dark:text-white py-2.5 rounded-xl font-bold hover:bg-red-400">{t('delete')}</button>
        </div>
      </div>
    </div>
  );
}
