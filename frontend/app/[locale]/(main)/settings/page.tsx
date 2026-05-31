
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bell, Shield, BellRing, Smartphone, Clock, Save, Loader2, CheckCircle, CreditCard, AlertTriangle, X, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import { planLabel, PLAN_LIMITS } from '@/lib/planGates';

// Inner component uses useSearchParams — must be wrapped in Suspense
function SettingsPageInner() {
  const t = useTranslations('Settings');
  const { profile, fetchProfile } = useBusinessStore();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [activatingPlan, setActivatingPlan] = useState(false);

  // Handle return from PayU payment — activate plan automatically
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success');
    if (paymentSuccess !== '1') return;

    const plan      = searchParams.get('plan') || '';
    const trialEnd  = searchParams.get('trial_end') || '';
    const txnid     = searchParams.get('txnid') || '';

    if (!plan) return;

    setActivatingPlan(true);
    api.post('/payments/activate-plan', { plan, trial_end: trialEnd, txnid })
      .then(() => fetchProfile())
      .then(() => {
        setStatus({ type: 'success', message: `🎉 ${planLabel(plan)} activated! Your 14-day free trial has started.` });
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
      await api.post('/payments/cancel-subscription', { reason: cancelReason });
      await fetchProfile();
      setCancelDone(true);
      setShowCancelModal(false);
      setStatus({ type: 'success', message: 'Subscription cancelled. You retain access until your billing period ends.' });
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
                    profile.subscriptionStatus === 'trialing'   ? 'bg-emerald-500/20 text-emerald-400' :
                    profile.subscriptionStatus === 'cancelled'  ? 'bg-red-500/20 text-red-400' :
                    profile.subscriptionStatus === 'active'     ? 'bg-sky-500/20 text-sky-400' :
                    'bg-slate-700 text-slate-400'
                  )}>
                    {profile.subscriptionStatus === 'trialing'  ? 'Trial Active' :
                     profile.subscriptionStatus === 'cancelled' ? 'Cancelled' :
                     profile.subscriptionStatus === 'active'    ? 'Active' :
                     profile.subscriptionStatus}
                  </span>
                </p>
                {profile.subscriptionExpiry && (
                  <p className="text-xs text-slate-500">
                    {profile.subscriptionStatus === 'cancelled'
                      ? `Access ends on ${new Date(profile.subscriptionExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
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
              After cancellation your account stays active until the billing period ends. No refund for used days.
            </p>
          </CardContent>
        </Card>
      )}

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
                  You will keep full access until your billing period ends. After that your plan downgrades to Free.
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
