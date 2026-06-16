'use client';
import { useState, useEffect } from 'react';
import { translateData } from '@/lib/translateData';

interface SmartTranslatorProps {
  text: string;
  locale: string;
  className?: string;
}

const cache: Record<string, string> = {};

export default function SmartTranslator({ text, locale, className }: SmartTranslatorProps) {
  const [translated, setTranslated] = useState<string>(translateData(text, locale));

  useEffect(() => {
    let isMounted = true;

    async function fetchTranslation() {
      // 1. Check local map first
      const localResult = translateData(text, locale);
      if (localResult !== text || locale === 'en') {
        if (isMounted) setTranslated(localResult);
        return;
      }

      // 2. Check cache
      const cacheKey = `${locale}:${text}`;
      if (cache[cacheKey]) {
        if (isMounted) setTranslated(cache[cacheKey]);
        return;
      }

      // 3. AI Translation as fallback
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, targetLocale: locale }),
        });
        const data = await res.json();
        if (data.translated && isMounted) {
          cache[cacheKey] = data.translated;
          setTranslated(data.translated);
        }
      } catch (err) {
        console.error('AI Translation failed:', err);
      }
    }

    fetchTranslation();
    return () => { isMounted = false; };
  }, [text, locale]);

  // If result is still pure Latin (no Devanagari), mark it as English
  // so the browser won't apply Devanagari glyph substitutions
  const isLatin = /^[\x00-\x7F\s\d₹.,\-\/()%]+$/.test(translated || '');
  return (
    <span className={className} lang={isLatin && locale !== 'en' ? 'en' : undefined}>
      {String(translated || '')}
    </span>
  );
}
