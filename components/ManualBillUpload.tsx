'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Camera, ImagePlus, FileText, Loader2, ArrowLeft, IndianRupee, CreditCard, Smartphone, User, AlertCircle, CheckCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { uploadManualBillFile } from '@/lib/supabaseStorage';
import { useUdharStore } from '@/lib/store';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const ACCEPTED_EXT = '.jpg,.jpeg,.png,.pdf';
const MAX_FILE_MB = 10;

type Step = 'capture' | 'preview' | 'details';
type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Udhar' | 'EMI';

const PAYMENT_MODES: { id: PaymentMode; label: string; icon: React.ReactNode }[] = [
  { id: 'Cash', label: 'Cash', icon: <IndianRupee size={18} /> },
  { id: 'UPI', label: 'UPI', icon: <Smartphone size={18} /> },
  { id: 'Card', label: 'Card', icon: <CreditCard size={18} /> },
  { id: 'Udhar', label: 'Udhar', icon: <User size={18} /> },
];

// EMI: a finance provider (Bajaj Finserv, HDFC, ...) settles the bill in full;
// interest and instalments are between the provider and the customer, not the
// shop's concern — matches how EMI works as a payment method on the main
// billing screen. Only offered to electronics shopkeepers.
const EMI_MODE: { id: PaymentMode; label: string; icon: React.ReactNode } = { id: 'EMI', label: 'EMI', icon: <Zap size={18} /> };

export interface ManualBillSavedData {
  items: { id: string; name: string; unit: string; quantity: number; price: number; total: number; profit: number }[];
  total: number;
  discount: number;
  amountPaid: number;
  remainingAmount: number;
  paymentMethod: string;
  splitPayments: undefined;
  billNumber: string;
  date: string;
  isEmi: boolean;
  billType: 'non_gst';
  gstBreakdown: undefined;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string;
  billImageUrl?: string;
}

interface ManualBillUploadProps {
  shopId: string;
  businessType?: string;
  onClose: () => void;
  onSaved: (data: ManualBillSavedData) => void;
}

