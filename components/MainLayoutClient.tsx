'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from '@/i18n/routing';
import { useBusinessStore } from '@/lib/businessStore';
import { useAuthStore } from '@/lib/store';
import AIFloatingButton from '@/components/AIFloatingButton';
import NotificationBell from '@/components/NotificationBell';
import { isAllowedWhenEnded, isSubscriptionEnded } from '@/lib/subscriptionAccess';
import api from '@/lib/api';
import { Menu, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Map URL segment → tool key for usage tracking
const PATH_TO_TOOL: Record<string, string> = {
  billing: 'billing', stock: 'stock', udhar: 'udhar', products: 'products',
  reports: 'reports', calendar: 'calendar', returns: 'returns',
  dukandar: 'dukandar', settings: 'settings', profile: 'profile',
};

const Sidebar = dynamic(() => import('@/components/Sidebar'), {
  ssr: false,
  loading: () => (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 z-30">
      <div className="p-6 border-b border-slate-800">
        <div className="w-10 h-10 bg-slate-800 rounded-xl animate-pulse" />
      </div>
      <div className="flex-1 px-4 py-6 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    </aside>
  ),
});

function TrialCountdownTracker({ profile }: { profile: any }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (profile.subscriptionStatus !== 'trial') return;

    if (profile.trialPaused) {
      setTimeLeft('Paused');
      return;
    }

    const expiryDate = profile.subscriptionExpiry ? new Date(profile.subscriptionExpiry).getTime() : 0;
    if (!expiryDate) return;

    function updateTimer() {
      const now = Date.now();
      const diff = expiryDate - now;

      if (diff <= 0) {
        setTimeLeft('Ended');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      setTimeLeft(parts.join(' '));
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [profile.subscriptionExpiry, profile.subscriptionStatus, profile.trialPaused]);

  if (profile.subscriptionStatus !== 'trial') return null;

  const isEnded = timeLeft === 'Ended';

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all border select-none",
      profile.trialPaused 
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" 
        : isEnded
          ? "bg-red-500/10 text-red-400 border-red-500/20"
          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-lg shadow-indigo-500/5"
    )}>
      <Clock size={14} className={cn(!profile.trialPaused && !isEnded && "animate-pulse")} />
      <span>
        {profile.trialPaused ? 'Trial: Paused' : `Trial Ends: ${timeLeft}`}
      </span>
    </div>
  );
}

function PaymentReminderBanner({ profile, locale }: { profile: any, locale: string }) {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  
  useEffect(() => {
    if (!profile.subscriptionExpiry) return;
    const diff = new Date(profile.subscriptionExpiry).getTime() - Date.now();
    setDaysLeft(Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [profile.subscriptionExpiry]);

  const ended = isSubscriptionEnded(profile);
  const isTrial = profile.subscriptionStatus === 'trial';
  
  if (!profile.subscriptionExpiry) return null;

  const plan = profile.subscriptionPlan || 'vyapar';
  const paymentLink = `/${locale}/payment?plan=${plan}`;

  if (ended) {
    return (
      <div className="bg-red-500 text-white px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg z-40 relative">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="flex-shrink-0" />
          <span className="text-sm font-bold leading-tight">
            Subscription Expired. Some features are locked.
          </span>
        </div>
        <a href={paymentLink} className="bg-white text-red-600 px-4 py-1.5 rounded-lg text-sm font-black whitespace-nowrap hover:bg-red-50 transition-colors shadow-sm">
          Pay Now to Unlock
        </a>
      </div>
    );
  }

  if (daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 && !profile.trialPaused) {
    const isToday = daysLeft === 0;
    const earlyPaymentLink = `${paymentLink}&force_pay=1`;
    return (
      <div className="bg-amber-500 text-slate-900 px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg z-40 relative">
        <div className="flex items-center gap-2">
          <Clock size={20} className="flex-shrink-0" />
          <span className="text-sm font-bold leading-tight">
            {isTrial ? 'Free trial' : 'Subscription'} ends {isToday ? 'today' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}. Renew to keep all features.
          </span>
        </div>
        <a href={earlyPaymentLink} className="bg-slate-900 text-amber-500 px-4 py-1.5 rounded-lg text-sm font-black whitespace-nowrap hover:bg-slate-800 transition-colors shadow-sm">
          Pay Now
        </a>
      </div>
    );
  }

  return null;
}

export default function MainLayoutClient({ 
  locale, 
  children 
}: { 
  locale: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { loadFromStorage } = useAuthStore();
  const { profile, fetchProfile } = useBusinessStore();
  const lastTracked = useRef('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Track which tool (page) the user visits — silent, non-blocking
  useEffect(() => {
    const segment = pathname.split('/').filter(Boolean).find(s => PATH_TO_TOOL[s]);
    const tool = segment ? PATH_TO_TOOL[segment] : null;
    if (!tool || tool === lastTracked.current) return;
    lastTracked.current = tool;
    api.post('/user/tool-usage', { tool }).catch(() => { /* silent */ });
  }, [pathname]);

  // Setup check is no longer needed as business type is selected during signup
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Refresh profile on tab focus/visibility to pick up plan changes from landing page.
  // Throttled: at most once per 30 s to avoid hammering the API on rapid tab switches.
  useEffect(() => {
    let lastRefresh = 0;
    function throttledFetch() {
      const now = Date.now();
      if (now - lastRefresh > 30_000) {
        lastRefresh = now;
        fetchProfile();
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') throttledFetch();
    }
    function onFocus() {
      throttledFetch();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchProfile]);

  // Sync the ks_plan cookie so other UI (navbar, etc.) can read the plan.
  // No forced redirect: every account has an auto free trial, so authenticated
  // users keep full access. Expired/cancelled users are handled by the
  // isSubscriptionEnded() gate below (→ /billing on this same domain). The old
  // redirect to the separate landing /payment broke auth across origins.
  useEffect(() => {
    if (!profile.id) return; // profile not loaded yet
    const plan = (profile.subscriptionPlan || '').toLowerCase();
    document.cookie = `ks_plan=${plan}; path=/; max-age=${60 * 60 * 24 * 7}`;
  }, [profile.id, profile.subscriptionPlan]);

  useEffect(() => {
    if (!isSubscriptionEnded(profile)) return;
    if (isAllowedWhenEnded(pathname)) return;
    window.location.href = `/${locale}/billing`;
  }, [profile, pathname, locale]);

  return (
    <>
      <Sidebar locale={locale} isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <button 
                onClick={() => setIsMobileOpen(true)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/50 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <Menu size={20} />
              </button>
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{profile.shopName || 'Vyapar Sarthi'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrialCountdownTracker profile={profile} />
            <NotificationBell />
          </div>
        </header>
        <PaymentReminderBanner profile={profile} locale={locale} />
        <main className="flex-1 p-3 md:p-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 dark:border-slate-800 px-4 md:px-8 py-3 flex items-center justify-between flex-shrink-0 bg-slate-50 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500 dark:text-slate-600" suppressHydrationWarning>
            © {new Date().getFullYear()}{' '}
            <span className="text-slate-700 dark:text-slate-400 font-semibold">{profile.shopName || 'Vyapar Sarthi'}</span>. All rights reserved.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-700">Vyapar Sarthi v2.0</p>
        </footer>
      </div>
      <AIFloatingButton />
    </>
  );
}
