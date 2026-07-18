'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { User, Phone, MapPin, CreditCard, HeartPulse, Save, Trash2, IndianRupee, Calculator, ChevronLeft, Briefcase, Calendar, Check, Eye, Download, Share2, Wallet, X, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import { exportSalarySlipPDF } from '@/lib/pdf/salarySlip';
import { shareFileOrText } from '@/lib/shareUtils';

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const isNew = resolvedParams.id === 'new';
  const router = useRouter();
  const t = useTranslations('Staff');

  const [activeTab, setActiveTab] = useState<'profile' | 'attendance' | 'salary'>('profile');
  
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    address: '',
    idProof: '',
    emergencyContact: '',
    role: 'Other',
    joiningDate: new Date().toISOString().split('T')[0],
    salaryType: 'monthly',
    salaryAmount: '',
    photoUrl: '',
    bankAccount: { accNo: '', ifsc: '', upi: '' },
    documents: {} as Record<string, string>
  });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);

  // Salary calc state
  const [calcMonth, setCalcMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calcData, setCalcData] = useState({ baseAmount: 0, deductions: 0, bonus: { Performance: 0, Diwali: 0 }, netAmount: 0, paymentMode: 'Cash' });
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);

  // Advance Salary state
  const [advanceHistory, setAdvanceHistory] = useState<any[]>([]);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  
  // Slip Modal state
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [slipDuration, setSlipDuration] = useState(1);
  const [generatingSlip, setGeneratingSlip] = useState(false);

  // Attendance state
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0, 7));
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [markingAtt, setMarkingAtt] = useState(false);

  const pendingAdvances = advanceHistory.filter(a => !a.deducted);
  const pendingAdvanceTotal = pendingAdvances.reduce((sum, a) => sum + Number(a.amount), 0);

  useEffect(() => {
    if (!isNew) {
      loadStaff();
      if (activeTab === 'salary') {
        loadSalaryHistory();
        loadAdvanceHistory();
      }
      if (activeTab === 'attendance') loadAttendance();
    }
  }, [isNew, resolvedParams.id, activeTab]);

  useEffect(() => {
    if (activeTab === 'attendance' || (activeTab === 'salary' && form.salaryType === 'daily')) {
      loadAttendance(calcMonth);
    }
  }, [attendanceMonth, calcMonth]);

  // Recalculate salary base when attendance or calcMonth changes for daily wage
  useEffect(() => {
    if (form.salaryType === 'daily') {
      let days = 0;
      attendanceRecords.forEach(r => {
        if (r.status === 'Present') days += 1;
        if (r.status === 'Half Day') days += 0.5;
      });
      const base = days * Number(form.salaryAmount || 0);
      setCalcData(prev => ({ ...prev, baseAmount: base }));
    }
  }, [attendanceRecords, form.salaryType, form.salaryAmount]);

  async function loadStaff() {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}`);
      setForm({
        name: res.data.name || '',
        mobile: res.data.mobile || '',
        address: res.data.address || '',
        idProof: res.data.idProof || '',
        emergencyContact: res.data.emergencyContact || '',
        role: res.data.role || 'Other',
        joiningDate: res.data.joiningDate ? new Date(res.data.joiningDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        salaryType: res.data.salaryType || 'monthly',
        salaryAmount: res.data.salaryAmount?.toString() || '',
        photoUrl: res.data.photoUrl || '',
        bankAccount: res.data.bankAccount || { accNo: '', ifsc: '', upi: '' },
        documents: res.data.documents || {}
      });
      if (res.data.salaryType === 'monthly') {
        setCalcData(prev => ({ ...prev, baseAmount: res.data.salaryAmount }));
      }
    } catch (e) {
      console.error(e);
      alert('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }

  async function loadSalaryHistory() {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}/salary?month=all`);
      setSalaryHistory(res.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadAdvanceHistory() {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}/advance`);
      setAdvanceHistory(res.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadAttendance(month = attendanceMonth) {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}/attendance?monthYear=${month}`);
      setAttendanceRecords(res.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSave() {
    if (!form.name || !form.mobile || !form.salaryAmount) {
      return alert('Name, mobile, and salary amount are required');
    }
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post('/staff', form);
        router.replace(`/staff/${res.data.id}`);
      } else {
        await api.patch(`/staff/${resolvedParams.id}`, form);
        alert('Saved successfully');
      }
    } catch (e) {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to remove this staff member? This will also delete their attendance history.')) return;
    setDeleting(true);
    try {
      await api.delete(`/staff/${resolvedParams.id}`);
      router.push('/staff');
    } catch (e) {
      alert('Failed to delete');
      setDeleting(false);
    }
  }

  async function handleDeleteDocument(key: string) {
    if (!confirm(`Remove ${key.replace(/([A-Z])/g, ' $1').trim()}?`)) return;
    const documents = { ...form.documents };
    delete documents[key];
    try {
      await api.patch(`/staff/${resolvedParams.id}`, { documents });
      setForm(prev => ({ ...prev, documents }));
    } catch (e) {
      alert('Failed to delete document');
    }
  }

  async function paySalary() {
    try {
      await api.post(`/staff/${resolvedParams.id}/salary`, {
        monthYear: calcMonth,
        baseAmount: calcData.baseAmount,
        deductions: calcData.deductions + pendingAdvanceTotal, // deduct advances automatically
        bonus: calcData.bonus,
        netAmount: calcData.netAmount,
        paymentMode: calcData.paymentMode,
        advanceIds: pendingAdvances.map(a => a.id)
      });
      alert('Salary marked as paid!');
      loadSalaryHistory();
      loadAdvanceHistory();
    } catch (e) {
      alert('Failed to pay salary');
    }
  }

  async function giveAdvance() {
    if (!advanceAmount || isNaN(Number(advanceAmount))) return;
    try {
      await api.post(`/staff/${resolvedParams.id}/advance`, {
        amount: Number(advanceAmount)
      });
      setShowAdvanceModal(false);
      setAdvanceAmount('');
      loadAdvanceHistory();
    } catch (e) {
      alert('Failed to give advance');
    }
  }

  async function markAttendance(status: string) {
    setMarkingAtt(true);
    try {
      await api.post(`/staff/${resolvedParams.id}/attendance`, {
        date: new Date().toISOString().split('T')[0],
        status
      });
      loadAttendance();
    } catch (e) {
      alert('Failed to mark attendance');
    } finally {
      setMarkingAtt(false);
    }
  }

  async function handleGenerateSlip(action: 'download' | 'share') {
    setGeneratingSlip(true);
    try {
      const recordsToInclude = salaryHistory.slice(0, slipDuration);
      if (recordsToInclude.length === 0) {
        alert(t('noSalaryHistory'));
        return;
      }
      
      const shopInfo = { name: 'Vyapar Sarthi Store' }; // Can be fetched from user context if available
      const staffInfo = { name: form.name, role: form.role, joiningDate: form.joiningDate, salaryType: form.salaryType };
      
      const pdfFile = await exportSalarySlipPDF({
        shopInfo,
        staffInfo,
        salaryRecords: recordsToInclude,
        dateRangeString: t(`duration${slipDuration}Month${slipDuration > 1 ? 's' : ''}`) || `Last ${slipDuration} Months`
      });

      if (action === 'download') {
        const url = URL.createObjectURL(pdfFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const shared = await shareFileOrText(pdfFile, `Salary slip for ${form.name}`, `Salary slip for ${form.name}`);
        if (!shared) {
          // Native share unsupported, fallback to whatsapp link
          const url = URL.createObjectURL(pdfFile);
          alert('Could not open native share. File has been generated.');
          window.open(url, '_blank');
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to generate slip');
    } finally {
      setGeneratingSlip(false);
      setShowSlipModal(false);
    }
  }

  // Auto calc net amount when base/deduction/bonus changes
  useEffect(() => {
    const totalBonus = Object.values(calcData.bonus).reduce((a, b) => a + (Number(b) || 0), 0);
    const totalDeds = Number(calcData.deductions) + pendingAdvanceTotal;
    const net = Number(calcData.baseAmount) - totalDeds + totalBonus;
    setCalcData(prev => ({ ...prev, netAmount: net > 0 ? net : 0 }));
  }, [calcData.baseAmount, calcData.deductions, calcData.bonus, pendingAdvanceTotal]);

  const updateBonus = (key: string, value: number) => {
    setCalcData(prev => ({ ...prev, bonus: { ...prev.bonus, [key]: value } }));
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff" className="w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-500 transition-colors shadow-sm">
          <ChevronLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{form.name}</h1>
          <p className="text-sm font-medium text-slate-500">{form.role} • {form.mobile}</p>
        </div>
      </div>

      {!isNew && (
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
          {['profile', 'attendance', 'salary'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors capitalize whitespace-nowrap px-4", activeTab === tab ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700")}>
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* --- PROFILE TAB --- */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 md:p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Personal Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><User size={14} /> Full Name</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Phone size={14} /> Mobile Number</label>
                <input type="text" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><MapPin size={14} /> Address</label>
                <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Briefcase size={14} /> Role</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold">
                  {['Salesman', 'Helper', 'Cashier', 'Warehouse Staff', 'Delivery Boy', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Calendar size={14} /> Joining Date</label>
                <input type="date" value={form.joiningDate} onChange={e => setForm({...form, joiningDate: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Wallet size={14} /> {t('salaryType', { fallback: 'Salary Type' })}</label>
                <select value={form.salaryType} onChange={e => setForm({...form, salaryType: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold">
                  <option value="monthly">{t('monthly', { fallback: 'Monthly' })}</option>
                  <option value="daily">{t('daily', { fallback: 'Daily' })}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><IndianRupee size={14} /> {t('baseSalary', { fallback: 'Base Salary' })}</label>
                <input type="number" value={form.salaryAmount} onChange={e => setForm({...form, salaryAmount: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder={form.salaryType === 'daily' ? 'Per Day (e.g. 300)' : 'Per Month'} />
              </div>
            </div>
            
            <div className="mt-8 flex justify-between items-center">
              {!isNew ? (
                <button onClick={handleDelete} disabled={deleting} className="text-sm font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-2">
                  <Trash2 size={16} /> Remove
                </button>
              ) : <div/>}
              <button onClick={handleSave} disabled={saving} className="bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-indigo-700 flex items-center gap-2">
                <Save size={18} /> {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </Card>
          
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 md:p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Uploaded Documents</h3>
            <div className="space-y-2">
              {Object.keys(form.documents).length === 0 ? (
                <p className="text-sm text-slate-500 italic">No documents uploaded.</p>
              ) : (
                Object.entries(form.documents).map(([key, url]) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-bold capitalize text-slate-700 dark:text-slate-300">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setViewingDoc({ url, label: key.replace(/([A-Z])/g, ' $1').trim() })}
                        className="text-indigo-600 flex items-center gap-1 text-xs font-bold hover:underline"
                      >
                        View <Eye size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(key)}
                        title="Remove document"
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg p-1.5 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* --- ATTENDANCE TAB --- */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 border-b border-emerald-100 dark:border-emerald-500/20 text-center">
              <h2 className="font-bold text-emerald-900 dark:text-emerald-100">Quick Mark Today</h2>
              <p className="text-xs text-emerald-600/70">{new Date().toLocaleDateString('en-GB')}</p>
            </div>
            <CardContent className="p-4 flex gap-2">
              {['Present', 'Half Day', 'Absent', 'Leave'].map(status => (
                <button 
                  key={status} 
                  disabled={markingAtt}
                  onClick={() => markAttendance(status)} 
                  className={cn("flex-1 py-3 text-sm font-bold rounded-xl transition-colors", 
                    status === 'Present' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                    status === 'Absent' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                    'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  )}
                >
                  {status}
                </button>
              ))}
            </CardContent>
          </Card>
          
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white">Attendance History</h3>
              <input type="month" value={attendanceMonth} onChange={e => setAttendanceMonth(e.target.value)} className="text-sm font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 outline-none text-slate-700" />
            </div>
            
            <div className="space-y-2">
              {attendanceRecords.map(record => (
                <div key={record.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-sm font-bold text-slate-600">{new Date(record.date).toLocaleDateString('en-GB')}</span>
                  <span className={cn("text-xs font-bold px-2 py-1 rounded", 
                    record.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                    record.status === 'Absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  )}>{record.status}</span>
                </div>
              ))}
              {attendanceRecords.length === 0 && <p className="text-center text-slate-500 py-4 text-sm">No records found for this month.</p>}
            </div>
          </Card>
        </div>
      )}

      {/* --- SALARY TAB --- */}
      {activeTab === 'salary' && (
        <div className="space-y-6">
          <Card className="border-none rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 text-white space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black flex items-center gap-2 text-lg">
                  <Calculator className="text-indigo-400" /> Pay Salary
                </h3>
                <input type="month" value={calcMonth} onChange={e => setCalcMonth(e.target.value)} className="text-sm font-bold bg-white/10 border-none rounded-lg px-2 py-1 outline-none text-white" />
              </div>
              
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <span className="text-sm font-bold text-indigo-200">{t('baseSalary', { fallback: 'Base Salary' })} {form.salaryType === 'daily' && '(Daily calc)'}</span>
                <span className="font-black">₹{calcData.baseAmount}</span>
              </div>
              
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-red-500/30">
                <span className="text-sm font-bold text-red-300">{t('deductions', { fallback: 'Deductions' })}</span>
                <input type="number" value={calcData.deductions} onChange={e => setCalcData({...calcData, deductions: Number(e.target.value)})} className="w-24 px-2 py-1 bg-black/20 rounded text-right font-bold text-red-300 outline-none" />
              </div>
              
              {pendingAdvanceTotal > 0 && (
                 <div className="flex justify-between items-center p-3 bg-red-950/40 rounded-lg border border-red-500/50">
                   <span className="text-sm font-bold text-red-200">{t('deductAdvance', { fallback: 'Deduct Advance' })} (Auto)</span>
                   <span className="font-black text-red-400">-₹{pendingAdvanceTotal}</span>
                 </div>
              )}
              
              <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <span className="text-lg font-black">{t('netSalary', { fallback: 'Net Payable' })}</span>
                <span className="text-3xl font-black text-emerald-400">₹{calcData.netAmount.toLocaleString('en-IN')}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                <select value={calcData.paymentMode} onChange={e => setCalcData({...calcData, paymentMode: e.target.value})} className="px-3 py-3 bg-white/10 border border-white/20 rounded-xl font-bold outline-none text-white text-sm">
                  <option value="Cash" className="text-black">Cash</option>
                  <option value="UPI" className="text-black">UPI</option>
                  <option value="Bank Transfer" className="text-black">Bank Transfer</option>
                </select>
                <button onClick={paySalary} className="bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-600 transition-colors">Mark as Paid</button>
              </div>
            </div>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wallet size={16} className="text-amber-500" /> {t('advanceSalary', { fallback: 'Advance Salary' })}
                </h3>
                <button onClick={() => setShowAdvanceModal(true)} className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200">
                  + {t('addAdvance', { fallback: 'Give Advance' })}
                </button>
              </div>
              <div className="space-y-2">
                {advanceHistory.map(adv => (
                  <div key={adv.id} className="flex justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">₹{adv.amount}</p>
                      <p className="text-[10px] font-bold text-slate-500">{new Date(adv.date).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div className="text-right">
                      {adv.deducted ? (
                        <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">Settled</span>
                      ) : (
                        <span className="text-xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded">Pending</span>
                      )}
                    </div>
                  </div>
                ))}
                {advanceHistory.length === 0 && <p className="text-center text-slate-500 py-4 text-sm">No advances given.</p>}
              </div>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Payment History</h3>
                <button onClick={() => setShowSlipModal(true)} className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 flex items-center gap-1">
                  <Download size={14} /> {t('salarySlip', { fallback: 'Salary Slip' })}
                </button>
              </div>
              <div className="space-y-2">
                {salaryHistory.map(pay => (
                  <div key={pay.id} className="flex justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{pay.monthYear}</p>
                      <p className="text-[10px] font-bold text-slate-500">{new Date(pay.paidAt).toLocaleDateString('en-GB')} • {pay.paymentMode}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-emerald-600 dark:text-emerald-400">₹{pay.netAmount}</p>
                      {pay.deductions > 0 && <p className="text-[10px] text-red-500 font-bold">-₹{pay.deductions}</p>}
                    </div>
                  </div>
                ))}
                {salaryHistory.length === 0 && <p className="text-center text-slate-500 py-4 text-sm">{t('noSalaryHistory', { fallback: 'No payment history.' })}</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('addAdvance', { fallback: 'Give Advance' })}</h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Amount (₹)</label>
                <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} className="w-full px-3 py-2 border dark:border-slate-700 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-semibold" placeholder="e.g. 500" />
              </div>
              <p className="text-xs text-slate-500 font-semibold">This amount will be automatically deducted from the next salary payment.</p>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setShowAdvanceModal(false)} className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={giveAdvance} disabled={!advanceAmount} className="px-4 py-2 font-bold bg-amber-500 text-white hover:bg-amber-600 rounded-lg disabled:opacity-50 transition-colors">Give Advance</button>
            </div>
          </div>
        </div>
      )}

      {showSlipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('downloadSalarySlip', { fallback: 'Download Salary Slip' })}</h2>
              <button onClick={() => setShowSlipModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Select Duration</label>
                <select value={slipDuration} onChange={e => setSlipDuration(Number(e.target.value))} className="w-full px-3 py-2 border dark:border-slate-700 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-semibold">
                  <option value={1}>{t('duration1Month', { fallback: 'Last 1 Month' })}</option>
                  <option value={3}>{t('duration3Months', { fallback: 'Last 3 Months' })}</option>
                  <option value={6}>{t('duration6Months', { fallback: 'Last 6 Months' })}</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => handleGenerateSlip('download')} disabled={generatingSlip} className="flex-1 px-4 py-2.5 font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl flex items-center justify-center gap-2 transition-colors">
                {generatingSlip ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Download PDF
              </button>
              <button onClick={() => handleGenerateSlip('share')} disabled={generatingSlip} className="flex-1 px-4 py-2.5 font-bold bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">
                {generatingSlip ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                {t('shareViaWhatsApp', { fallback: 'Share' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingDoc && (
        <DocumentViewerModal url={viewingDoc.url} label={viewingDoc.label} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}
