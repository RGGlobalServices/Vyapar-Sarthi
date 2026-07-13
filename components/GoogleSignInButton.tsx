'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

declare global {
  interface Window { google?: any }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// Renders "Sign in with Google". On the web this uses Google Identity Services
// (a script-rendered button). Inside the Android/iOS app it uses the native
// Credential Manager / Google Sign-In SDK instead — Google blocks/breaks the
// web GIS button inside app WebViews, so the native SDK is required there.
// Both paths end up with a Google id_token, exchanged at /auth/google for the
// app JWT exactly like the email login does. Renders nothing when
// NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't configured.
export default function GoogleSignInButton() {
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [nativeSigningIn, setNativeSigningIn] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const isNative = mounted && Capacitor.isNativePlatform();

  const handleCredential = useCallback(async (credential?: string | null) => {
    if (!credential) return;
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
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

  // Native (Android/iOS): Credential Manager / Google Sign-In SDK.
  useEffect(() => {
    if (!mounted || !isNative || !CLIENT_ID) return;
    SocialLogin.initialize({ google: { webClientId: CLIENT_ID } }).catch(err => {
      console.error('Google native sign-in init failed:', err);
    });
  }, [mounted, isNative]);

  async function handleNativeSignIn() {
    if (nativeSigningIn) return;
    setNativeSigningIn(true);
    try {
      const { result } = await SocialLogin.login({
        provider: 'google',
        options: { scopes: ['email', 'profile'] },
      });
      const idToken = 'idToken' in result ? result.idToken : null;
      if (!idToken) throw new Error('Google did not return an ID token');
      await handleCredential(idToken);
    } catch (err) {
      alert((err as Error).message || 'Google sign-in failed');
    } finally {
      setNativeSigningIn(false);
    }
  }

  // Web: Google Identity Services script-rendered button.
  useEffect(() => {
    if (!CLIENT_ID || isNative) return;
    function init() {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r: { credential?: string }) => handleCredential(r?.credential) });
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
  }, [handleCredential, isNative]);

  if (!mounted || !CLIENT_ID) return null;

  if (isNative) {
    return (
      <button
        type="button"
        onClick={handleNativeSignIn}
        disabled={nativeSigningIn}
        className="w-full max-w-[320px] mx-auto flex items-center justify-center gap-3 bg-black text-white rounded-full py-2.5 px-6 text-sm font-medium disabled:opacity-60 active:scale-[0.98] transition-transform"
      >
        {!nativeSigningIn && (
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.27-2.09 3.56-5.17 3.56-8.84z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.89-3.02c-1.08.72-2.45 1.15-4.04 1.15-3.1 0-5.73-2.1-6.67-4.92H1.32v3.09C3.3 21.3 7.34 24 12 24z"/>
            <path fill="#FBBC05" d="M5.33 14.31c-.24-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28V6.66H1.32C.48 8.32 0 10.11 0 12s.48 3.68 1.32 5.34l4.01-3.03z"/>
            <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.45-3.45C17.94 1.19 15.24 0 12 0 7.34 0 3.3 2.7 1.32 6.66l4.01 3.03c.94-2.82 3.57-4.94 6.67-4.94z"/>
          </svg>
        )}
        {nativeSigningIn ? 'Signing in…' : 'Continue with Google'}
      </button>
    );
  }

  return <div ref={ref} className="flex justify-center" />;
}
