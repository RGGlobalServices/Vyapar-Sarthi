'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { 
  Eye, EyeOff, ShoppingBag, Loader2, AlertCircle, 
  CheckCircle2, Sparkles, CheckCircle, ArrowRight 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { ALL_BUSINESS_TYPES, BusinessType, getBusinessConfig } from '@/lib/businessConfig';

interface Form {
  storeName: string;
  ownerName: string;
  mobile: string;
  email: string;
  password: string;
  confirm: string;
  businessType: BusinessType;
}

const INITIAL: Form = { 
  storeName: '', 
  ownerName: '', 
  mobile: '', 
  email: '', 
  password: '', 
  confirm: '',
  businessType: 'kirana' 
};

const COLOR_MAP: Record<string, { card: string; ring: string; badge: string; btn: string }> = {
  emerald: { card: 'border-emerald-500/40 bg-emerald-500/5', ring: 'ring-emerald-500', badge: 'bg-emerald-500/20 text-emerald-400', btn: 'from-emerald-600 to-teal-600 shadow-emerald-500/20 hover:shadow-emerald-500/40' },
  blue:    { card: 'border-blue-500/40 bg-blue-500/5',       ring: 'ring-blue-500',    badge: 'bg-blue-500/20 text-blue-400',       btn: 'from-blue-600 to-cyan-600 shadow-blue-500/20 hover:shadow-blue-500/40' },
  pink:    { card: 'border-pink-500/40 bg-pink-500/5',       ring: 'ring-pink-500',    badge: 'bg-pink-500/20 text-pink-400',       btn: 'from-pink-600 to-rose-600 shadow-pink-500/20 hover:shadow-pink-500/40' },
  amber:   { card: 'border-amber-500/40 bg-amber-500/5',     ring: 'ring-amber-500',   badge: 'bg-amber-500/20 text-amber-400',     btn: 'from-amber-600 to-orange-600 shadow-amber-500/20 hover:shadow-amber-500/40' },
  violet:  { card: 'border-violet-500/40 bg-violet-500/5',   ring: 'ring-violet-500',  badge: 'bg-violet-500/20 text-violet-400',   btn: 'from-violet-600 to-purple-600 shadow-violet-500/20 hover:shadow-violet-500/40' },
  sky:     { card: 'border-sky-500/40 bg-sky-500/5',         ring: 'ring-sky-500',     badge: 'bg-sky-500/20 text-sky-400',         btn: 'from-sky-600 to-blue-600 shadow-sky-500/20 hover:shadow-sky-500/40' },
  slate:   { card: 'border-slate-500/40 bg-slate-500/5',     ring: 'ring-slate-500',   badge: 'bg-slate-500/20 text-slate-400',     btn: 'from-slate-600 to-gray-600 shadow-slate-500/20 hover:shadow-slate-500/40' },
};

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  if (!password) return null;
  return (
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= score ? colors[score] : 'bg-slate-700')} />
        ))}
      </div>
      <p className={cn('text-[11px] font-medium', score <= 1 ? 'text-red-400' : score === 2 ? 'text-orange-400' : score === 3 ? 'text-yellow-400' : 'text-emerald-400')}>
        {labels[score]}
      </p>
    </div>
  );
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

