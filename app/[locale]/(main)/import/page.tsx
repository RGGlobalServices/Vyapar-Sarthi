'use client';
import { useEffect } from 'react';
import { useBusinessStore } from '@/lib/businessStore';
import { useLocale } from 'next-intl';
import RetailImport from './components/RetailImport';
import WholesaleImport from './components/WholesaleImport';
import { isSubscriptionEnded } from '@/lib/subscriptionAccess';

export default function ImportPageWrapper() {
  const { profile, fetchProfile } = useBusinessStore();
  const locale = useLocale();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile && isSubscriptionEnded(profile)) {
      window.location.href = `/${locale}/billing`;
    }
  }, [profile, locale]);

  if (!profile || !profile.subscriptionPlan) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-slate-500">Loading Import Module...</p>
      </div>
    );
  }

  // Route to the new Udyog/Wholesale module if applicable
  if (profile.subscriptionPlan === 'wholesale') {
    return <WholesaleImport />;
  }

  // Fallback to the original Vyapar/Starter retail module
  return <RetailImport />;
}
