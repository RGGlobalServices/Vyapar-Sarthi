'use client';

/**
 * The language a printed / PDF bill is written in — chosen per shop device in Profile, independent of the language the
 * app itself is shown in (a shopkeeper may use the app in English but want Marathi bills for customers).
 * 'app' (default) = same as the app language.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations, createTranslator } from 'next-intl';

export type BillLanguage = 'app' | 'en' | 'hi' | 'mr';
const KEY = 'vyapar_bill_language';
const listeners = new Set<() => void>();

function read(): BillLanguage {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'hi' || v === 'mr' ? v : 'app';
  } catch {
    return 'app';
  }
}

export function setBillLanguage(lang: BillLanguage) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode: ignore */ }
  listeners.forEach((l) => l());
}

export function useBillLanguage(): BillLanguage {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener('storage', cb); return () => { listeners.delete(cb); window.removeEventListener('storage', cb); }; },
    read,
    () => 'app' as BillLanguage,
  );
}

const loaders: Record<string, () => Promise<any>> = {
  en: () => import('../messages/en.json'),
  hi: () => import('../messages/hi.json'),
  mr: () => import('../messages/mr.json'),
};

/** Language the bill is actually written in right now. */
export function useBillLocale(): string {
  const appLocale = useLocale();
  const pref = useBillLanguage();
  return pref === 'app' ? appLocale : pref;
}

/** Drop-in for useTranslations(ns) on bills: translates in the bill language instead of the app language. */
export function useBillT(namespace = 'BillSlip') {
  const appT = useTranslations(namespace);
  const appLocale = useLocale();
  const lang = useBillLocale();
  const [messages, setMessages] = useState<any>(null);

  useEffect(() => {
    if (lang === appLocale) { setMessages(null); return; }
    let live = true;
    loaders[lang]?.().then((m) => { if (live) setMessages(m.default ?? m); });
    return () => { live = false; };
  }, [lang, appLocale]);

  if (lang === appLocale || !messages) return appT;
  const tr: any = createTranslator({
    locale: lang,
    messages,
    namespace,
    // missing key -> '' so `t('x') || 'fallback'` keeps working, like the app's own setup
    getMessageFallback: () => '',
    onError: () => {},
  });
  return tr as typeof appT;
}
