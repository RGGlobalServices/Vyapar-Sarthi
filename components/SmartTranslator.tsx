'use client';
import { useState, useEffect } from 'react';
import { translateData } from '@/lib/translateData';

interface SmartTranslatorProps {
  text: string;
  locale: string;
  className?: string;
}

// Resolved translations, keyed by `${locale}:${text}`. A miss that fell back to
// the original text is still cached here, so it is never re-requested.
const cache: Record<string, string> = {};
// In-flight requests, so the many cells that render the same product name (and
// rapid re-renders) share a single network call instead of each firing one —
// the free-tier translation API is only a few requests/minute.
const inFlight: Record<string, Promise<string>> = {};

function requestTranslation(text: string, locale: string): Promise<string> {
  const key = `${locale}:${text}`;
  if (cache[key]) return Promise.resolve(cache[key]);
  if (key in inFlight) return inFlight[key];

  const p = fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLocale: locale }),
  })
    .then(res => res.json())
    .then(data => {
      const result = data?.translated || text;
      cache[key] = result; // cache even when it equals the original → no retries
      return result;
    })
    .catch(() => text) // network error: keep the original, don't cache (allow one retry)
    .finally(() => { delete inFlight[key]; });

  inFlight[key] = p;
  return p;
}

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

      // 2 & 3. AI translation as fallback — deduped and cached across all cells.
      const result = await requestTranslation(text, locale);
      if (isMounted) setTranslated(result);
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
