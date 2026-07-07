'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, Camera, Check, ChevronLeft, CreditCard, FileText, UploadCloud, User } from 'lucide-react';
import { Link } from '@/i18n/routing';

const ROLES = ['Salesman', 'Helper', 'Cashier', 'Warehouse Staff', 'Delivery Boy', 'Other'];

export default function AddStaffPage() {
  const router = useRouter();
  const t = useTranslations('Staff');
  const [loading, setLoading] = useState(false);
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
    photoUrl: ''
  });

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingDoc(docType);
    
    const body = new FormData();
    body.append('file', file);
    
    try {
      const res = await api.post('/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
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
      alert('Upload failed');
    } finally {
      setUploadingDoc(null);
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

  const DocumentUpload = ({ label, docType }: { label: string, docType: string }) => {
    const isUploaded = docType === 'photoUrl' ? !!formData.photoUrl : !!formData.documents[docType];
    const isUploading = uploadingDoc === docType;
    
    return (
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isUploaded ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
            {isUploaded ? <Check size={20} /> : <FileText size={20} />}
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-sm">{label}</p>
            <p className="text-xs text-slate-500">{isUploaded ? 'Uploaded' : 'Pending'}</p>
          </div>
        </div>
        <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${isUploaded ? 'bg-white border-2 border-green-500 text-green-600 dark:bg-slate-800 dark:text-green-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20'}`}>
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : isUploaded ? (
            'Change'
          ) : (
            <>
              <Camera size={16} /> Upload
            </>
          )}
          <input 
            type="file" 
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden" 
            onChange={(e) => handleFileUpload(e, docType)}
            disabled={isUploading}
          />
        </label>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff" className="w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-500 transition-colors shadow-sm">
          <ChevronLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Add New Employee</h1>
          <p className="text-sm font-medium text-slate-500">Enter details and upload documents</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-indigo-50 dark:bg-indigo-500/10 p-4 border-b border-indigo-100 dark:border-indigo-500/20 flex items-center gap-3">
            <User className="text-indigo-500" size={24} />
            <h2 className="font-bold text-indigo-900 dark:text-indigo-100 text-lg">Personal Details</h2>
          </div>
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Name *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="e.g. Ramesh Kumar" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Mobile Number *</label>
                <input required type="tel" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="10 digit number" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Emergency Contact</label>
                <input type="tel" value={formData.emergencyContact} onChange={e => setFormData({...formData, emergencyContact: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Role</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow appearance-none font-medium">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Joining Date</label>
                <input type="date" value={formData.joiningDate} onChange={e => setFormData({...formData, joiningDate: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 border-b border-emerald-100 dark:border-emerald-500/20 flex items-center gap-3">
            <CreditCard className="text-emerald-500" size={24} />
            <h2 className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">Salary & Bank Details</h2>
          </div>
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Salary Type</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button type="button" onClick={() => setFormData({...formData, salaryType: 'monthly'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${formData.salaryType === 'monthly' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}>Monthly</button>
                  <button type="button" onClick={() => setFormData({...formData, salaryType: 'daily'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${formData.salaryType === 'daily' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}>Daily</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Amount (₹) *</label>
                <input required type="number" min="0" value={formData.salaryAmount} onChange={e => setFormData({...formData, salaryAmount: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow text-lg font-bold text-emerald-600 dark:text-emerald-400" placeholder="0" />
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Bank Account No.</label>
                <input type="text" value={formData.bankAccount.accNo} onChange={e => setFormData({...formData, bankAccount: {...formData.bankAccount, accNo: e.target.value}})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">IFSC Code</label>
                <input type="text" value={formData.bankAccount.ifsc} onChange={e => setFormData({...formData, bankAccount: {...formData.bankAccount, ifsc: e.target.value}})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" placeholder="Optional" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">UPI ID</label>
                <input type="text" value={formData.bankAccount.upi} onChange={e => setFormData({...formData, bankAccount: {...formData.bankAccount, upi: e.target.value}})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none" placeholder="user@upi" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-500/10 p-4 border-b border-amber-100 dark:border-amber-500/20 flex items-center gap-3">
            <UploadCloud className="text-amber-500" size={24} />
            <h2 className="font-bold text-amber-900 dark:text-amber-100 text-lg">Documents (Optional)</h2>
          </div>
          <CardContent className="p-4 space-y-3">
            <DocumentUpload label="Passport Size Photo" docType="photoUrl" />
            <DocumentUpload label="Aadhaar Card (Front)" docType="aadhaarFront" />
            <DocumentUpload label="Aadhaar Card (Back)" docType="aadhaarBack" />
            <DocumentUpload label="PAN Card" docType="panCard" />
            <DocumentUpload label="Address Proof" docType="addressProof" />
          </CardContent>
        </Card>

        <button 
          type="submit" 
          disabled={loading || !!uploadingDoc} 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-black text-lg transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save Employee Details'}
        </button>
      </form>
    </div>
  );
}
