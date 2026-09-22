'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { User, Phone, MapPin, CreditCard, HeartPulse, Save, Trash2, IndianRupee, Calculator, ChevronLeft, Briefcase, Calendar, Check, Eye, Download, Share2, Wallet, X, Loader2, Pencil } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import DocumentUpload from '@/components/staff/DocumentUpload';
import { exportSalarySlipPDF } from '@/lib/pdf/salarySlip';
import { shareFileOrText } from '@/lib/shareUtils';
import { summarizeAttendance, daysInMonthUTC } from '@/lib/attendance';
import { ExportButton } from '@/lib/hooks/useExport';
import { useBusinessStore } from '@/lib/businessStore';

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const isNew = resolvedParams.id === 'new';
  const router = useRouter();
  const t = useTranslations('Staff');
  const profile = useBusinessStore(s => s.profile);

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
    documents: {} as Record<string, string>,
    status: 'active',
    employeeCode: '',
    department: '',
    employeeType: 'full_time',
    email: '',
    alternateMobile: '',
    dateOfBirth: '',
    gender: '',
    shift: '',
    pan: '',
    aadhaarLast4: '',
    uan: '',
    pfApplicable: false,
    esiApplicable: false,
    ptApplicable: false,
    tdsApplicable: false,
  });
  const [salaryChangeReason, setSalaryChangeReason] = useState('');
  const [originalSalaryAmount, setOriginalSalaryAmount] = useState<string | null>(null);
  const [showCompliance, setShowCompliance] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [salaryRevisions, setSalaryRevisions] = useState<any[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);

  // Salary calc state
  const [calcMonth, setCalcMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calcData, setCalcData] = useState({ baseAmount: 0, deductions: 0, bonus: { Performance: 0, Diwali: 0 }, netAmount: 0, paymentMode: 'Cash' });
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);
  const [payingSalary, setPayingSalary] = useState(false);
  const [deletingSalaryId, setDeletingSalaryId] = useState<string | null>(null);

  // Advance Salary state
  const [advanceHistory, setAdvanceHistory] = useState<any[]>([]);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingAdvanceId, setEditingAdvanceId] = useState<string | null>(null);
  const [savingAdvance, setSavingAdvance] = useState(false);

  // Slip Modal state
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [slipDuration, setSlipDuration] = useState(1);
  const [generatingSlip, setGeneratingSlip] = useState(false);

  // Attendance state — the Attendance tab's browsable history and the
  // Salary tab's pay-driving month are tracked separately (each keyed to
  // its own month picker) so switching tabs or months in one never clobbers
  // the other's data.
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0, 7));
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [calcAttendanceRecords, setCalcAttendanceRecords] = useState<any[]>([]);
  const [markingAtt, setMarkingAtt] = useState(false);
  // Defaults to today but editable, so a previous day's mark can be
  // corrected right from this profile instead of only via the separate
  // bulk Attendance page.
  const [markDate, setMarkDate] = useState(new Date().toISOString().split('T')[0]);
  // Monthly staff default to a flat salary regardless of attendance (many
  // shops intentionally pay a fixed amount) — this opts a specific month's
  // payout into being prorated by present/half-day count instead.
  const [payByAttendance, setPayByAttendance] = useState(false);

  const pendingAdvances = advanceHistory.filter(a => !a.deducted);
  const pendingAdvanceTotal = pendingAdvances.reduce((sum, a) => sum + Number(a.amount), 0);

  // salaryHistory is loaded sorted by paidAt desc (see the GET route), so
  // [0] is genuinely the most recent payment made, for any month.
  const lastPayment = salaryHistory[0] || null;
  // Whether the CURRENTLY SELECTED month picker already has a payment on
  // record — drives the "already paid" state below so the same month can't
  // be paid twice from the UI (the API also rejects it server-side as a
  // second line of defence, see POST /staff/:id/salary).
  const alreadyPaidForCalcMonth = salaryHistory.find(p => p.monthYear === calcMonth) || null;

  function nextMonthOf(monthYear: string): string {
    const [y, m] = monthYear.split('-').map(Number);
    // `m` from the "YYYY-MM" string is 1-indexed (09 = September), but
    // Date.UTC's month param is 0-indexed — passing it through unchanged
    // lands one month ahead for free (9 as a 0-indexed month = October),
    // and December (12) overflows cleanly into next year's January.
    const d = new Date(Date.UTC(y, m, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  useEffect(() => {
    if (!isNew) loadStaff();
    loadDepartmentOptions();
  }, [isNew, resolvedParams.id]);

  useEffect(() => {
    if (isNew || activeTab !== 'salary') return;
    loadSalaryHistory();
    loadAdvanceHistory();
    loadSalaryRevisions();
  }, [isNew, resolvedParams.id, activeTab]);

  useEffect(() => {
    if (isNew || activeTab !== 'attendance') return;
    loadAttendance(attendanceMonth, setAttendanceRecords);
  }, [isNew, resolvedParams.id, activeTab, attendanceMonth]);

  useEffect(() => {
    if (isNew || activeTab !== 'salary') return;
    loadAttendance(calcMonth, setCalcAttendanceRecords);
  }, [isNew, resolvedParams.id, activeTab, calcMonth]);

  const attendanceSummary = summarizeAttendance(attendanceRecords);
  const calcAttendanceSummary = summarizeAttendance(calcAttendanceRecords);

  // Recalculate salary base from attendance: always for daily wage; for
  // monthly staff only when the shopkeeper opts into it for this payout.
  useEffect(() => {
    if (form.salaryType === 'daily') {
      const base = calcAttendanceSummary.payableDays * Number(form.salaryAmount || 0);
      setCalcData(prev => ({ ...prev, baseAmount: base }));
    } else if (form.salaryType === 'monthly' && payByAttendance) {
      const perDay = Number(form.salaryAmount || 0) / daysInMonthUTC(calcMonth);
      setCalcData(prev => ({ ...prev, baseAmount: Math.round(perDay * calcAttendanceSummary.payableDays) }));
    } else if (form.salaryType === 'monthly' && !payByAttendance) {
      setCalcData(prev => ({ ...prev, baseAmount: Number(form.salaryAmount || 0) }));
    }
  }, [calcAttendanceRecords, form.salaryType, form.salaryAmount, payByAttendance, calcMonth]);

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
        documents: res.data.documents || {},
        status: res.data.status || 'active',
        employeeCode: res.data.employeeCode || '',
        department: res.data.department || '',
        employeeType: res.data.employeeType || 'full_time',
        email: res.data.email || '',
        alternateMobile: res.data.alternateMobile || '',
        dateOfBirth: res.data.dateOfBirth ? new Date(res.data.dateOfBirth).toISOString().split('T')[0] : '',
        gender: res.data.gender || '',
        shift: res.data.shift || '',
        pan: res.data.pan || '',
        aadhaarLast4: res.data.aadhaarLast4 || '',
        uan: res.data.uan || '',
        pfApplicable: !!res.data.pfApplicable,
        esiApplicable: !!res.data.esiApplicable,
        ptApplicable: !!res.data.ptApplicable,
        tdsApplicable: !!res.data.tdsApplicable,
      });
      setOriginalSalaryAmount(res.data.salaryAmount?.toString() || '');
      if (res.data.salaryType === 'monthly') {
        setCalcData(prev => ({ ...prev, baseAmount: res.data.salaryAmount }));
      }
    } catch (e) {
      console.error(e);
      alert(t('failedToLoadStaff'));
    } finally {
      setLoading(false);
    }
  }

  async function loadSalaryRevisions() {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}/salary-revisions`);
      setSalaryRevisions(res.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadDepartmentOptions() {
    try {
      const res = await api.get('/staff');
      const depts = new Set<string>((res.data || []).map((s: any) => s.department).filter(Boolean));
      setDepartmentOptions([...depts]);
    } catch (e) { /* best-effort suggestions only */ }
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

  async function loadAttendance(month = attendanceMonth, setter: (records: any[]) => void = setAttendanceRecords) {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}/attendance?monthYear=${month}`);
      setter(res.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSave() {
    if (!form.name || !form.mobile || !form.salaryAmount) {
      return alert(t('nameRequiredFields'));
    }
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post('/staff', form);
        router.replace(`/staff/${res.data.id}`);
      } else {
        await api.patch(`/staff/${resolvedParams.id}`, { ...form, salaryChangeReason });
        setSalaryChangeReason('');
        setOriginalSalaryAmount(form.salaryAmount);
        loadSalaryRevisions();
        alert(t('savedSuccessfully'));
      }
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('failedToSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('confirmRemoveStaff'))) return;
    setDeleting(true);
    try {
      await api.delete(`/staff/${resolvedParams.id}`);
      router.push('/staff');
    } catch (e) {
      alert(t('failedToDelete'));
      setDeleting(false);
    }
  }

  async function handleDeleteDocument(key: string) {
    if (!confirm(t('confirmRemoveDoc', { docName: key.replace(/([A-Z])/g, ' $1').trim() }))) return;
    try {
      if (key === 'photoUrl') {
        await api.patch(`/staff/${resolvedParams.id}`, { photoUrl: '' });
        setForm(prev => ({ ...prev, photoUrl: '' }));
      } else {
        const documents = { ...form.documents };
        delete documents[key];
        await api.patch(`/staff/${resolvedParams.id}`, { documents });
        setForm(prev => ({ ...prev, documents }));
      }
    } catch (e) {
      alert(t('failedToDeleteDoc'));
    }
  }

  // The profile page could previously only view/delete documents added at
  // creation time on /staff/new — this is the missing "add one now" path.
  async function handleUploadDocument(docType: string, file: File) {
    setUploadingDoc(docType);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await api.post('/upload', body);
      if (res.data.url) {
        if (docType === 'photoUrl') {
          await api.patch(`/staff/${resolvedParams.id}`, { photoUrl: res.data.url });
          setForm(prev => ({ ...prev, photoUrl: res.data.url }));
        } else {
          const documents = { ...form.documents, [docType]: res.data.url };
          await api.patch(`/staff/${resolvedParams.id}`, { documents });
          setForm(prev => ({ ...prev, documents }));
        }
      }
    } catch (e) {
      alert(t('uploadFailed'));
    } finally {
      setUploadingDoc(null);
    }
  }

  async function paySalary() {
    // Defensive client-side guard (the button is already hidden once this
    // month is paid, but keeps this function safe to call from anywhere).
    if (alreadyPaidForCalcMonth || payingSalary) return;
    setPayingSalary(true);
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
      alert(t('salaryMarkedPaid'));
      // Start a fresh period right away — otherwise the same just-paid
      // month stays selected and looks payable again until the shopkeeper
      // manually picks the next month (this is what produced real duplicate
      // payroll rows before the "already paid" guard existed).
      setCalcMonth(nextMonthOf(calcMonth));
      loadSalaryHistory();
      loadAdvanceHistory();
    } catch (e: any) {
      if (e?.response?.status === 409) {
        alert(e.response.data?.detail || `Salary for ${calcMonth} is already marked as paid`);
        loadSalaryHistory(); // resync — our local state was stale
      } else {
        alert(t('failedToPaySalary'));
      }
    } finally {
      setPayingSalary(false);
    }
  }

  async function deleteSalaryPayment(pay: any) {
    if (!confirm(`Delete this ₹${pay.netAmount} payment for ${pay.monthYear}? This cannot be undone.`)) return;
    setDeletingSalaryId(pay.id);
    try {
      await api.delete(`/staff/${resolvedParams.id}/salary/${pay.id}`);
      loadSalaryHistory();
      loadAdvanceHistory(); // any advance this payment had settled goes back to pending
    } catch (e) {
      alert('Failed to delete this payment.');
    } finally {
      setDeletingSalaryId(null);
    }
  }

  function openAddAdvance() {
    setEditingAdvanceId(null);
    setAdvanceAmount('');
    setAdvanceDate(new Date().toISOString().split('T')[0]);
    setShowAdvanceModal(true);
  }

  function openEditAdvance(adv: any) {
    setEditingAdvanceId(adv.id);
    setAdvanceAmount(String(adv.amount));
    setAdvanceDate(new Date(adv.date).toISOString().split('T')[0]);
    setShowAdvanceModal(true);
  }

  async function saveAdvance() {
    if (!advanceAmount || isNaN(Number(advanceAmount)) || Number(advanceAmount) <= 0) return;
    setSavingAdvance(true);
    try {
      if (editingAdvanceId) {
        await api.patch(`/staff/${resolvedParams.id}/advance/${editingAdvanceId}`, {
          amount: Number(advanceAmount),
          date: advanceDate,
        });
      } else {
        await api.post(`/staff/${resolvedParams.id}/advance`, {
          amount: Number(advanceAmount),
          date: advanceDate,
        });
      }
      setShowAdvanceModal(false);
      setEditingAdvanceId(null);
      setAdvanceAmount('');
      loadAdvanceHistory();
    } catch (e) {
      alert(t('failedToGiveAdvance'));
    } finally {
      setSavingAdvance(false);
    }
  }

  async function deleteAdvance(adv: any) {
    if (!confirm(`Delete this ₹${adv.amount} advance from ${new Date(adv.date).toLocaleDateString('en-GB')}?`)) return;
    try {
      await api.delete(`/staff/${resolvedParams.id}/advance/${adv.id}`);
      loadAdvanceHistory();
    } catch (e) {
      alert('Failed to delete advance.');
    }
  }

  async function toggleAdvanceSettled(adv: any) {
    try {
      await api.patch(`/staff/${resolvedParams.id}/advance/${adv.id}`, { deducted: !adv.deducted });
      loadAdvanceHistory();
    } catch (e) {
      alert('Failed to update advance.');
    }
  }

  async function markAttendance(status: string) {
    setMarkingAtt(true);
    try {
      await api.post(`/staff/${resolvedParams.id}/attendance`, {
        date: markDate,
        status
      });
      // Jump the history view to whatever month was just marked, so a
      // correction to a previous month is immediately visible instead of
      // silently saving off-screen.
      const markedMonth = markDate.slice(0, 7);
      if (markedMonth !== attendanceMonth) setAttendanceMonth(markedMonth);
      else loadAttendance(attendanceMonth, setAttendanceRecords);
    } catch (e) {
      alert(t('failedToMarkAttendance'));
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
      
      // The real shop's name/address/mobile and the owner's saved e-signature
      // (from Profile) — was hardcoded to a generic "Vyapar Sarthi Store"
      // with no signature before, so every slip looked identical regardless
      // of which shop issued it.
      const shopInfo = {
        name: profile.shopName || 'Store',
        address: profile.address || undefined,
        contact: profile.mobile || undefined,
        signatureUrl: profile.signatureUrl || undefined,
      };
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
          alert(t('couldNotShareGenerated'));
          window.open(url, '_blank');
        }
      }
    } catch (e) {
      console.error(e);
      alert(t('failedToGenerateSlip'));
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
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Phone size={14} /> {t('alternateMobile')}</label>
                <input type="tel" value={form.alternateMobile} onChange={e => setForm({...form, alternateMobile: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><User size={14} /> {t('email')}</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><MapPin size={14} /> Address</label>
                <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><HeartPulse size={14} /> {t('emergencyContact')}</label>
                <input type="tel" value={form.emergencyContact} onChange={e => setForm({...form, emergencyContact: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Calendar size={14} /> {t('dateOfBirth')}</label>
                <input type="date" value={form.dateOfBirth} onChange={e => setForm({...form, dateOfBirth: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Briefcase size={14} /> Role</label>
                <input list="staff-role-options" type="text" value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
                <datalist id="staff-role-options">
                  {['Salesman', 'Helper', 'Cashier', 'Warehouse Staff', 'Delivery Boy', 'Other'].map(r => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Calendar size={14} /> Joining Date</label>
                <input type="date" value={form.joiningDate} onChange={e => setForm({...form, joiningDate: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Check size={14} /> {t('employmentStatus')}</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold">
                  <option value="active">{t('statusActive')}</option>
                  <option value="on_leave">{t('statusOnLeave')}</option>
                  <option value="suspended">{t('statusSuspended')}</option>
                  <option value="resigned">{t('statusResigned')}</option>
                  <option value="terminated">{t('statusTerminated')}</option>
                  <option value="inactive">{t('statusInactive')}</option>
                </select>
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
              {originalSalaryAmount !== null && form.salaryAmount !== originalSalaryAmount && (
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">{t('salaryChangeReason')}</label>
                  <input type="text" value={salaryChangeReason} onChange={e => setSalaryChangeReason(e.target.value)} className="w-full px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm font-semibold" placeholder={t('salaryChangeReason')} />
                </div>
              )}
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

            {salaryRevisions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('salaryHistory')}</p>
                <div className="space-y-1.5">
                  {salaryRevisions.map(rev => (
                    <div key={rev.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 px-1">
                      <span>
                        {new Date(rev.effectiveFrom).toLocaleDateString('en-GB')} —{' '}
                        {rev.oldAmount != null ? `₹${rev.oldAmount.toLocaleString('en-IN')} ${t('to')} ` : ''}
                        <span className="font-bold text-slate-800 dark:text-slate-200">₹{rev.newAmount.toLocaleString('en-IN')}</span>
                        {rev.reason && <span className="italic"> — {rev.reason}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 md:p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">{t('employmentDetails')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">{t('employeeCode')}</label>
                <input type="text" value={form.employeeCode} onChange={e => setForm({...form, employeeCode: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder={t('employeeCodePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">{t('department')}</label>
                <input list="staff-department-options" type="text" value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
                <datalist id="staff-department-options">
                  {departmentOptions.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">{t('employeeType')}</label>
                <select value={form.employeeType} onChange={e => setForm({...form, employeeType: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold">
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="temporary">Temporary</option>
                  <option value="contract">Contract</option>
                  <option value="daily_wage">Daily Wage</option>
                  <option value="apprentice">Apprentice</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">{t('shift')}</label>
                <input type="text" value={form.shift} onChange={e => setForm({...form, shift: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder={t('shiftPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">{t('gender')}</label>
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold">
                  <option value="">{t('optionalPlaceholder')}</option>
                  <option value="male">{t('genderMale')}</option>
                  <option value="female">{t('genderFemale')}</option>
                  <option value="other">{t('genderOther')}</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Compliance — collapsed by default, never required */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCompliance(v => !v)}
              className="w-full p-4 md:p-6 flex items-center justify-between gap-3 text-left"
            >
              <h3 className="font-bold text-slate-900 dark:text-white">{t('complianceOptional')}</h3>
              <span className="text-xs font-bold text-indigo-500">{showCompliance ? t('hide') : t('show')}</span>
            </button>
            {showCompliance && (
              <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">{t('pan')}</label>
                    <input type="text" value={form.pan} onChange={e => setForm({...form, pan: e.target.value.toUpperCase()})} maxLength={10} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">{t('aadhaarLast4')}</label>
                    <input type="text" value={form.aadhaarLast4} onChange={e => setForm({...form, aadhaarLast4: e.target.value.replace(/\D/g, '').slice(0, 4)})} maxLength={4} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder="XXXX" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">{t('uan')}</label>
                    <input type="text" value={form.uan} onChange={e => setForm({...form, uan: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([['pfApplicable', 'pfLabel'], ['esiApplicable', 'esiLabel'], ['ptApplicable', 'ptLabel'], ['tdsApplicable', 'tdsLabel']] as const).map(([key, labelKey]) => (
                    <label key={key} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={form[key]} onChange={e => setForm({...form, [key]: e.target.checked})} className="w-4 h-4 accent-indigo-500" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t(labelKey)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 md:p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Uploaded Documents</h3>
            <div className="space-y-2">
              {[
                ['photoUrl', t('passportPhoto')],
                ['aadhaarFront', t('aadhaarFront')],
                ['aadhaarBack', t('aadhaarBack')],
                ['panCard', t('panCard')],
                ['addressProof', t('addressProof')],
              ].map(([docType, label]) => (
                <DocumentUpload
                  key={docType}
                  label={label}
                  fileUrl={docType === 'photoUrl' ? form.photoUrl : form.documents[docType]}
                  isUploading={uploadingDoc === docType}
                  onUpload={(file) => handleUploadDocument(docType, file)}
                  onRemove={() => handleDeleteDocument(docType)}
                  onView={() => setViewingDoc({ url: docType === 'photoUrl' ? form.photoUrl : form.documents[docType], label })}
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* --- ATTENDANCE TAB --- */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 border-b border-emerald-100 dark:border-emerald-500/20">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold text-emerald-900 dark:text-emerald-100">Mark Attendance</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={markDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setMarkDate(e.target.value)}
                    className="text-sm font-bold bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-2 py-1 outline-none text-emerald-900 dark:text-emerald-100"
                  />
                  {markDate !== new Date().toISOString().split('T')[0] && (
                    <button
                      onClick={() => setMarkDate(new Date().toISOString().split('T')[0])}
                      className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      Today
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-emerald-600/70 mt-1">
                {markDate === new Date().toISOString().split('T')[0] ? 'Today' : 'Correcting a previous day — pick any past date above'}
              </p>
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

            {/* Month-end day counts — the numbers payroll is actually based
                on, so a shopkeeper can total up a month at a glance instead
                of counting badges by eye. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <AttendanceStat label="Full Days" value={attendanceSummary.present} tone="emerald" />
              <AttendanceStat label="Half Days" value={attendanceSummary.halfDay} tone="amber" />
              <AttendanceStat label="Absent" value={attendanceSummary.absent} tone="red" />
              <AttendanceStat label="Leave" value={attendanceSummary.leave} tone="sky" />
            </div>

            {attendanceRecords.length > 0 && (
              <div className="mb-4">
                <ExportButton
                  filename={`${form.name || 'staff'}_attendance_${attendanceMonth}`}
                  title={`Attendance — ${form.name}`}
                  summary={[
                    { label: 'Full Days', value: String(attendanceSummary.present) },
                    { label: 'Half Days', value: String(attendanceSummary.halfDay) },
                    { label: 'Absent', value: String(attendanceSummary.absent) },
                    { label: 'Leave', value: String(attendanceSummary.leave) },
                  ]}
                  columns={[
                    { key: 'date', label: 'Date', type: 'date' },
                    { key: 'status', label: 'Status' },
                    { key: 'reason', label: 'Reason' },
                  ]}
                  data={attendanceRecords}
                />
              </div>
            )}

            <div className="space-y-2">
              {attendanceRecords.map(record => (
                <div key={record.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-sm font-bold text-slate-600">{new Date(record.date).toLocaleDateString('en-GB')}</span>
                  <span className={cn("text-xs font-bold px-2 py-1 rounded",
                    record.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                    record.status === 'Half Day' ? 'bg-amber-100 text-amber-700' :
                    record.status === 'Leave' ? 'bg-sky-100 text-sky-700' :
                    record.status === 'Absent' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'
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
          {/* Last payment summary — always visible regardless of which
              month is selected below, so "when/how much did I last pay
              this person" never requires scrolling through history. */}
          {lastPayment && (
            <div className="flex items-center justify-between gap-3 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl">
              <div className="flex items-center gap-2 text-sm">
                <Check size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">
                  Last paid <span className="font-black text-slate-900 dark:text-white">₹{Number(lastPayment.netAmount).toLocaleString('en-IN')}</span> on{' '}
                  <span className="font-bold">{new Date(lastPayment.paidAt).toLocaleDateString('en-GB')}</span>
                  {' '}for {lastPayment.monthYear} via <span className="font-bold">{lastPayment.paymentMode}</span>
                </span>
              </div>
            </div>
          )}

          <Card className="border-none rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 text-white space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black flex items-center gap-2 text-lg">
                  <Calculator className="text-indigo-400" /> Pay Salary
                </h3>
                <input type="month" value={calcMonth} onChange={e => setCalcMonth(e.target.value)} className="text-sm font-bold bg-white/10 border-none rounded-lg px-2 py-1 outline-none text-white" />
              </div>

              {/* Already-paid state for the selected month — replaces the
                  whole calc+pay form below it (nothing left to compute or
                  pay again) rather than just disabling the button, so it's
                  unmistakable that re-selecting this month won't do anything. */}
              {alreadyPaidForCalcMonth && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-black">
                    <Check size={18} /> Already paid for {calcMonth}
                  </div>
                  <p className="text-sm text-indigo-200">
                    ₹{Number(alreadyPaidForCalcMonth.netAmount).toLocaleString('en-IN')} paid on{' '}
                    {new Date(alreadyPaidForCalcMonth.paidAt).toLocaleDateString('en-GB')} via {alreadyPaidForCalcMonth.paymentMode}
                  </p>
                  <button
                    onClick={() => setCalcMonth(nextMonthOf(calcMonth))}
                    className="text-sm font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
                  >
                    Start {nextMonthOf(calcMonth)} →
                  </button>
                </div>
              )}

              {!alreadyPaidForCalcMonth && (
                <>
                  {/* Month-end day counts for this payout's month — the same
                      breakdown as the Attendance tab, shown here since it's what
                      the base amount below is actually computed from. */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2 bg-white/5 rounded-lg text-center">
                      <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Full</p>
                      <p className="text-base font-black text-emerald-400">{calcAttendanceSummary.present}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg text-center">
                      <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Half</p>
                      <p className="text-base font-black text-amber-400">{calcAttendanceSummary.halfDay}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg text-center">
                      <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Absent</p>
                      <p className="text-base font-black text-red-400">{calcAttendanceSummary.absent}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg text-center">
                      <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Leave</p>
                      <p className="text-base font-black text-sky-400">{calcAttendanceSummary.leave}</p>
                    </div>
                  </div>

                  {form.salaryType === 'monthly' && (
                    <label className="flex items-center justify-between gap-3 p-3 bg-white/5 rounded-lg cursor-pointer">
                      <span className="text-xs font-bold text-indigo-200">Pay as per attendance this month (per-day rate × days present) instead of flat salary</span>
                      <input type="checkbox" checked={payByAttendance} onChange={e => setPayByAttendance(e.target.checked)} className="w-4 h-4 shrink-0 accent-emerald-500" />
                    </label>
                  )}

                  <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                    <span className="text-sm font-bold text-indigo-200">
                      {t('baseSalary', { fallback: 'Base Salary' })} {form.salaryType === 'daily' && '(Daily calc)'} {form.salaryType === 'monthly' && payByAttendance && '(Attendance calc)'}
                    </span>
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
                    <button
                      onClick={paySalary}
                      disabled={payingSalary}
                      className="bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {payingSalary ? <Loader2 size={16} className="animate-spin" /> : null}
                      {payingSalary ? 'Paying…' : 'Mark as Paid'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wallet size={16} className="text-amber-500" /> {t('advanceSalary', { fallback: 'Advance Salary' })}
                </h3>
                <button onClick={openAddAdvance} className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200">
                  + {t('addAdvance', { fallback: 'Give Advance' })}
                </button>
              </div>
              <div className="space-y-2">
                {advanceHistory.map(adv => (
                  <div key={adv.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">₹{adv.amount}</p>
                      <p className="text-[10px] font-bold text-slate-500">{new Date(adv.date).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleAdvanceSettled(adv)}
                        title={adv.deducted ? 'Mark as Pending' : 'Mark as Settled'}
                        className={cn("text-xs font-bold px-2 py-1 rounded transition-colors",
                          adv.deducted
                            ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                            : "text-amber-500 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                        )}
                      >
                        {adv.deducted ? 'Settled' : 'Pending'}
                      </button>
                      <button onClick={() => openEditAdvance(adv)} title="Edit advance" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteAdvance(adv)} title="Delete advance" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
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
                  <div key={pay.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{pay.monthYear}</p>
                      <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                        {new Date(pay.paidAt).toLocaleDateString('en-GB')}
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide',
                          pay.paymentMode === 'Cash'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
                        )}>
                          {pay.paymentMode}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="font-black text-emerald-600 dark:text-emerald-400">₹{pay.netAmount}</p>
                        {pay.deductions > 0 && <p className="text-[10px] text-red-500 font-bold">-₹{pay.deductions}</p>}
                      </div>
                      <button
                        onClick={() => deleteSalaryPayment(pay)}
                        disabled={deletingSalaryId === pay.id}
                        title="Delete this payment"
                        className="p-1.5 text-slate-300 group-hover:text-slate-400 hover:!text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                      >
                        {deletingSalaryId === pay.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingAdvanceId ? 'Edit Advance' : t('addAdvance', { fallback: 'Give Advance' })}
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Amount (₹)</label>
                <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} className="w-full px-3 py-2 border dark:border-slate-700 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-semibold" placeholder={t('advanceAmountPlaceholder')} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Date</label>
                <input type="date" value={advanceDate} onChange={e => setAdvanceDate(e.target.value)} className="w-full px-3 py-2 border dark:border-slate-700 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-semibold" />
              </div>
              <p className="text-xs text-slate-500 font-semibold">This amount will be automatically deducted from the next salary payment.</p>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => { setShowAdvanceModal(false); setEditingAdvanceId(null); }} className="px-4 py-2 font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveAdvance} disabled={!advanceAmount || savingAdvance} className="px-4 py-2 font-bold bg-amber-500 text-white hover:bg-amber-600 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2">
                {savingAdvance && <Loader2 size={14} className="animate-spin" />}
                {editingAdvanceId ? 'Save Changes' : 'Give Advance'}
              </button>
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

function AttendanceStat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'red' | 'sky' | 'slate' }) {
  const color = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    sky: 'text-sky-600 dark:text-sky-400',
    slate: 'text-slate-900 dark:text-white',
  };
  return (
    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 text-center">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={cn("text-lg font-black tracking-tight", color[tone])}>{value}</p>
    </div>
  );
}
