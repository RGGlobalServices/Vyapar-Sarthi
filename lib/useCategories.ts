'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import api from './api';
import { getBusinessConfig, BusinessType } from './businessConfig';

/**
 * Category suggestions for the Add/Edit product forms, plus persistence for
 * categories the shopkeeper types themselves.
 *
 * The forms were already free-text, so a custom category could be entered — but
 * nothing remembered it, so the next product had to be typed from scratch and
 * small spelling drifts ("Cold Drinks" / "Cold drink") fragmented the catalogue.
 *
 * Suggestions are merged from three sources, most-relevant first:
 *   1. the shop's saved Category master rows,
 *   2. categories already in use on its products (covers rows created before
 *      this existed, and anything an import brought in),
 *   3. the business-type defaults, as a starting point for a new shop.
 */
export function useCategories(businessType?: string, usedCategories: string[] = []) {
  const { data, mutate } = useSWR('/master-data', (url: string) => api.get(url).then((r) => r.data));

  const saved: { id: string; name: string }[] = data?.categories ?? [];

  const suggestions = useMemo(() => {
    const defaults = getBusinessConfig((businessType || 'general') as BusinessType).defaultCategories || [];
    const out: string[] = [];
    const seen = new Set<string>();
    // Case-insensitive dedupe that keeps the first spelling encountered, so the
    // shop's own saved casing wins over a default or an imported variant.
    for (const name of [...saved.map((c) => c.name), ...usedCategories, ...defaults]) {
      const clean = String(name ?? '').trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }, [saved, usedCategories, businessType]);

  /**
   * Persist a typed-in category so it is offered next time. No-ops for blanks
   * and for anything already saved (compared case-insensitively). Failure is
   * deliberately swallowed: saving the product matters, remembering the
   * category label does not, and this runs alongside the product save.
   */
  const saveCategory = useCallback(
    async (name: string | undefined | null) => {
      const clean = String(name ?? '').trim();
      if (!clean) return;
      if (saved.some((c) => (c.name || '').trim().toLowerCase() === clean.toLowerCase())) return;
      try {
        await api.post('/master-data', { type: 'category', name: clean });
        mutate();
      } catch {
        /* non-fatal — the product itself is already saved */
      }
    },
    [saved, mutate],
  );

  return { suggestions, saveCategory, savedCategories: saved };
}
