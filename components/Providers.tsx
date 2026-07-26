'use client';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import AppInitializationManager from './AppInitializationManager';

export default function Providers({
  children,
  locale,
  messages,
  timeZone,
}: {
  children: React.ReactNode;
  locale: string;
  messages: any;
  timeZone?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!('serviceWorker' in navigator)) return;

    // Serwist only emits public/sw.js during `next build` (it is disabled in
    // development — see next.config.js). Registering in dev would fetch the
    // 404 HTML page and fail with an "unsupported MIME type" SecurityError,
    // so in dev we instead tear down any worker left over from a production
    // build. A stale worker keeps serving a precache manifest that points at
    // build hashes which no longer exist ("bad-precaching-response").
    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone ?? 'Asia/Kolkata'}
        getMessageFallback={({ namespace, key, error }) => {
          if (error.code === 'MISSING_MESSAGE') return '';
          return `${namespace ? namespace + '.' : ''}${key}`;
        }}
        onError={(error) => {
          if (error.code === 'MISSING_MESSAGE') return;
          console.error(error);
        }}
      >
        <AppInitializationManager />
        {/* Defer Toaster until after hydration to prevent SSR/CSR mismatch */}
        {mounted && <Toaster position="bottom-right" />}
        {children}
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
