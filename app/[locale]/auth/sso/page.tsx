'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { clearLocalSession } from '@/lib/clientSession';

// SSO receiver — called by the landing page after login.
// Reads the JWT + user fields from URL params, stores them in the main app's
// localStorage exactly as the native login page would, then redirects to the
// dashboard. The token is short-lived in the URL (browser history only) which
// is acceptable for a same-device, same-browser dev/prod SSO handoff.
export default function SSOPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleSSO() {
      const token    = searchParams.get('token');
      const next     = searchParams.get('next') || `/${locale}/`;

      if (!token) {
        window.location.replace(`/${locale}/login`);
        return;
      }

      // Wipe any existing session so we never inherit a previous user's data.
      await clearLocalSession();

      const authData = {
        access_token: token,
        user_id:      searchParams.get('user_id') || '',
        email:        searchParams.get('email')   || '',
        name:         searchParams.get('name')    || '',
        storeName:    searchParams.get('storeName') || '',
        mobile:       searchParams.get('mobile')  || '',
      };

      try {
        localStorage.setItem('ks_auth', JSON.stringify(authData));
        document.cookie = `ks_auth=1; path=/; max-age=${60 * 60 * 24 * 7}`;
      } catch {}

      window.location.replace(next);
    }

    handleSSO();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-slate-400 text-sm animate-pulse">Signing you in…</div>
    </div>
  );
}