export default function SignupPage() {
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>(INITIAL);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    window.location.href = `${process.env.NEXT_PUBLIC_LANDING_URL || 'http://localhost:5173'}/payment.html`;
    setMounted(true);
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase();
    if (ref) setReferralCode(ref);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  function validateStep1(): string {
    if (!form.storeName.trim()) return 'Store name is required.';
    if (!form.ownerName.trim()) return 'Owner name is required.';
    if (!/^\d{10}$/.test(form.mobile)) return 'Enter a valid 10-digit mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    return '';
  }

  async function handleNext() {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setStep(2);
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    try {
      const resp = await api.post('/auth/register', {
        email: form.email,
        password: form.password,
        full_name: form.ownerName,
        shop_name: form.storeName,
        business_type: form.businessType,
        paid_plan: getCookie('ks_paid_plan'),
        paid_txnid: getCookie('ks_paid_txnid')
      });

      const { access_token, user } = resp.data;

      if (access_token && user) {
        document.cookie = `ks_auth=1; path=/; max-age=${60 * 60 * 24 * 7}`;
        localStorage.setItem('ks_auth', JSON.stringify({
          access_token,
          user_id: user.id,
          email: user.email,
          name: user.name,
          storeName: user.storeName,
          mobile: form.mobile,
          businessType: form.businessType
        }));

        if (referralCode) {
          try {
            await api.post('/referrals/apply', { referral_code: referralCode });
          } catch (refErr) {
            console.warn('Account created, but referral could not be applied', refErr);
          }
        }

        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = next || `/${locale}/`;
      } else {
        setError('Account created but no session returned. Please sign in.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* ── Left branding ── */}
      <div className={cn(
        "hidden lg:flex lg:w-4/12 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex-col items-center justify-center p-12 relative overflow-hidden border-r border-slate-800 transition-all duration-700",
        step === 2 ? "lg:w-3/12 opacity-50 grayscale-[0.5]" : "lg:w-4/12"
      )}>
        <div className="absolute w-80 h-80 rounded-full bg-emerald-500/5 -top-10 -right-10" />
        <div className="relative z-10 space-y-6 max-w-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/30">
              <ShoppingBag size={24} className="text-slate-900" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-50">Vyapar Sarthi</p>
              <p className="text-emerald-400 text-xs font-medium">AI Store Management</p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-100 leading-snug">
            Set up your {step === 2 ? 'Business' : 'Account'}<br />
            <span className="text-emerald-400">in 2 minutes.</span>
          </h2>
          <div className="space-y-4 pt-4">
            {[
              'AI-powered inventory management',
              'Multi-lingual support',
              'Professional GST billing',
              'Smart udhar reminders'
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <span className="text-slate-400">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950 overflow-y-auto min-h-screen">
        <div className={cn(
          "w-full transition-all duration-500 ease-in-out",
          step === 1 ? "max-w-sm" : "max-w-4xl"
        )}>
          {/* Progress Header */}
          <div className="flex items-center justify-between mb-8 max-w-sm mx-auto">
            <div className="flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all", step === 1 ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20" : "bg-emerald-500/20 text-emerald-500")}>1</div>
              <div className="h-0.5 w-8 bg-slate-800" />
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all", step === 2 ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20" : "bg-slate-800 text-slate-500")}>2</div>
            </div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
              Step {step} of 2
            </p>
          </div>

          {step === 1 ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="text-center md:text-left">
                <h2 className="text-3xl font-black text-slate-50 tracking-tight">Create Account</h2>
                <p className="text-slate-500 text-sm mt-1 font-medium">Basic details to get started</p>
                {referralCode && (
                  <p className="mt-3 inline-flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
                    Referral code applied: {referralCode}
                  </p>
                )}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Store Name">
                    <input name="storeName" value={form.storeName} onChange={handleChange}
                      placeholder="e.g. Patil Kirana Store" className={inputCls} />
                  </Field>
                  <Field label="Owner Name">
                    <input name="ownerName" value={form.ownerName} onChange={handleChange}
                      placeholder="e.g. Ramesh Patil" className={inputCls} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Mobile Number">
                    <input name="mobile" type="tel" value={form.mobile} onChange={handleChange}
                      placeholder="10-digit number" maxLength={10} className={inputCls} />
                  </Field>
                  <Field label="Email">
                    <input name="email" type="email" value={form.email} onChange={handleChange}
                      placeholder="you@example.com" autoComplete="email" className={inputCls} />
                  </Field>
                </div>

                <Field label="Password">
                  <div className="relative">
                    <input name="password" type={showPw ? 'text' : 'password'} value={form.password}
                      onChange={handleChange} placeholder="Min. 6 characters" autoComplete="new-password"
                      className={cn(inputCls, 'pr-11')} />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <StrengthBar password={form.password} />
                </Field>

                <Field label="Confirm Password">
                  <input name="confirm" type="password" value={form.confirm} onChange={handleChange}
                    placeholder="Repeat password"
                    className={cn(inputCls, form.confirm && form.confirm !== form.password && 'border-red-500/60 focus:border-red-500')} />
                </Field>

                {error && (
                  <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={15} className="flex-shrink-0" />{error}
                  </div>
                )}

                <button type="submit" 
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-black text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95">
                  Choose Business Type <ArrowRight size={18} />
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-8 animate-in zoom-in-95 duration-500">
              <div className="text-center">
                <h2 className="text-4xl font-black text-slate-50 tracking-tighter">
                  What type of business <span className="text-emerald-500">do you run?</span>
                </h2>
                <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto font-medium">
                  Select your specialty — we'll tailor your dashboard, alerts, and fields automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ALL_BUSINESS_TYPES.map(config => {
                  const colors = COLOR_MAP[config.color] ?? COLOR_MAP.slate;
                  const isSelected = form.businessType === config.type;
                  return (
                    <button
                      key={config.type}
                      onClick={() => setForm(f => ({ ...f, businessType: config.type }))}
                      className={cn(
                        'relative text-left p-5 rounded-2xl border-2 transition-all duration-300 group h-full flex flex-col',
                        isSelected
                          ? `${colors.card} border-2 ring-2 ${colors.ring} shadow-2xl scale-[1.02]`
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/70 hover:scale-[1.01]'
                      )}
                    >
                      {isSelected && <div className="absolute top-3 right-3 animate-in fade-in zoom-in"><CheckCircle size={20} className="text-emerald-400" /></div>}
                      <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">{config.emoji}</div>
                      <h3 className="font-bold text-slate-100 text-lg mb-1 leading-tight">{config.label}</h3>
                      <p className="text-slate-500 text-[11px] mb-4 line-clamp-2 leading-relaxed">{config.description}</p>
                      
                      <div className="mt-auto flex flex-wrap gap-1.5">
                        {config.features.slice(0, 2).map((f, i) => (
                          <div key={i} className={cn('text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter', colors.badge)}>
                            {f}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="max-w-sm mx-auto space-y-4 pt-4">
                {error && (
                  <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={15} />{error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} 
                    className="flex-1 py-4 bg-slate-900 text-slate-400 font-bold rounded-xl border border-slate-800 hover:bg-slate-800 transition-all">
                    Back
                  </button>
                  <button onClick={handleSubmit} disabled={loading}
                    className={cn(
                      'flex-[2] py-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 text-white',
                      loading 
                        ? 'bg-slate-800 text-slate-600' 
                        : `bg-gradient-to-r ${COLOR_MAP[getBusinessConfig(form.businessType).color].btn}`
                    )}>
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <>Start {getBusinessConfig(form.businessType).label} Manager</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="text-center text-sm text-slate-500 mt-10">
            Already have an account?{' '}
            <button onClick={() => window.location.href = `/${locale}/login`}
              className="text-emerald-400 hover:text-emerald-300 font-black transition-colors underline-offset-4 hover:underline">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 placeholder:text-slate-600 transition-all font-medium';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">
        {label}
      </label>
      {children}
    </div>
  );
}
