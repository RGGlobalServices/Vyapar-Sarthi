
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bell, Shield, BellRing, Smartphone, Clock, Save, Loader2, CheckCircle, CreditCard, AlertTriangle, X, Sparkles, Zap, MonitorSmartphone, LogOut, Store, Plus } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig, BusinessType } from '@/lib/businessConfig';
import { ExportButton } from '@/lib/hooks/useExport';
import { planLabel, PLAN_LIMITS, nextUpgrade } from '@/lib/planGates';
import { getBaseAmount, getGstAmount, getTotalAmount, YEARLY_DISCOUNT_PERCENT, type BillingCycle } from '@/lib/subscriptionPricing';
import { useLocale } from 'next-intl';

// Inner component uses useSearchParams — must be wrapped in Suspense
function SettingsPageInner() {
  const t = useTranslations('Settings');
  const locale = useLocale();
  const { profile, fetchProfile, updateProfile, allShops, allShopAccess, setAllShopAccess, selectedShopIds, setSelectedShopIds } = useBusinessStore();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [activatingPlan, setActivatingPlan] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [savingGstProfit, setSavingGstProfit] = useState(false);
  const [savingAllShopAccess, setSavingAllShopAccess] = useState(false);
  const [allShopsSummary, setAllShopsSummary] = useState<{
    shops: { shopId: string; shopName: string; shopCode: string | null; salesTotal: number; profitTotal: number; stockValue: number; lowStockCount: number; productCount: number; udharOutstanding: number }[];
    grandTotal: { salesTotal: number; profitTotal: number; stockValue: number; lowStockCount: number; productCount: number; udharOutstanding: number };
  } | null>(null);
  const [loadingAllShopsSummary, setLoadingAllShopsSummary] = useState(false);

  const handleToggleAllShopAccess = async (checked: boolean) => {
    setSavingAllShopAccess(true);
    try {
      await setAllShopAccess(checked);
      setStatus({
        type: 'success',
        message: checked
          ? 'All Shop Access enabled — Products, Stock and Reports now show every shop you own.'
          : 'All Shop Access disabled — back to single-shop view.',
      });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save All Shop Access preference.' });
    } finally {
      setSavingAllShopAccess(false);
    }
  };

  // null = "not yet touched this visit", so the picker mirrors the saved
  // selection directly. Becomes a real Set the moment the owner ticks/
  // unticks a shop, so Save/Cancel act on a local draft instead of writing
  // on every click.
  const [pendingSelected, setPendingSelected] = useState<Set<string> | null>(null);
  const [showAddShop, setShowAddShop] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);

  // Empty saved selection = never customized yet, which every pooled route
  // already treats as "every owned shop" — mirror that here so the picker
  // opens with everything ticked instead of looking empty.
  const savedSelectedIds = selectedShopIds.length > 0 ? selectedShopIds : allShops.map((s) => s.id);
  const effectiveSelected = pendingSelected ?? new Set(savedSelectedIds);
  const selectedShopsList = allShops.filter((s) => effectiveSelected.has(s.id));
  const remainingShops = allShops.filter((s) => !effectiveSelected.has(s.id));
  const hasPendingChanges =
    pendingSelected !== null &&
    (pendingSelected.size !== savedSelectedIds.length || savedSelectedIds.some((id) => !pendingSelected.has(id)));

  const addToSelection = (shopId: string) => {
    setPendingSelected(new Set([...effectiveSelected, shopId]));
  };
  const removeFromSelection = (shopId: string) => {
    const next = new Set(effectiveSelected);
    next.delete(shopId);
    setPendingSelected(next);
  };

  const handleSaveSelection = async () => {
    if (effectiveSelected.size === 0) return;
    setSavingSelection(true);
    try {
      await setSelectedShopIds(Array.from(effectiveSelected));
      setPendingSelected(null);
      setShowAddShop(false);
      setStatus({ type: 'success', message: 'Selected shops saved.' });
      setTimeout(() => setStatus(null), 3000);
      // setSelectedShopIds updates the store optimistically, before its PATCH
      // actually lands — the effect below reacts to that optimistic change
      // and can race the save, fetching the summary just before the new
      // selection is committed server-side. Re-fetch explicitly now that the
      // await above has confirmed the save landed, so the table is never
      // left showing the pre-save scope.
      setLoadingAllShopsSummary(true);
      api.get('/reports/all-shops-summary')
        .then((res) => setAllShopsSummary(res.data))
        .catch(() => {})
        .finally(() => setLoadingAllShopsSummary(false));
    } catch {
      setStatus({ type: 'error', message: 'Failed to save selected shops.' });
    } finally {
      setSavingSelection(false);
    }
  };

  const handleToggleGstInclusiveProfit = async (checked: boolean) => {
    setSavingGstProfit(true);
    try {
      await updateProfile({ gstInclusiveProfit: checked });
      setStatus({ type: 'success', message: 'Profit calculation preference saved.' });
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save profit calculation preference.' });
    } finally {
      setSavingGstProfit(false);
    }
  };

  // Refresh profile on mount to get latest plan
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Only fetch the multi-shop summary for owners it's actually relevant to.
  // Deliberately NOT keyed on selectedShopIds: setSelectedShopIds updates the
  // store optimistically before its PATCH lands, and this app's shared DB
  // pooler has wildly variable latency (documented elsewhere in this repo) —
  // reacting to that optimistic change here raced the explicit post-save
  // re-fetch in handleSaveSelection below, and whichever response happened
  // to land LAST won, occasionally leaving the table showing the pre-save
  // scope. handleSaveSelection re-fetches once, only after its await
  // confirms the save actually landed, which is the only trigger this needs.
  useEffect(() => {
    if (allShops.length <= 1) return;
    setLoadingAllShopsSummary(true);
    api.get('/reports/all-shops-summary')
      .then((res) => setAllShopsSummary(res.data))
      .catch(() => setAllShopsSummary(null))
      .finally(() => setLoadingAllShopsSummary(false));
  }, [allShops.length]);

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
    alert_time: '08:00',
    udharWhatsAppEnabled: false,
    udharEmailEnabled: false
  });

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const [userProfile, setUserProfile] = useState<any>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinForm, setAdminPinForm] = useState({ currentPassword: '', newPin: '' });
  const [savingPin, setSavingPin] = useState(false);
  const [pinStatus, setPinStatus] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [res, profileRes, sessionsRes] = await Promise.all([
          api.get('/notifications/settings'),
          api.get('/user/profile'),
          api.get('/auth/sessions').catch(() => ({ data: [] }))
        ]);
        setSettings(prev => ({ ...prev, ...res.data }));
        setUserProfile(profileRes.data);
        setSessions(sessionsRes.data || []);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }

      // Check push subscription asynchronously without blocking the UI
      if ('Notification' in window && 'serviceWorker' in navigator) {
        try {
          setPermission(Notification.permission);
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
          }
        } catch (err) {
          console.error('Failed to get push subscription:', err);
        }
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
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          await subscription?.unsubscribe();
        }
        setIsSubscribed(false);
      } else {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'granted') {
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration) {
            throw new Error('Push notifications require a Service Worker, which was not found in this environment.');
          }
          if (!registration.active) {
            throw new Error('The Service Worker is not active yet. This is normal in development mode. In production, please refresh and try again.');
          }
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
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('no active Service Worker')) {
        alert('Push notifications require an active Service Worker. This is usually disabled in development mode or private browsing.');
      } else {
        alert('Failed to update push subscription: ' + msg);
      }
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
    setSavingPin(true);
    try {
      await api.patch('/notifications/settings', settings);
      setStatus({ type: 'success', message: 'Settings saved successfully' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setSavingPin(false);
    }
  };

  const handleSaveAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPin(true);
    setPinStatus(null);
    try {
      await api.patch('/user/profile', {
        currentPassword: adminPinForm.currentPassword,
        adminPin: adminPinForm.newPin || undefined,
        removeAdminPin: !adminPinForm.newPin
      });
      setUserProfile((prev: any) => ({ ...prev, hasAdminPin: !!adminPinForm.newPin }));
      setPinStatus({ type: 'success', message: 'Admin PIN updated successfully.' });
      setTimeout(() => setShowAdminPinModal(false), 1500);
    } catch (err: any) {
      setPinStatus({ type: 'error', message: err.response?.data?.detail || 'Failed to update PIN.' });
    } finally {
      setSavingPin(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    if (!confirm('Are you sure you want to log out this device?')) return;
    setRevokingId(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      setStatus({ type: 'success', message: 'Device logged out successfully.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to log out device.' });
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{t('title')}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t('desc') || 'Configure your daily alerts and notifications'}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {t('save')}
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
        {/* Security & Access */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm md:col-span-2">
          <CardHeader>
            <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 dark:text-red-400 mb-4">
              <Shield size={24} />
            </div>
            <CardTitle className="text-slate-900 dark:text-white">Security & Access</CardTitle>
            <CardDescription className="text-slate-500">Protect access to sensitive features and roles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-200">Admin Access PIN</p>
                <p className="text-xs text-slate-500">Require a PIN to switch from Staff to Admin role in the sidebar.</p>
              </div>
              <button
                onClick={() => {
                  setAdminPinForm({ currentPassword: '', newPin: '' });
                  setPinStatus(null);
                  setShowAdminPinModal(true);
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                  userProfile?.hasAdminPin 
                    ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700"
                    : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                )}
              >
                {userProfile?.hasAdminPin ? 'Change PIN' : 'Set PIN'}
              </button>
            </div>

            {/* Active Sessions List */}
            <div className="mt-6 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
                <MonitorSmartphone size={18} className="text-slate-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Active Devices & Sessions</h3>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {sessions.map(s => (
                  <div key={s.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        {s.os === 'iOS' || s.os === 'Android' ? <Smartphone size={18} /> : <MonitorSmartphone size={18} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-slate-200 text-sm">{s.device}</p>
                          {s.isCurrent && (
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                              This Device
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.ip} &middot; Active {new Date(s.lastSeen).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        disabled={revokingId === s.id}
                        className="text-red-500 hover:bg-red-500/10 p-2 rounded-xl transition-colors disabled:opacity-50"
                        title="Log out this device"
                      >
                        {revokingId === s.id ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
                      </button>
                    )}
                  </div>
                ))}
                {sessions.length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-500">No active sessions found.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Profit */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm md:col-span-2">
          <CardHeader>
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 dark:text-amber-400 mb-4">
              <Zap size={24} />
            </div>
            <CardTitle className="text-slate-900 dark:text-white">Pricing & Profit</CardTitle>
            <CardDescription className="text-slate-500">Choose how the product catalog calculates profit margin</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1 pr-4">
                <p className="font-bold text-slate-800 dark:text-slate-200">GST Inclusive Profit Calculation</p>
                <p className="text-xs text-slate-500">
                  {profile.gstInclusiveProfit
                    ? 'On — GST is removed from the selling price before comparing to cost (e.g. ₹266 selling, 5% GST → ₹253.33 base, minus cost).'
                    : 'Off (default) — Profit = Selling Price − Cost Price, GST left untouched. Matches simple shopkeeper markup.'}
                </p>
              </div>
              <button
                onClick={() => handleToggleGstInclusiveProfit(!profile.gstInclusiveProfit)}
                disabled={savingGstProfit}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-50",
                  profile.gstInclusiveProfit ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-800"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                  profile.gstInclusiveProfit ? "left-7" : "left-1"
                )} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* All Shop Access — only meaningful for owners of 2+ shops */}
        {allShops.length > 1 && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm md:col-span-2">
            <CardHeader>
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-4">
                <Store size={24} />
              </div>
              <CardTitle className="text-slate-900 dark:text-white">All Shop Access</CardTitle>
              <CardDescription className="text-slate-500">See every shop you own in one place, or keep them separate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1 pr-4">
                  <p className="font-bold text-slate-800 dark:text-slate-200">Show all {allShops.length} shops together</p>
                  <p className="text-xs text-slate-500">
                    {allShopAccess
                      ? `On — Products, Stock, Dashboard and Reports pool ${selectedShopIds.length > 0 ? `the ${selectedShopIds.length} shop${selectedShopIds.length === 1 ? '' : 's'} selected below` : 'every shop you own'}, each row labeled with its shop. Billing and Import still work on only your currently open shop.`
                      : 'Off (default) — every page only shows the shop you currently have open, exactly as before.'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAllShopAccess(!allShopAccess)}
                  disabled={savingAllShopAccess}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-50",
                    allShopAccess ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    allShopAccess ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {allShopAccess && (
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selected shops</p>
                    {hasPendingChanges && (
                      <button
                        onClick={handleSaveSelection}
                        disabled={savingSelection || effectiveSelected.size === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                      >
                        {savingSelection ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save Selection
                      </button>
                    )}
                  </div>

                  {effectiveSelected.size === 0 && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">Select at least one shop.</p>
                  )}

                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedShopsList.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{s.name}</span>
                        <span className="text-slate-400">{getBusinessConfig((s.businessType || 'general') as BusinessType).label}</span>
                        <button type="button" onClick={() => removeFromSelection(s.id)} className="text-slate-400 hover:text-red-500">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {!showAddShop && remainingShops.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAddShop(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                      >
                        <Plus size={12} /> Add Shop
                      </button>
                    )}
                  </div>

                  {showAddShop && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Remaining shops</p>
                        <button type="button" onClick={() => setShowAddShop(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={14} />
                        </button>
                      </div>
                      {remainingShops.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">All shops are already selected.</p>
                      ) : (
                        <div className="space-y-1">
                          {remainingShops.map((s) => (
                            <label key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => addToSelection(s.id)}
                                className="w-4 h-4 rounded accent-emerald-500"
                              />
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{s.name}</span>
                              <span className="text-[11px] text-slate-400">{getBusinessConfig((s.businessType || 'general') as BusinessType).label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shop-wise summary</p>
                  {allShopsSummary && allShopsSummary.shops.length > 0 && (
                    <ExportButton
                      filename="all_shops_summary"
                      title="All Shops Summary"
                      columns={[
                        { key: 'shopName', label: 'Shop' },
                        { key: 'salesTotal', label: 'Sales', type: 'currency' },
                        { key: 'profitTotal', label: 'Profit', type: 'currency' },
                        { key: 'stockValue', label: 'Stock Value', type: 'currency' },
                        { key: 'lowStockCount', label: 'Low Stock Items', type: 'number' },
                        { key: 'udharOutstanding', label: 'Udhar Outstanding', type: 'currency' },
                      ]}
                      data={allShopsSummary.shops}
                      summary={[
                        { label: 'Total Sales', value: `₹${allShopsSummary.grandTotal.salesTotal.toLocaleString('en-IN')}` },
                        { label: 'Total Profit', value: `₹${allShopsSummary.grandTotal.profitTotal.toLocaleString('en-IN')}`, tone: 'positive' },
                        { label: 'Total Stock Value', value: `₹${allShopsSummary.grandTotal.stockValue.toLocaleString('en-IN')}` },
                        { label: 'Total Udhar Outstanding', value: `₹${allShopsSummary.grandTotal.udharOutstanding.toLocaleString('en-IN')}`, tone: 'negative' },
                      ]}
                    />
                  )}
                </div>
                {loadingAllShopsSummary ? (
                  <div className="flex items-center justify-center py-8 text-slate-400">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : allShopsSummary && allShopsSummary.shops.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                        <tr>
                          <th className="px-4 py-2.5">Shop</th>
                          <th className="px-4 py-2.5 text-right">Sales</th>
                          <th className="px-4 py-2.5 text-right">Profit</th>
                          <th className="px-4 py-2.5 text-right">Stock Value</th>
                          <th className="px-4 py-2.5 text-right">Low Stock</th>
                          <th className="px-4 py-2.5 text-right">Udhar Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allShopsSummary.shops.map((s) => (
                          <tr key={s.shopId} className="text-slate-700 dark:text-slate-300">
                            <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">{s.shopName}</td>
                            <td className="px-4 py-2.5 text-right">₹{s.salesTotal.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2.5 text-right">₹{s.profitTotal.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2.5 text-right">₹{s.stockValue.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2.5 text-right">
                              {s.lowStockCount > 0 ? (
                                <span className="text-orange-600 dark:text-orange-400 font-bold">{s.lowStockCount}</span>
                              ) : '0'}
                            </td>
                            <td className="px-4 py-2.5 text-right">₹{s.udharOutstanding.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-800">
                        <tr>
                          <td className="px-4 py-2.5">Total</td>
                          <td className="px-4 py-2.5 text-right">₹{allShopsSummary.grandTotal.salesTotal.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right">₹{allShopsSummary.grandTotal.profitTotal.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right">₹{allShopsSummary.grandTotal.stockValue.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right">{allShopsSummary.grandTotal.lowStockCount}</td>
                          <td className="px-4 py-2.5 text-right">₹{allShopsSummary.grandTotal.udharOutstanding.toLocaleString('en-IN')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-6">No shop data yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device Notifications */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 dark:text-blue-400 mb-4">
              <Smartphone size={24} />
            </div>
            <CardTitle className="text-slate-900 dark:text-white">{t('deviceNotif') || 'Device Notifications'}</CardTitle>
            <CardDescription className="text-slate-500">{t('deviceNotifDesc') || 'Get alerts even when the app is closed'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-200">{t('pushNotif') || 'Push Notifications'}</p>
                <p className="text-xs text-slate-500">
                  {permission === 'denied' ? 'Blocked in browser' : isSubscribed ? (t('subscribed') || 'Subscribed') : 'Off'}
                </p>
              </div>
              <button
                onClick={handleTogglePush}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  isSubscribed ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-800"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                  isSubscribed ? "left-7" : "left-1"
                )} />
              </button>
            </div>

            <div className="space-y-4">
               <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <BellRing size={16} className="text-emerald-500" />
                  <span>{t('morningAlerts') || 'Stay updated with morning alerts'}</span>
               </div>
               <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Shield size={16} className="text-blue-500" />
                  <span>{t('privacySecure') || 'Privacy focused & Secure'}</span>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Content */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 dark:text-emerald-400 mb-4">
              <Bell size={24} />
            </div>
            <CardTitle className="text-slate-900 dark:text-white">{t('dailyAlerts') || 'Daily Alerts'}</CardTitle>
            <CardDescription className="text-slate-500">{t('dailyAlertsDesc') || 'Select what you want to be notified about'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <span className="font-bold text-slate-800 dark:text-slate-200">{t('yesterdayProfit') || "Yesterday's Profit"}</span>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500" 
                checked={!!settings.daily_summary_enabled}
                onChange={e => setSettings({...settings, daily_summary_enabled: e.target.checked})}
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <span className="font-bold text-slate-800 dark:text-slate-200">{t('lowStock') || 'Low Stock Alerts'}</span>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500" 
                checked={!!settings.low_stock_alert_enabled}
                onChange={e => setSettings({...settings, low_stock_alert_enabled: e.target.checked})}
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">{t('udharWA') || 'Udhar WhatsApp Reminders'}</span>
                <span className="text-[10px] text-slate-500">{t('udharWADesc') || 'Send automatic reminders to customers via WhatsApp'}</span>
              </div>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500" 
                checked={!!settings.udharWhatsAppEnabled}
                onChange={e => setSettings({...settings, udharWhatsAppEnabled: e.target.checked})}
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">{t('udharEmail') || 'Udhar Email Reminders'}</span>
                <span className="text-[10px] text-slate-500">{t('udharEmailDesc') || 'Send automatic reminders to customers via Email'}</span>
              </div>
              <input 
                type="checkbox" 
                className="w-5 h-5 accent-emerald-500" 
                checked={!!settings.udharEmailEnabled}
                onChange={e => setSettings({...settings, udharEmailEnabled: e.target.checked})}
              />
            </label>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold">
                <Clock size={16} className="text-emerald-500" />
                {t('alertTime') || 'Alert Time'}
              </div>
              <input 
                type="time" 
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-slate-900 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
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
          'border shadow-sm',
          profile.subscriptionStatus === 'cancelled'
            ? 'bg-red-50/50 dark:bg-slate-900 border-red-500/20'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        )}>
          <CardHeader>
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 dark:text-purple-400 mb-4">
              <CreditCard size={24} />
            </div>
            <CardTitle className="text-slate-900 dark:text-white">{t('subscriptionTitle') || 'Subscription'}</CardTitle>
            <CardDescription className="text-slate-500">{t('subscriptionDesc') || 'Manage your current plan and billing'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Plan info row */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <p className="font-bold text-slate-900 dark:text-slate-200">
                  {planLabel(profile.subscriptionPlan)} Plan
                  <span className={cn(
                    'ml-2 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider',
                    profile.subscriptionStatus === 'trial'      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                    profile.subscriptionStatus === 'cancelled'  ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                    profile.subscriptionStatus === 'expired'    ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                    profile.subscriptionStatus === 'active'     ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
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
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all font-semibold text-sm"
              >
                <X size={16} /> {t('cancelSubscription') || 'Cancel Subscription'}
              </button>
            ) : (
              <div className="p-4 bg-red-50 dark:bg-red-500/5 border border-red-500/20 rounded-xl text-sm text-red-500 dark:text-red-400">
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
              {t('cancelDesc') || 'After cancellation your account stays active until the billing period ends. Cancel within 30 days of payment for a full refund under our money-back guarantee.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Billing History ── */}
      {paymentHistory.length > 0 && (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-4">
              <Clock size={24} />
            </div>
            <CardTitle className="text-slate-900 dark:text-white">{t('billingHistory') || 'Billing History'}</CardTitle>
            <CardDescription className="text-slate-500">{t('billingHistoryDesc') || 'View past payments and download receipts'}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
              {paymentHistory.map(tx => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                      ₹{tx.amount} &middot; <span className="capitalize">{tx.plan || 'Unknown'}</span> Plan
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} &middot; ID: {tx.txnid}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider',
                      tx.status === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
                      tx.status === 'pending' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
                      'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                    )}>
                      {tx.status}
                    </span>
                    {tx.status === 'success' && (
                      <a href={`/${locale}/receipt/${tx.txnid}`} target="_blank" rel="noopener noreferrer" 
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-1">
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
            key: 'shop', name: 'Dukaan', color: 'sky',
            tagline: 'Perfect for small retail stores',
            features: [
              'Unlimited products',
              'Smart billing (GST & Non-GST)',
              'Udhar Khata (up to 100 customers)',
              'Stock management & low-stock alerts',
              'Expense tracking',
              'Returns management',
              'Sales reports & dashboard',
              'Calendar & event reminders',
              'Multi-language (EN, HI, MR)',
              'Barcode scanner support',
              'AI Expert assistant',
              '1 shop only',
            ],
          },
          {
            key: 'vyapar', name: 'Vyapar', color: 'indigo', popular: true,
            tagline: 'For growing multi-branch businesses',
            features: [
              'Everything in Dukaan',
              'Unlimited Udhar customers',
              'Multiple shops (up to 3)',
              'Auto WhatsApp & Email bills',
              'Staff management & attendance',
              'Data import (Excel, CSV, AI scan)',
              'Advanced reports & analytics',
              'EMI billing (electronics)',
              'Refer & Earn program',
              'AI product scan & recognition',
            ],
          },
          {
            key: 'wholesale', name: 'Udyog', color: 'purple',
            tagline: 'For wholesalers & distributors',
            features: [
              'Everything in Vyapar',
              'Unlimited shops',
              'Godown / warehouse management',
              'Stock transfers between godowns',
              'Party & supplier management',
              'Purchase order management',
              'Dukandar management & alerts',
              'Dukandar credit tracking',
              'Wholesale billing UI',
              'Batch & inventory tracking',
              'Priority support',
            ],
          },
        ];
        const colorMap: Record<string, { bg: string; border: string; badge: string; btn: string; text: string }> = {
          sky:    { bg: 'bg-sky-500/5',    border: 'border-sky-500/30',    badge: 'bg-sky-500 text-white',    btn: 'bg-sky-500 hover:bg-sky-400 text-white',    text: 'text-sky-400' },
          indigo: { bg: 'bg-indigo-500/5', border: 'border-indigo-500/40', badge: 'bg-indigo-500 text-white', btn: 'bg-indigo-500 hover:bg-indigo-400 text-white', text: 'text-indigo-400' },
          purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/30', badge: 'bg-purple-500 text-white', btn: 'bg-purple-500 hover:bg-purple-400 text-white', text: 'text-purple-400' },
        };
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-emerald-500 dark:text-emerald-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-200">{t('availablePlans') || 'Available Plans'}</h2>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold flex-wrap">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={cn('px-3 py-1.5 rounded-lg transition-colors', billingCycle === 'monthly' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('yearly')}
                    className={cn('px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5', billingCycle === 'yearly' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}
                  >
                    Yearly
                    <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{YEARLY_DISCOUNT_PERCENT}% OFF</span>
                  </button>
                  <button
                    onClick={() => setBillingCycle('5_years')}
                    className={cn('px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5', billingCycle === '5_years' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500')}
                  >
                    5 Years
                    <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{YEARLY_DISCOUNT_PERCENT}% OFF</span>
                  </button>
                </div>
                {billingCycle === 'yearly' && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mr-2 animate-in fade-in slide-in-from-top-1">
                    Pay for 11 months, get 1 month FREE
                  </span>
                )}
                {billingCycle === '5_years' && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mr-2 animate-in fade-in slide-in-from-top-1">
                    Pay for 4 years, get 1 year FREE
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map(plan => {
                const c = colorMap[plan.color];
                const isCurrent = currentPlan === plan.key || (plan.key === 'shop' && (currentPlan === 'starter' || !currentPlan));
                const isUpgrade = !isCurrent && PLAN_RANK[plan.key] > PLAN_RANK[currentPlan];
                const baseAmount = getBaseAmount(plan.key, billingCycle);
                const gstAmount = getGstAmount(baseAmount);
                const totalAmount = getTotalAmount(plan.key, billingCycle);
                const cycleUnit = billingCycle === 'yearly' ? '/year' : billingCycle === '5_years' ? '/5yr' : '/month';
                const paymentHref = `/${locale}/payment?plan=${plan.key}&cycle=${billingCycle}`;
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
                        <span className={cn('text-3xl font-black', c.text)}>₹{baseAmount}</span>
                        <span className="text-slate-500 text-sm">{cycleUnit} + GST</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Total incl. GST: ₹{totalAmount} <span className="text-slate-400">(GST ₹{gstAmount})</span></p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plan.tagline}</p>
                    </div>
                    <ul className="space-y-1.5 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <CheckCircle size={12} className="text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
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
                      <a href={paymentHref}
                        className={cn('w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all block', c.btn)}>
                        Switch (Free)
                      </a>
                    ) : isUpgrade ? (
                      <a href={paymentHref}
                        className={cn('w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all block', c.btn)}>
                        Upgrade — ₹{totalAmount}{cycleUnit}
                      </a>
                    ) : (
                      <a href={paymentHref}
                        className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white dark:text-slate-300 text-sm font-bold text-center transition-all block">
                        {isPaid ? `Switch — ₹${totalAmount}${cycleUnit}` : `Subscribe — ₹${totalAmount}${cycleUnit}`}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-600 text-center">Billed {billingCycle} via PayU · 30-day money-back guarantee · Cancel anytime</p>
          </div>
        );
      })()}

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-red-500 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cancel Subscription?</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  You keep full access until your billing period ends, then move to limited
                  (read-only) access. Cancel within 30 days of payment for a full refund.
                </p>
              </div>
            </div>

            {/* What they will lose */}
            <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 space-y-2 border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">You will lose access to</p>
              {profile.subscriptionPlan === 'business' && (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-400">• Bulk invoicing &amp; party ledger</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">• Dealer / distributor accounts</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">• Custom price lists &amp; GST/Tally export</p>
                </>
              )}
              {(profile.subscriptionPlan === 'professional' || profile.subscriptionPlan === 'business') && (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-400">• Products above 500 (will be hidden, not deleted)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">• Udhar customers above 100</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">• PDF &amp; CSV report export</p>
                </>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400">• Priority support</p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Reason (optional — helps us improve)
              </label>
              <select
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
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

      {/* ── Admin PIN Modal ── */}
      {showAdminPinModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Admin Access PIN</h2>
            <p className="text-sm text-slate-500 mb-6">
              {userProfile?.hasAdminPin ? 'Update or remove your Admin PIN.' : 'Set a PIN to protect the Admin role switch.'}
            </p>
            
            {pinStatus && (
              <div className={cn(
                "p-3 rounded-xl flex items-center gap-2 text-sm mb-4 font-medium",
                pinStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}>
                {pinStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {pinStatus.message}
              </div>
            )}

            <form onSubmit={handleSaveAdminPin}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Current Login Password</label>
                  <input
                    type="password"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={adminPinForm.currentPassword}
                    onChange={e => setAdminPinForm(f => ({...f, currentPassword: e.target.value}))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    New Admin PIN <span className="text-[10px] font-normal lowercase">(leave blank to remove)</span>
                  </label>
                  <input
                    type="password"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={adminPinForm.newPin}
                    onChange={e => setAdminPinForm(f => ({...f, newPin: e.target.value}))}
                    placeholder="At least 4 characters"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminPinModal(false)}
                  className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!adminPinForm.currentPassword || savingPin}
                  className="flex-1 bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-black hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingPin ? <Loader2 size={16} className="animate-spin" /> : null}
                  {savingPin ? 'Saving...' : 'Save PIN'}
                </button>
              </div>
            </form>
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