export default function ManualBillUpload({ shopId, businessType, onClose, onSaved }: ManualBillUploadProps) {
  const isElectronics = businessType === 'electronics';
  const paymentModes = isElectronics ? [...PAYMENT_MODES, EMI_MODE] : PAYMENT_MODES;
  const { customers: udharCustomers, fetchCustomers } = useUdharStore();

  const [step, setStep] = useState<Step>('capture');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  // Mobile/email are visible, editable fields — same as the regular billing
  // flow's Customer Details step — so Manual Bill can auto-share on
  // WhatsApp/email exactly the way a normal sale does, not just when they
  // happen to match an existing customer record.
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const captureInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const isUdhar = paymentMode === 'Udhar';
  const isEmi = paymentMode === 'EMI';
  const amountNum = Number(amount) || 0;
  const canSave = amountNum > 0 && !!file && (!isUdhar || customerName.trim().length > 0) && !saving;

  const handleFile = useCallback((f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    const typeOk = ACCEPTED_TYPES.includes(f.type) || /\.(jpe?g|png|pdf)$/i.test(f.name);
    if (!typeOk) {
      setFileError('Only JPG, JPEG, PNG or PDF files are supported.');
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File is too large. Maximum size is ${MAX_FILE_MB}MB.`);
      return;
    }
    setFile(f);
    if (f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null); // PDF — shown as a file card, not an <img>
    }
    setStep('preview');
  }, []);

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setFileError(null);
    setStep('capture');
  };

  const handleSave = async () => {
    if (!canSave || !file) return;
    setSaving(true);
    setSaveError(null);
    try {
      const billImageUrl = await uploadManualBillFile(file, shopId);
      if (!billImageUrl) {
        throw new Error('Could not upload the bill file. Check your connection and try again.');
      }

      const payload = {
        customer_name: customerName.trim() || null,
        customer_mobile: customerMobile.trim() || null,
        customer_email: customerEmail.trim() || null,
        items: [{
          product_id: null,
          unit: 'Bill',
          quantity: 1,
          price_per_unit: amountNum,
          margin_per_unit: 0,
        }],
        total_amount: amountNum,
        total_profit: 0,
        payment_type: paymentMode,
        amount_paid: isUdhar ? 0 : amountNum,
        payment_details: {},
        bill_type: 'non_gst',
        bill_image_url: billImageUrl,
        is_manual: true,
      };

      const res = await api.post('/billing/', payload);
      const dbSale = res.data;
      const billNumber = `INV-${dbSale.id.substring(0, 8).toUpperCase()}`;
      const remainingAmount = isUdhar ? amountNum : 0;

      onSaved({
        items: [{ id: 'manual', name: 'Manual Bill', unit: 'Bill', quantity: 1, price: amountNum, total: amountNum, profit: 0 }],
        total: amountNum,
        discount: 0,
        amountPaid: isUdhar ? 0 : amountNum,
        remainingAmount,
        paymentMethod: paymentMode,
        splitPayments: undefined,
        billNumber,
        date: new Date().toLocaleDateString(),
        isEmi,
        billType: 'non_gst',
        gstBreakdown: undefined,
        customerName: customerName.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        billImageUrl,
      });
    } catch (err: any) {
      setSaveError(err?.response?.data?.detail || err?.message || 'Failed to save the bill. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = udharCustomers.filter(c =>
    c.name.toLowerCase().includes(customerName.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'capture' && (
              <button
                type="button"
                onClick={() => setStep(step === 'details' ? 'preview' : 'capture')}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 p-1 -ml-1"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-slate-900 dark:text-slate-100 font-bold text-lg">Manual Bill</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* ── Step 1: capture / upload ── */}
          {step === 'capture' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Upload or capture a handwriting bill to quickly record the sale and share it with your customer via WhatsApp or Email.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => captureInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  <Camera size={28} />
                  <span className="text-sm font-bold">Capture Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  <ImagePlus size={28} />
                  <span className="text-sm font-bold">Upload Image</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-center">Supported: JPG, JPEG, PNG, PDF · up to {MAX_FILE_MB}MB</p>
              {fileError && (
                <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-xs text-rose-500">
                  <AlertCircle size={14} className="shrink-0" />
                  {fileError}
                </div>
              )}
              {/* Camera: on mobile, capture opens the native camera directly. */}
              <input
                ref={captureInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
              {/* Gallery / file: any supported file, no camera hint. */}
              <input
                ref={galleryInputRef}
                type="file"
                accept={ACCEPTED_EXT}
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {/* ── Step 2: preview ── */}
          {step === 'preview' && file && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 flex items-center justify-center min-h-[200px]">
                {previewUrl ? (
                  <img src={previewUrl} alt="Bill preview" className="max-h-[320px] w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
                    <FileText size={40} />
                    <span className="text-xs font-semibold">{file.name}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Retake / Change
                </button>
                <button
                  type="button"
                  onClick={() => { fetchCustomers(); setStep('details'); }}
                  className="flex-1 py-2.5 bg-emerald-500 text-white dark:text-slate-900 rounded-xl font-bold text-sm hover:bg-emerald-400"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: details ── */}
          {step === 'details' && (
            <div className="space-y-4">
              {/* Customer (optional) */}
              <div className="relative">
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                  Customer{' '}
                  <span className="normal-case font-normal text-slate-400">
                    {isUdhar ? '(required for Udhar)' : '(optional)'}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Search or enter customer name..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                />
                {showCustomerDropdown && customerName && filteredCustomers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 last:border-0"
                        onMouseDown={() => {
                          setCustomerName(c.name);
                          if (c.mobile) setCustomerMobile(c.mobile);
                          if (c.email) setCustomerEmail(c.email);
                          setShowCustomerDropdown(false);
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile & Email — optional, used to auto-share the bill on
                  WhatsApp/email once saved, same as a regular sale. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    Mobile <span className="normal-case font-normal text-slate-400">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 transition-colors">
                    <span className="text-slate-500 dark:text-slate-400 text-sm font-bold select-none">+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit number"
                      maxLength={10}
                      className="flex-1 min-w-0 bg-transparent text-slate-900 dark:text-slate-100 outline-none text-sm"
                      value={customerMobile}
                      onChange={e => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">
                    Email <span className="normal-case font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-colors"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">Bill Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-lg font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 uppercase font-bold">Payment Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  {paymentModes.map(mode => {
                    const selected = paymentMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setPaymentMode(mode.id)}
                        aria-pressed={selected}
                        className={cn(
                          'flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-bold text-sm transition-all active:scale-95',
                          selected
                            ? mode.id === 'Udhar'
                              ? 'bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400'
                              : mode.id === 'EMI'
                                ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400'
                                : 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
                        )}
                      >
                        {mode.icon}
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isUdhar && (
                <p className="text-[10px] font-medium text-orange-500/80 leading-relaxed">
                  This amount will be added to the customer&apos;s udhar ledger. Customer name is required.
                </p>
              )}

              {isEmi && (
                <p className="text-[10px] font-medium text-sky-500/80 leading-relaxed">
                  The finance provider pays the full bill amount to your shop. Interest and monthly instalments are handled by them.
                </p>
              )}

              {saveError && (
                <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-xs text-rose-500">
                  <AlertCircle size={14} className="shrink-0" />
                  {saveError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="w-full py-3.5 rounded-xl font-black text-base shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-emerald-500 text-white dark:text-slate-900 hover:bg-emerald-400"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                {saving ? 'Saving...' : 'Save Bill'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
