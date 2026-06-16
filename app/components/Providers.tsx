'use client';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect } from 'react';

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
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone ?? 'Asia/Kolkata'}>
      {children}
    </NextIntlClientProvider>
  );
}
