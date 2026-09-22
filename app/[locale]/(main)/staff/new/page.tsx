'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, Check, ChevronLeft, CreditCard, Eye, FileText, Trash2, UploadCloud, User, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/routing';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import DocumentUpload from '@/components/staff/DocumentUpload';

const ROLES = ['Salesman', 'Helper', 'Cashier', 'Warehouse Staff', 'Delivery Boy', 'Other'];
const EMPLOYEE_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'contract', label: 'Contract' },
  { value: 'daily_wage', label: 'Daily Wage' },
  { value: 'apprentice', label: 'Apprentice' },
];

export default function AddStaffPage() {
  const router = useRouter();
  const t = useTranslations('Staff');
  const [loading, setLoading] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    emergencyContact: '',
    role: 'Salesman',
    joiningDate: new Date().toISOString().split('T')[0],
    salaryType: 'monthly',
    salaryAmount: '',
    bankAccount: { bankName: '', accNo: '', ifsc: '', upi: '' },
    documents: {} as Record<string, string>,
    photoUrl: '',
    // Employee Master additions
    employeeCode: '',
    department: '',
    employeeType: 'full_time',
    email: '',
    alternateMobile: '',
    dateOfBirth: '',
    gender: '',
    shift: '',
    // Compliance — optional, collapsed by default
    pan: '',
    aadhaarLast4: '',
    uan: '',
    pfApplicable: false,
    esiApplicable: false,
    ptApplicable: false,
    tdsApplicable: false,
  });

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  // Department is free-text (same pattern as role, and as Category/Brand
  // elsewhere in the app) — suggest whatever's already in use in this shop
  // rather than forcing a fixed list.
  useEffect(() => {
    api.get('/staff').then(res => {
      const depts = new Set<string>((res.data || []).map((s: any) => s.department).filter(Boolean));
      setDepartmentOptions([...depts]);
    }).catch(() => {});
  }, []);

  const handleFileUpload = async (file: File, docType: string) => {
    setUploadingDoc(docType);

    const body = new FormData();
    body.append('file', file);
    
    try {
      const res = await api.post('/upload', body);
      if (res.data.url) {
        if (docType === 'photoUrl') {
          setFormData(p => ({ ...p, photoUrl: res.data.url }));
        } else {
          setFormData(p => ({
            ...p,
            documents: { ...p.documents, [docType]: res.data.url }
          }));
        }
      }
    } catch (err) {
      console.error(err);
      alert(t('uploadFailed'));
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleRemoveDoc = (docType: string) => {
    if (!confirm(t('confirmRemoveDocument'))) return;
    if (docType === 'photoUrl') {
      setFormData(p => ({ ...p, photoUrl: '' }));
    } else {
      setFormData(p => {
        const documents = { ...p.documents };
        delete documents[docType];
        return { ...p, documents };
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await api.post('/staff', formData);
      router.push('/staff');
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderDocUpload = (label: string, docType: string) => {
    const fileUrl = docType === 'photoUrl' ? formData.photoUrl : formData.documents[docType];
    return (
      <DocumentUpload
        key={docType}
        label={label}
        fileUrl={fileUrl}
        isUploading={uploadingDoc === docType}
        onUpload={(file) => handleFileUpload(file, docType)}
        onRemove={() => handleRemoveDoc(docType)}
        onView={() => setViewingDoc({ url: fileUrl, label })}
      />
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff" className="w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-500 transition-colors shadow-sm">
          <ChevronLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{t('addNewEmployee')}</h1>
          <p className="text-sm font-medium text-slate-500">{t('enterDetails')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-indigo-50 dark:bg-indigo-500/10 p-4 border-b border-indigo-100 dark:border-indigo-500/20 flex items-center gap-3">
            <User className="text-indigo-500" size={24} />
            <h2 className="font-bold text-indigo-900 dark:text-indigo-100 text-lg">{t('personalDetails')}</h2>
          </div>
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('fullName')}</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder={t('namePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('mobileNumber')}</label>
                <input required type="tel" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder={t('mobilePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('emergencyContact')}</label>
                <input type="tel" value={formData.emergencyContact} onChange={e => setFormData({...formData, emergencyContact: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder={t('optionalPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('role')}</label>
                {/* Free-text with suggestions — a fixed dropdown used to make
                    "Other" a dead end (stored the literal word "Other" with
                    no way to type a real title). */}
                <input list="staff-role-options" type="text" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow font-medium" placeholder={t('role')} />
                <datalist id="staff-role-options">
                  {ROLES.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('joiningDate')}</label>
                <input type="date" value={formData.joiningDate} onChange={e => setFormData({...formData, joiningDate: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('email')}</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder={t('optionalPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('alternateMobile')}</label>
                <input type="tel" value={formData.alternateMobile} onChange={e => setFormData({...formData, alternateMobile: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder={t('optionalPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dateOfBirth')}</label>
                <input type="date" value={formData.dateOfBirth} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('gender')}</label>
                <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow appearance-none">
                  <option value="">{t('optionalPlaceholder')}</option>
                  <option value="male">{t('genderMale')}</option>
                  <option value="female">{t('genderFemale')}</option>
                  <option value="other">{t('genderOther')}</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-sky-50 dark:bg-sky-500/10 p-4 border-b border-sky-100 dark:border-sky-500/20 flex items-center gap-3">
            <Briefcase className="text-sky-500" size={24} />
            <h2 className="font-bold text-sky-900 dark:text-sky-100 text-lg">{t('employmentDetails')}</h2>
          </div>
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('employeeCode')}</label>
                <input type="text" value={formData.employeeCode} onChange={e => setFormData({...formData, employeeCode: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-shadow" placeholder={t('employeeCodePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('department')}</label>
                <input list="staff-department-options" type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-shadow" placeholder={t('optionalPlaceholder')} />
                <datalist id="staff-department-options">
                  {departmentOptions.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('employeeType')}</label>
                <select value={formData.employeeType} onChange={e => setFormData({...formData, employeeType: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-shadow appearance-none">
                  {EMPLOYEE_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('shift')}</label>
                <input type="text" value={formData.shift} onChange={e => setFormData({...formData, shift: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-shadow" placeholder={t('shiftPlaceholder')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 border-b border-emerald-100 dark:border-emerald-500/20 flex items-center gap-3">
            <CreditCard className="text-emerald-500" size={24} />
            <h2 className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{t('salaryBankDetails')}</h2>
          </div>
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('salaryType')}</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button type="button" onClick={() => setFormData({...formData, salaryType: 'monthly'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${formData.salaryType === 'monthly' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}>{t('monthly')}</button>
                  <button type="button" onClick={() => setFormData({...formData, salaryType: 'daily'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${formData.salaryType === 'daily' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}>{t('daily')}</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('amount')}</label>
                <input required type="number" min="0" value={formData.salaryAmount} onChange={e => setFormData({...formData, salaryAmount: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow text-lg font-bold text-emerald-600 dark:text-emerald-400" placeholder="0" />
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('bankAccountNo')}</label>
                <input type="text" value={formData.bankAccount.accNo} onChange={e => setFormData({...formData, bankAccount: {...formData.bankAccount, accNo: e.target.value}})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" placeholder={t('optionalPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('ifscCode')}</label>
                <input type="text" value={formData.bankAccount.ifsc} onChange={e => setFormData({...formData, bankAccount: {...formData.bankAccount, ifsc: e.target.value}})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" placeholder={t('optionalPlaceholder')} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('upiId')}</label>
                <input type="text" value={formData.bankAccount.upi} onChange={e => setFormData({...formData, bankAccount: {...formData.bankAccount, upi: e.target.value}})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" placeholder={t('upiPlaceholder')} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance — collapsed by default, never required. Most small
            shops don't track PF/ESI/PT/TDS at the staff level at all. */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCompliance(v => !v)}
            className="w-full bg-violet-50 dark:bg-violet-500/10 p-4 border-b border-violet-100 dark:border-violet-500/20 flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-3">
              <ShieldCheck className="text-violet-500" size={24} />
              <span className="font-bold text-violet-900 dark:text-violet-100 text-lg">{t('complianceOptional')}</span>
            </span>
            <span className="text-xs font-bold text-violet-500">{showCompliance ? t('hide') : t('show')}</span>
          </button>
          {showCompliance && (
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('pan')}</label>
                  <input type="text" value={formData.pan} onChange={e => setFormData({...formData, pan: e.target.value.toUpperCase()})} maxLength={10} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none transition-shadow uppercase" placeholder={t('optionalPlaceholder')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('aadhaarLast4')}</label>
                  <input type="text" value={formData.aadhaarLast4} onChange={e => setFormData({...formData, aadhaarLast4: e.target.value.replace(/\D/g, '').slice(0, 4)})} maxLength={4} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none transition-shadow" placeholder="XXXX" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('uan')}</label>
                  <input type="text" value={formData.uan} onChange={e => setFormData({...formData, uan: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none transition-shadow" placeholder={t('optionalPlaceholder')} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {([['pfApplicable', 'pfLabel'], ['esiApplicable', 'esiLabel'], ['ptApplicable', 'ptLabel'], ['tdsApplicable', 'tdsLabel']] as const).map(([key, labelKey]) => (
                  <label key={key} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={formData[key]} onChange={e => setFormData({...formData, [key]: e.target.checked})} className="w-4 h-4 accent-violet-500" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(labelKey)}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-500/10 p-4 border-b border-amber-100 dark:border-amber-500/20 flex items-center gap-3">
            <UploadCloud className="text-amber-500" size={24} />
            <h2 className="font-bold text-amber-900 dark:text-amber-100 text-lg">{t('documentsOptional')}</h2>
          </div>
          <CardContent className="p-4 space-y-3">
            {renderDocUpload(t('passportPhoto'), 'photoUrl')}
            {renderDocUpload(t('aadhaarFront'), 'aadhaarFront')}
            {renderDocUpload(t('aadhaarBack'), 'aadhaarBack')}
            {renderDocUpload(t('panCard'), 'panCard')}
            {renderDocUpload(t('addressProof'), 'addressProof')}
          </CardContent>
        </Card>

        <button 
          type="submit" 
          disabled={loading || !!uploadingDoc} 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-black text-lg transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={24} />}
          {t('saveEmployeeProfile')}
        </button>
      </form>

      {viewingDoc && (
        <DocumentViewerModal url={viewingDoc.url} label={viewingDoc.label} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}
