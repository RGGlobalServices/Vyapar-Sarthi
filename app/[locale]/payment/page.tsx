'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';

const PLAN_NAMES: Record<string, string> = {
  shop:      'Dukaan — ₹299/mo',
  vyapar:    'Vyapar — ₹499/mo',
  wholesale: 'Udyog — ₹999/mo',
};

const PLAN_PRICES: Record<string, number> = {
  shop: 299, vyapar: 499, wholesale: 999,
};

function PaymentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  const formRef = useRef<HTMLFormElement>(null);

  const plan = searchParams.get('plan') || 'shop';
  const forcePay = searchParams.get('force_pay') === '1';
  const errorParam = searchParams.get('error');
  const planName = PLAN_NAMES[plan] || plan;
  const planPrice = PLAN_PRICES[plan] || 0;

  const [status, setStatus] = useState<'loading' | 'submitting' | 'test' | 'error' | 'switching' | 'switched'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [paymentUrl, setPaymentUrl] = useState('');
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Show error from PayU failure callback
  useEffect(() => {
    if (errorParam) {
      setErrorMsg(decodeURIComponent(errorParam).replace(/_/g, ' '));
      setStatus('error');
    }
  }, [errorParam]);

  useEffect(() => {
    if (!user || errorParam) return;
    initFlow();
  }, [user]);

  // Decide between a free trial-switch (no charge) and a paid PayU order.
  async function initFlow() {
    setStatus('loading');
    try {
      const res = await api.get('/shop/profile');
      const shop = res.data || {};
      const subStatus = (shop.subscriptionStatus ?? shop.subscription_status ?? '').toLowerCase();
      const trialEndRaw = shop.subscriptionTrialEnds ?? shop.subscription_trial_ends
        ?? shop.subscriptionExpiry ?? shop.subscription_expiry;
      const trialActive = subStatus === 'trial' && trialEndRaw && new Date(trialEndRaw) > new Date();
      if (trialActive && !forcePay) {
        await switchTrialPlan(trialEndRaw);
        return;
      }
    } catch {
      /* couldn't read profile — fall through to paid flow */
    }
    createOrder();
  }

  // Free plan switch while the trial is still running — keeps remaining days.
  async function switchTrialPlan(trialEndRaw: string) {
    setStatus('switching');
    try {
      const res = await api.post('/shop/switch-plan', { plan });
      const ends = res.data?.trialEnds || trialEndRaw;
      const days = Math.max(0, Math.ceil((new Date(ends).getTime() - Date.now()) / 86400000));
      setTrialDaysLeft(days);
      setStatus('switched');
      // Set plan cookie so middleware allows app access
      document.cookie = `ks_plan=${plan}; path=/; max-age=${60 * 60 * 24 * 7}`;
      setTimeout(() => router.push(`/en?plan_switched=1&plan=${plan}`), 1800);
    } catch {
      // Trial ended between page loads → fall back to paid flow.
      createOrder();
    }
  }

  async function createOrder() {
    setStatus('loading');
    try {
      const res = await api.post('/payments/create-order', {
        plan,
        firstname: user?.name || user?.storeName || 'Customer',
        email: user?.email || '',
        phone: user?.mobile || '',
      });

      const data = res.data;

      if (data.test_mode) {
        // PayU not configured — show test mode UI
        setFormFields(data);
        setStatus('test');
        return;
      }

      // Real PayU — build hidden form fields and auto-submit (one-time payment)
      setPaymentUrl(data.paymentUrl || 'https://secure.payu.in/_payment');
      setFormFields({
        key:         data.key,
        txnid:       data.txnid,
        amount:      data.amount,
        productinfo: data.productinfo,
        firstname:   data.firstname,
        email:       data.email,
        phone:       data.phone || '',
        surl:        data.surl,
        furl:        data.furl,
        hash:        data.hash,
        udf1:        data.udf1 || plan,
        udf2:        data.udf2 || '',
      });
      setStatus('submitting');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to create payment order. Please try again.';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  // Auto-submit the form when fields are ready
  useEffect(() => {
    if (status === 'submitting' && formRef.current && Object.keys(formFields).length > 0) {
      setTimeout(() => formRef.current?.submit(), 300);
    }
  }, [status, formFields]);

  // Test mode: manually activate the plan
  async function handleTestActivate() {
    setActivating(true);
    try {
      await api.post('/payments/activate-plan', { plan, trial_end: null, txnid: `TEST_${Date.now()}` });
      setActivated(true);
      // Set plan cookie so middleware allows app access
      document.cookie = `ks_plan=${plan}; path=/; max-age=${60 * 60 * 24 * 7}`;
      setTimeout(() => router.push(`/en?payment_success=1&plan=${plan}`), 1500);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Activation failed');
    } finally {
      setActivating(false);
    }
  }

  const isTrialSwitch = status === 'switching' || status === 'switched';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white">{isTrialSwitch ? 'Switch Plan' : 'Secure Payment'}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {isTrialSwitch ? 'Switching to' : 'Upgrading to'} <strong className="text-white">{planName}</strong>
          </p>
        </div>

        {/* Plan summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Plan</p>
              <p className="font-bold text-white">{planName}</p>
            </div>
            <div className="text-right">
              {isTrialSwitch ? (
                <>
                  <p className="text-2xl font-black text-amber-400">₹0</p>
                  <p className="text-xs text-slate-500">during trial</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-emerald-400">₹{planPrice}</p>
                  <p className="text-xs text-slate-500">per month</p>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
            {isTrialSwitch ? (
              <>
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <CheckCircle size={13} />
                  Free to switch during your trial — no charge
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <CheckCircle size={13} />
                  Your remaining trial days stay the same
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={13} />
                  You'll only pay ₹{planPrice}/mo after the trial ends
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle size={13} />
                  1 month of full access — ₹{planPrice}
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle size={13} />
                  30-day money-back guarantee · Cancel anytime
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={13} />
                  We'll remind you before it expires — no surprise charges
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status states */}
        {(status === 'loading' || status === 'submitting') && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-300 font-semibold">
              {status === 'loading' ? 'Preparing your order…' : 'Redirecting to PayU…'}
            </p>
            <p className="text-slate-500 text-xs mt-1">Please don't close this page</p>
          </div>
        )}

        {status === 'switching' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-amber-400 mx-auto mb-3" />
            <p className="text-slate-300 font-semibold">Switching your plan…</p>
            <p className="text-slate-500 text-xs mt-1">No payment needed during your trial</p>
          </div>
        )}

        {status === 'switched' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-emerald-300 font-bold">Plan switched to {planName}!</p>
            <p className="text-slate-400 text-sm">
              {trialDaysLeft !== null
                ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} of free trial remaining.`
                : 'Your trial continues with the new plan.'}
            </p>
            <p className="text-slate-500 text-xs">Taking you to your dashboard…</p>
          </div>
        )}

        {status === 'error' && (
          <div className={errorMsg === 'You already have an active subscription' 
            ? "bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-4"
            : "bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center space-y-4"
          }>
            {errorMsg === 'You already have an active subscription' ? (
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
            )}
            <p className={errorMsg === 'You already have an active subscription' ? "text-emerald-300 font-semibold" : "text-red-300 font-semibold"}>
              {errorMsg}
            </p>
            {errorMsg === 'You already have an active subscription' ? (
              <button 
                onClick={() => {
                  setNavigating(true);
                  router.push('/en/settings');
                }}
                disabled={navigating}
                className="px-6 py-2.5 bg-emerald-500 text-slate-900 font-bold rounded-xl hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto disabled:opacity-80"
              >
                {navigating ? <Loader2 size={18} className="animate-spin" /> : 'Go to Settings'}
                {!navigating && <ArrowRight size={18} />}
              </button>
            ) : (
              <button onClick={createOrder}
                className="px-6 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-400 transition-colors">
                Try Again
              </button>
            )}
          </div>
        )}

        {status === 'test' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <AlertTriangle size={16} /> Test / Development Mode
            </div>
            <p className="text-slate-300 text-sm">
              PayU is not configured. In production, the user would be redirected to PayU's secure payment page.
            </p>
            <div className="bg-slate-900 rounded-xl p-3 text-xs font-mono text-slate-400 space-y-1">
              <p>Plan: <span className="text-emerald-400">{plan}</span></p>
              <p>Amount: <span className="text-emerald-400">₹{planPrice}</span></p>
              <p>Validity: <span className="text-emerald-400">30 days</span></p>
              <p>Renewal: <span className="text-emerald-400">manual — reminder before expiry</span></p>
            </div>
            {activated ? (
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <CheckCircle size={16} /> Plan activated! Redirecting to dashboard…
              </div>
            ) : (
              <button onClick={handleTestActivate} disabled={activating}
                className="w-full py-3 bg-emerald-500 text-slate-900 font-black rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {activating ? <><Loader2 size={16} className="animate-spin" /> Activating…</> : '✓ Activate Plan (Test)'}
              </button>
            )}
          </div>
        )}

        {/* Hidden PayU form — auto-submitted */}
        {status === 'submitting' && (
          <form ref={formRef} method="POST" action={paymentUrl} className="hidden">
            {Object.entries(formFields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          </form>
        )}

        <p className="text-center text-xs text-slate-600 mt-6">
          Payments are secured by PayU · 256-bit SSL encryption
        </p>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    }>
      <PaymentPageInner />
    </Suspense>
  );
}
