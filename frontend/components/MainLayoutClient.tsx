'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from '@/i18n/routing';
import { useBusinessStore } from '@/lib/businessStore';
import { useAuthStore } from '@/lib/store';
import AIFloatingButton from '@/components/AIFloatingButton';
import NotificationBell from '@/components/NotificationBell';
import { isAllowedWhenEnded, isSubscriptionEnded } from '@/lib/subscriptionAccess';

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

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Setup check is no longer needed as business type is selected during signup
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Refresh profile on tab focus/visibility to pick up plan changes from landing page
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchProfile();
      }
    }
    function onFocus() {
      fetchProfile();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchProfile]);

  useEffect(() => {
    if (!isSubscriptionEnded(profile)) return;
    if (isAllowedWhenEnded(pathname)) return;
    window.location.href = `/${locale}/billing`;
  }, [profile, pathname, locale]);

  return (
    <>
      <Sidebar locale={locale} />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <header className="flex items-center justify-end px-6 py-3 border-b border-slate-800 bg-slate-900/50">
          <NotificationBell />
        </header>
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
        <footer className="border-t border-slate-800 px-8 py-3 flex items-center justify-between flex-shrink-0 bg-slate-900/50">
          <p className="text-xs text-slate-600" suppressHydrationWarning>
            © {new Date().getFullYear()}{' '}
            <span className="text-slate-400 font-semibold">{profile.shopName || 'Vyapar Sarthi'}</span>. All rights reserved.
          </p>
          <p className="text-xs text-slate-700">Vyapar Sarthi v2.0</p>
        </footer>
      </div>
      <AIFloatingButton />
    </>
  );
}
