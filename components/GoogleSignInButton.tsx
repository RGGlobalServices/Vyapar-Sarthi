'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';

declare global {
  interface Window { google?: any }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// Renders Google's "Sign in with Google" button (Google Identity Services).
// On success it exchanges the id_token at /auth/google for the app JWT, stores
// it exactly like the email login does, and lands the user on the dashboard.
// Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't configured.
export default function GoogleSignInButton() {
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);

  const handleCredential = useCallback(async (response: { credential?: string }) => {
    if (!response?.credential) return;
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || 'Google sign-in failed');
      }
      const data = await res.json();
      const { access_token, user } = data;
      document.cookie = `ks_auth=1; path=/; max-age=${60 * 60 * 24 * 7}`;
      localStorage.setItem('ks_auth', JSON.stringify({
        access_token,
        user_id: user.id,
        email: user.email,
        name: user.name,
        storeName: user.storeName,
        mobile: user.mobile ?? '',
      }));
      window.location.href = `/${locale}/`;
    } catch (err) {
      alert((err as Error).message || 'Google sign-in failed');
    }
  }, [locale]);

  useEffect(() => {
    if (!CLIENT_ID) return;
    function init() {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredential });
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: 320,
      });
    }
    if (window.google) { init(); return; }
    const existing = document.getElementById('gsi-client');
    if (existing) { existing.addEventListener('load', init); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true; s.id = 'gsi-client';
    s.onload = init;
    document.head.appendChild(s);
  }, [handleCredential]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
}
