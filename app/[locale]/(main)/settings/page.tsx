
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bell, Shield, BellRing, Smartphone, Clock, Save, Loader2, CheckCircle, CreditCard, AlertTriangle, X, Sparkles, Zap } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import { planLabel, PLAN_LIMITS, PLAN_PRICES, nextUpgrade } from '@/lib/planGates';
import { useLocale } from 'next-intl';

// Inner component uses useSearchParams — must be wrapped in Suspense
function SettingsPageInner() {
  const t = useTranslations('Settings');
  const locale = useLocale();
  const { profile, fetchProfile } = useBusinessStore();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [activatingPlan, setActivatingPlan] = useState(false);

  // Refresh profile on mount to get latest plan
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handle return from PayU payment — activate plan automatically
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success');
    if (paymentSuccess !== '1') return;

    const plan      = searchParams.get('plan') || '';
    const trialEnd  = searchParams.get('trial_end') || '';
    const txnid     = searchParams.get('txnid') || '';

    if (!plan) return;

    setActivatingPlan(true);
    // Plan was already activated by backend in payu-success; just refresh profile
    fetchProfile()
      .then(() => {
        setStatus({ type: 'success', message: `🎉 ${planLabel(plan)} activated! Your plan is now active.` });
        setTimeout(() => setStatus(null), 8000);
      })
      .catch((err: any) => {
        setStatus({ type: 'error', message: err?.response?.data?.detail || 'Could not activate plan. Please contact support.' });
      })
      .finally(() => {
        setActivatingPlan(false);
        // Clean up URL params without reloading
        router.replace(window.location.pathname, { scroll: false });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);

  useEffect(() => {
    api.get('/payments/history')
      .then(res => setPaymentHistory(res.data))
      .catch(err => console.error('Failed to fetch payment history:', err));
  }, []);

  // Cancel subscription state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason]       = useState('');
  const [cancelling, setCancelling]           = useState(false);
  const [cancelDone, setCancelDone]           = useState(false);
  const [settings, setSettings] = useState({
    daily_summary_enabled: true,
    low_stock_alert_enabled: true,
    alert_time: '08:00'
  });

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/notifications/settings');
        setSettings(prev => ({ ...prev, ...res.data }));
        
        if ('Notification' in window) {
          setPermission(Notification.permission);
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const handleTogglePush = async () => {
    try {
      if (isSubscribed) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        await subscription?.unsubscribe();
        setIsSubscribed(false);
      } else {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'granted') {
          const registration = await navigator.serviceWorker.ready;
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          
          if (!vapidKey) {
            throw new Error('VAPID Public Key not found in environment');
          }

          const pushSub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
          });
          
          const subJSON = pushSub.toJSON();
          await api.post('/notifications/subscribe', {
            endpoint: subJSON.endpoint,
            keys: subJSON.keys
          });
          setIsSubscribed(true);
        }
      }
    } catch (err) {
      console.error('Push error:', err);
      alert('Failed to update push subscription: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const res = await api.post('/payments/cancel-subscription', { reason: cancelReason });
      await fetchProfile();
      setCancelDone(true);
      setShowCancelModal(false);
      setStatus({
        type: 'success',
        message: res?.data?.detail || 'Subscription cancelled. You retain access until your billing period ends.',
      });
      setTimeout(() => setStatus(null), 6000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.response?.data?.detail || 'Failed to cancel subscription.' });
      setShowCancelModal(false);
    } finally {
      setCancelling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/notifications/settings', settings);
      setStatus({ type: 'success', message: 'Settings saved successfully' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Settings</h1>
          <p className="text-slate-400">Configure your daily alerts and notifications</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      {activatingPlan && (
        <div className="p-4 rounded-xl flex items-center gap-3 bg-purple-500/10 text-purple-300 border border-purple-500/20 animate-in slide-in-from-top-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="font-medium">Activating your subscription…</span>
        </div>
      )}

      {status && (
        <div className={cn(
          "p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2",
          status.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
        )}>
          {status.type === 'success' ? <Sparkles size={18} /> : <AlertTriangle size={18} />}
          <span className="font-medium">{status.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Notifications */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 mb-4">
              <Smartphone size={24} />
            </div>
            <CardTitle className="text-white">Device Notifications</CardTitle>
            <CardDescription className="text-slate-500">Get alerts even when the app is closed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-slate-200">Push Notifications</p>
                <p className="text-xs text-slate-500">
                  {permission === 'denied' ? 'Blocked in browser' : isSubscribed ? 'Subscribed' : 'Off'}
                </p>
              </div>
              <button
                onClick={handleTogglePush}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  isSubscribed ? "bg-emerald-500" : "bg-slate-800"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                  isSubscribed ? "left-7" : "left-1"
                )} />
              </button>
            </div>

            <div className="space-y-4">
               <div className="flex items-center gap-3 text-sm text-slate-400">
                  <BellRing size={16} className="text-emerald-500" />
                  <span>Stay updated with morning alerts</span>
               </div>
               <div className="flex items-center gap-3 text-sm text-slate-400">
                  <Shield size={16} className="text-blue-500" />
                  <span>Privacy focused & Secure</span>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Content */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 mb-4">
              <Bell size={24} />
            </div>
            <CardTitle className="text-white">Daily Alerts</CardTitle>
            <CardDescription className="text-slate-500">Select what you want to be notified about</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <span className="font-bold text-slate-200">Yesterday&apos;s Profit</span>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500" 
                checked={settings.daily_summary_enabled}
                onChange={e => setSettings({...settings, daily_summary_enabled: e.target.checked})}
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <span className="font-bold text-slate-200">Low Stock Alerts</span>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500" 
                checked={settings.low_stock_alert_enabled}
                onChange={e => setSettings({...settings, low_stock_alert_enabled: e.target.checked})}
              />
            </label>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-slate-200 font-bold">
                <Clock size={16} className="text-emerald-500" />
                Alert Time
              </div>
              <input 
                type="time" 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                value={settings.alert_time}
                onChange={e => setSettings({...settings, alert_time: e.target.value})}
              />
              <p className="text-[10px] text-slate-500 italic">Notifications will arrive daily at this time.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Subscription Management ── */}
      {profile.subscriptionPlan && (
        <Card className={cn(
          'border',
          profile.subscriptionStatus === 'cancelled'
            ? 'bg-slate-900 border-red-500/20'
            : 'bg-slate-900 border-slate-800'
        )}>
          <CardHeader>
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 mb-4">
              <CreditCard size={24} />
            </div>
            <CardTitle className="text-white">Subscription</CardTitle>
            <CardDescription className="text-slate-500">Manage your current plan and billing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Plan info row */}
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-slate-200">
                  {planLabel(profile.subscriptionPlan)} Plan
                  <span className={cn(
                    'ml-2 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider',
                    profile.subscriptionStatus === 'trial'      ? 'bg-amber-500/20 text-amber-400' :
                    profile.subscriptionStatus === 'cancelled'  ? 'bg-red-500/20 text-red-400' :
                    profile.subscriptionStatus === 'expired'    ? 'bg-red-500/20 text-red-400' :
                    profile.subscriptionStatus === 'active'     ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-slate-700 text-slate-400'
                  )}>
                    {profile.subscriptionStatus === 'trial'     ? 'Free Trial' :
                     profile.subscriptionStatus === 'cancelled' ? 'Cancelled' :
                     profile.subscriptionStatus === 'expired'   ? 'Expired' :
                     profile.subscriptionStatus === 'active'    ? 'Active' :
                     profile.subscriptionStatus}
                  </span>
                </p>
                {profile.subscriptionExpiry && (
                  <p className="text-xs text-slate-500">
                    {profile.subscriptionStatus === 'cancelled'
                      ? `Access ends on ${new Date(profile.subscriptionExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                      : profile.subscriptionStatus === 'trial'
                        ? `Free trial ends on ${new Date(profile.subscriptionExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : profile.subscriptionStatus === 'expired'
                          ? `Expired on ${new Date(profile.subscriptionExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} — renew to restore full access`
                          : `Renews / expires on ${new Date(profile.subscriptionExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>{PLAN_LIMITS[profile.subscriptionPlan]?.maxProducts === Infinity ? 'Unlimited' : PLAN_LIMITS[profile.subscriptionPlan]?.maxProducts?.toLocaleString('en-IN')} products</p>
                <p>{PLAN_LIMITS[profile.subscriptionPlan]?.maxUdharCustomers === Infinity ? 'Unlimited' : PLAN_LIMITS[profile.subscriptionPlan]?.maxUdharCustomers} customers</p>
              </div>
            </div>

            {/* Cancel button — only show if not already cancelled */}
            {profile.subscriptionStatus !== 'cancelled' ? (
              <button
                onClick={() => { setCancelReason(''); setShowCancelModal(true); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all font-semibold text-sm"
              >
                <X size={16} /> Cancel Subscription
              </button>
            ) : (
              <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-sm text-red-400">
                Your subscription is cancelled. Access continues until{' '}
                <strong>
                  {profile.subscriptionExpiry
                    ? new Date(profile.subscriptionExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'end of billing period'}
                </strong>
                . After that you will move to the Free plan.
              </div>
            )}

            <p className="text-xs text-slate-600 text-center">
              After cancellation your account stays active until the billing period ends.
              Cancel within 30 days of payment for a full refund under our money-back guarantee.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Billing History ── */}
      {paymentHistory.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 mb-4">
              <Clock size={24} />
            </div>
            <CardTitle className="text-white">Billing History</CardTitle>
            <CardDescription className="text-slate-500">View past payments and download receipts</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800 border-t border-slate-800">
              {paymentHistory.map(tx => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      ₹{tx.amount} &middot; <span className="capitalize">{tx.plan || 'Unknown'}</span> Plan
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} &middot; ID: {tx.txnid}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider',
                      tx.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      tx.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-red-500/10 text-red-400 border border-red-500/20'
                    )}>
                      {tx.status}
                    </span>
                    {tx.status === 'success' && (
                      <a href={`/${locale}/receipt/${tx.txnid}`} target="_blank" rel="noopener noreferrer" 
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                        View Receipt
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Pricing Plans ── */}
      {(() => {
        const currentPlan = profile.subscriptionPlan || 'shop';
        const isPaid = profile.subscriptionStatus === 'active';
        const isTrial = profile.subscriptionStatus === 'trial';
        const PLAN_RANK: Record<string, number> = { starter: 0, shop: 0, vyapar: 1, wholesale: 2 };
        const plans = [
          {
            key: 'shop', name: 'Dukaan', price: 299, color: 'sky',
            tagline: 'Perfect for small retail stores',
            features: ['Unlimited products', 'Smart billing & GST', 'Udhar Khata (100 customers)', 'Stock management', 'Basic reports', 'AI Expert', 'Refer & Earn'],
          },
          {
            key: 'vyapar', name: 'Vyapar', price: 499, color: 'indigo', popular: true,
            tagline: 'For growing multi-branch businesses',
            features: ['Everything in Dukaan', 'Unlimited Udhar customers', 'Multiple shops (up to 3)', 'Auto WhatsApp + Email bills', 'Advanced reports & analytics', 'AI product scan', 'EMI billing'],
          },
          {
            key: 'wholesale', name: 'Udyog', price: 999, color: 'purple',
            tagline: 'For wholesalers & distributors',
            features: ['Everything in Vyapar', 'Unlimited shops', 'Godown / warehouse management', 'Dukandar management', 'Stock alerts to retailers', 'Dukandar credit tracking', 'Priority support'],
          },
        ];
        const colorMap: Record<string, { bg: string; border: string; badge: string; btn: string; text: string }> = {
          sky:    { bg: 'bg-sky-500/5',    border: 'border-sky-500/30',    badge: 'bg-sky-500 text-white',    btn: 'bg-sky-500 hover:bg-sky-400 text-white',    text: 'text-sky-400' },
          indigo: { bg: 'bg-indigo-500/5', border: 'border-indigo-500/40', badge: 'bg-indigo-500 text-white', btn: 'bg-indigo-500 hover:bg-indigo-400 text-white', text: 'text-indigo-400' },
          purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/30', badge: 'bg-purple-500 text-white', btn: 'bg-purple-500 hover:bg-purple-400 text-white', text: 'text-purple-400' },
        };
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" />
              <h2 className="text-base font-bold text-slate-200">Available Plans</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map(plan => {
                const c = colorMap[plan.color];
                const isCurrent = currentPlan === plan.key || (plan.key === 'shop' && (currentPlan === 'starter' || !currentPlan));
                const isUpgrade = !isCurrent && PLAN_RANK[plan.key] > PLAN_RANK[currentPlan];
                return (
                  <div key={plan.key} className={cn('relative rounded-2xl border p-5 flex flex-col gap-4', c.bg, isCurrent ? (isPaid ? 'border-emerald-500/50' : 'border-amber-500/50') : c.border)}>
                    {plan.popular && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-indigo-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">Most Popular</span>
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className={cn(
                          'text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-lg',
                          isPaid ? 'bg-emerald-500 text-slate-900' : 'bg-amber-500 text-slate-900',
                        )}>
                          {isPaid ? 'Current Plan' : 'Current — On Trial'}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider', c.badge)}>{plan.name}</span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className={cn('text-3xl font-black', c.text)}>₹{plan.price}</span>
                        <span className="text-slate-500 text-sm">/month</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{plan.tagline}</p>
                    </div>
                    <ul className="space-y-1.5 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {isCurrent && isPaid ? (
                      <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center">✓ Active</div>
                    ) : isCurrent && isTrial ? (
                      <div className="w-full py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold text-center">✓ On Trial</div>
                    ) : isTrial ? (
                      // Free plan switch while the trial is running (keeps remaining days).
                      <a href={`/${locale}/payment?plan=${plan.key}`}
                        className={cn('w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all block', c.btn)}>
                        Switch (Free)
                      </a>
                    ) : isUpgrade ? (
                      <a href={`/${locale}/payment?plan=${plan.key}`}
                        className={cn('w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all block', c.btn)}>
                        Upgrade — ₹{plan.price}/mo
                      </a>
                    ) : (
                      <a href={`/${locale}/payment?plan=${plan.key}`}
                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold text-center transition-all block">
                        {isPaid ? `Switch — ₹${plan.price}/mo` : `Subscribe — ₹${plan.price}/mo`}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-600 text-center">Billed monthly via PayU · 30-day money-back guarantee · Cancel anytime</p>
          </div>
        );
      })()}

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Cancel Subscription?</h2>
                <p className="text-sm text-slate-400 mt-1">
                  You keep full access until your billing period ends, then move to limited
                  (read-only) access. Cancel within 30 days of payment for a full refund.
                </p>
              </div>
            </div>

            {/* What they will lose */}
            <div className="bg-slate-950 rounded-xl p-4 space-y-2 border border-slate-800">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">You will lose access to</p>
              {profile.subscriptionPlan === 'business' && (
                <>
                  <p className="text-xs text-slate-400">• Bulk invoicing &amp; party ledger</p>
                  <p className="text-xs text-slate-400">• Dealer / distributor accounts</p>
                  <p className="text-xs text-slate-400">• Custom price lists &amp; GST/Tally export</p>
                </>
              )}
              {(profile.subscriptionPlan === 'professional' || profile.subscriptionPlan === 'business') && (
                <>
                  <p className="text-xs text-slate-400">• Products above 500 (will be hidden, not deleted)</p>
                  <p className="text-xs text-slate-400">• Udhar customers above 100</p>
                  <p className="text-xs text-slate-400">• PDF &amp; CSV report export</p>
                </>
              )}
              <p className="text-xs text-slate-400">• Priority support</p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Reason (optional — helps us improve)
              </label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              >
                <option value="">Select a reason…</option>
                <option value="too_expensive">Too expensive</option>
                <option value="not_using">Not using enough features</option>
                <option value="switching_tool">Switching to another tool</option>
                <option value="business_closed">Business closed / paused</option>
                <option value="missing_feature">Missing feature I need</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-semibold hover:bg-slate-700 transition-all"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">Loading settings…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
