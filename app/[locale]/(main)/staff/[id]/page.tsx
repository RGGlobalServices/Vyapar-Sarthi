'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Phone, MapPin, CreditCard, HeartPulse, Camera, Save, Trash2, IndianRupee, Calculator, ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const isNew = resolvedParams.id === 'new';
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    mobile: '',
    address: '',
    idProof: '',
    emergencyContact: '',
    salaryType: 'monthly',
    salaryAmount: '',
    photoUrl: ''
  });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Salary calc state
  const [calcMonth, setCalcMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calcData, setCalcData] = useState({ baseAmount: 0, deductions: 0, bonus: { Performance: 0, Diwali: 0 }, netAmount: 0 });
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!isNew) {
      loadStaff();
      loadSalaryHistory();
    }
  }, [isNew, resolvedParams.id]);

  async function loadStaff() {
    try {
      const res = await api.get(`/staff/${resolvedParams.id}`);
      setForm({
        name: res.data.name,
        mobile: res.data.mobile,
        address: res.data.address || '',
        idProof: res.data.idProof || '',
        emergencyContact: res.data.emergencyContact || '',
        salaryType: res.data.salaryType,
        salaryAmount: res.data.salaryAmount.toString(),
        photoUrl: res.data.photoUrl || ''
      });
      // Set base amount for calculator
      setCalcData(prev => ({ ...prev, baseAmount: res.data.salaryAmount, netAmount: res.data.salaryAmount }));
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

  async function paySalary() {
    try {
      await api.post(`/staff/${resolvedParams.id}/salary`, {
        monthYear: calcMonth,
        baseAmount: calcData.baseAmount,
        deductions: calcData.deductions,
        bonus: calcData.bonus,
        netAmount: calcData.netAmount
      });
      alert('Salary marked as paid!');
      loadSalaryHistory();
    } catch (e) {
      alert('Failed to pay salary');
    }
  }

  // Auto calc net amount when base/deduction/bonus changes
  useEffect(() => {
    const totalBonus = Object.values(calcData.bonus).reduce((a, b) => a + (Number(b) || 0), 0);
    const net = Number(calcData.baseAmount) - Number(calcData.deductions) + totalBonus;
    setCalcData(prev => ({ ...prev, netAmount: net > 0 ? net : 0 }));
  }, [calcData.baseAmount, calcData.deductions, calcData.bonus]);

  const updateBonus = (key: string, value: number) => {
    setCalcData(prev => ({ ...prev, bonus: { ...prev.bonus, [key]: value } }));
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link href="/staff" className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-indigo-500 transition-colors w-max">
        <ChevronLeft size={16} /> Back to Staff
      </Link>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Profile Card */}
        <div className="md:w-1/3 flex flex-col gap-6">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col items-center p-6">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-4 border-white dark:border-slate-900 shadow-xl">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-slate-400" />
                )}
              </div>
              <button className="absolute bottom-0 right-0 p-2.5 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600 transition-transform hover:scale-110" onClick={() => {
                const url = prompt("Enter photo URL (In a real app, this would be an image upload dialog)");
                if (url !== null) setForm({ ...form, photoUrl: url });
              }}>
                <Camera size={16} />
              </button>
            </div>
            
            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-4 text-center">{form.name || 'New Staff'}</h2>
            <p className="text-sm font-bold text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-full mt-2 uppercase tracking-wider">{form.salaryType} • ₹{form.salaryAmount}</p>
          </Card>
        </div>

        {/* Details Form */}
        <div className="md:w-2/3 flex flex-col gap-6">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Personal Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><User size={14} /> Full Name</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder="e.g. Rahul Kumar" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Phone size={14} /> Mobile Number</label>
                <input type="text" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder="10-digit mobile" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><MapPin size={14} /> Address</label>
                <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder="Full address" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><CreditCard size={14} /> ID Proof (Govt ID)</label>
                <input type="text" value={form.idProof} onChange={e => setForm({...form, idProof: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder="Aadhar / PAN" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><HeartPulse size={14} /> Emergency Contact</label>
                <input type="text" value={form.emergencyContact} onChange={e => setForm({...form, emergencyContact: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold" placeholder="Name & Mobile" />
              </div>
            </div>

            <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />

            <h3 className="font-bold text-slate-900 dark:text-white mb-4">Salary & Compensation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5">Payment Frequency</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button onClick={() => setForm({...form, salaryType: 'monthly'})} className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-colors", form.salaryType === 'monthly' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500")}>Monthly</button>
                  <button onClick={() => setForm({...form, salaryType: 'daily'})} className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-colors", form.salaryType === 'daily' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500")}>Daily</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><IndianRupee size={14} /> Base Amount (₹)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={form.salaryAmount} onChange={e => setForm({...form, salaryAmount: e.target.value})} className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white" />
                  {/* Dynamic Inc/Dec */}
                  <button onClick={() => setForm(f => ({...f, salaryAmount: String(Number(f.salaryAmount || 0) - 500)}))} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 font-bold hover:bg-slate-200">-</button>
                  <button onClick={() => setForm(f => ({...f, salaryAmount: String(Number(f.salaryAmount || 0) + 500)}))} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 font-bold hover:bg-slate-200">+</button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center">
              {!isNew ? (
                <button onClick={handleDelete} disabled={deleting} className="text-sm font-bold text-red-500 flex items-center gap-2 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
                  <Trash2 size={16} /> {deleting ? 'Removing...' : 'Remove Staff'}
                </button>
              ) : <div/>}
              <button onClick={handleSave} disabled={saving} className="bg-indigo-500 text-white font-black px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50">
                <Save size={18} /> {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </Card>

          {/* Salary Calculator (Only if existing) */}
          {!isNew && (
            <Card className="bg-gradient-to-br from-slate-900 to-indigo-950 dark:from-slate-900 dark:to-slate-950 border-none rounded-2xl p-1 shadow-xl">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2 text-lg">
                    <Calculator className="text-indigo-500" /> Salary Payout
                  </h3>
                  <input type="month" value={calcMonth} onChange={e => setCalcMonth(e.target.value)} className="text-sm font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 outline-none text-slate-700 dark:text-slate-300" />
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Base Salary</span>
                    <span className="font-black text-slate-900 dark:text-white">₹{calcData.baseAmount}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-500/5 rounded-lg border border-red-100 dark:border-red-500/10">
                    <span className="text-sm font-bold text-red-600 dark:text-red-400">Deductions (Absents, Half Days)</span>
                    <input type="number" value={calcData.deductions} onChange={e => setCalcData({...calcData, deductions: Number(e.target.value)})} className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded text-right font-bold text-red-600 dark:text-red-400" />
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-500/5 rounded-lg border border-emerald-100 dark:border-emerald-500/10">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block mb-2">Bonuses</span>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-emerald-600/70 uppercase">Performance</label>
                        <input type="number" value={calcData.bonus.Performance} onChange={e => updateBonus('Performance', Number(e.target.value))} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded font-bold text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-emerald-600/70 uppercase">Diwali / Festival</label>
                        <input type="number" value={calcData.bonus.Diwali} onChange={e => updateBonus('Diwali', Number(e.target.value))} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded font-bold text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-lg font-black text-slate-900 dark:text-white">Net Payable</span>
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">₹{calcData.netAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <button onClick={paySalary} className="w-full py-3 mt-4 bg-slate-900 dark:bg-indigo-500 text-white font-black rounded-xl hover:bg-slate-800 dark:hover:bg-indigo-600 transition-colors">Mark as Paid</button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
