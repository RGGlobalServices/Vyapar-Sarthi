'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import api from './api';
import { getBusinessConfig, BusinessType, isGenderOnlyLabel, CategoryGroup } from './businessConfig';

/**
 * Category suggestions for the Add/Edit product forms, plus persistence for
 * categories the shopkeeper types themselves.
 *
 * The forms were already free-text, so a custom category could be entered — but
 * nothing remembered it, so the next product had to be typed from scratch and
 * small spelling drifts ("Cold Drinks" / "Cold drink") fragmented the catalogue.
 *
 * Suggestions are merged from two curated sources, most-relevant first:
 *   1. the business-type defaults — a clean, curated starting point that's
 *      the same for every shop of this type,
 *   2. the shop's saved Category master rows (added via "+ Add" — clean by
 *      construction since gender words are blocked at that point too).
 *
 * Deliberately does NOT merge in `usedCategories` (raw distinct values from
 * the shop's own product rows) — that source pulls in literally anything
 * ever typed on any product, including years of one-off typos/test values
 * ("Test", "Powder", generic tags like "Imported Sales"), with no way to
 * tell those apart from a genuinely useful category algorithmically. A
 * shopkeeper reported this exact junk mixed into the suggestion list as
 * looking unprofessional. `usedCategories` is still accepted as a parameter
 * (existing call sites pass it) but ignored here — nothing reads product
 * data through this hook, so this is purely a suggestion-list change, not a
 * data change; every existing product keeps whatever category it already
 * has. If a real, currently-only-on-products category should be suggested
 * again, retyping it once on any product calls saveCategory() and promotes
 * it into the curated `saved` list from then on.
 */
export function useCategories(businessType?: string, _usedCategories: string[] = []) {
  const { data, mutate } = useSWR('/master-data', (url: string) => api.get(url).then((r) => r.data));

  const saved: { id: string; name: string }[] = data?.categories ?? [];

  const suggestions = useMemo(() => {
    const defaults = getBusinessConfig((businessType || 'general') as BusinessType).defaultCategories || [];
    const out: string[] = [];
    const seen = new Set<string>();
    // Case-insensitive dedupe that keeps the first spelling encountered, so
    // the curated default's casing wins over a messier shop-typed variant.
    // Category = what the product IS, Gender = who it's for — a bare gender
    // word ("Kids", "Men", "Female") is never a valid category suggestion,
    // however it got there (typed directly, or via an older import that
    // mapped a gender column into the category field).
    for (const name of [...defaults, ...saved.map((c) => c.name)]) {
      const clean = String(name ?? '').trim();
      if (!clean || isGenderOnlyLabel(clean)) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }, [saved, businessType]);

  // Grouped view (only present for business types that define one, e.g.
  // millprocessing's Grains/Pulses/Oil Seeds/… taxonomy) with the shop's own
  // saved categories appended as a trailing "Your Categories" group so a
  // custom category the shopkeeper already typed once isn't lost from the
  // picker just because it isn't part of the curated groups.
  const groups = useMemo<CategoryGroup[] | undefined>(() => {
    const base = getBusinessConfig((businessType || 'general') as BusinessType).categoryGroups;
    if (!base) return undefined;
    const grouped = new Set(base.flatMap(g => g.options).map(o => o.toLowerCase()));
    const extra = saved
      .map(c => String(c.name ?? '').trim())
      .filter(name => name && !isGenderOnlyLabel(name) && !grouped.has(name.toLowerCase()));
    const dedupedExtra = Array.from(new Set(extra.map(n => n)));
    return dedupedExtra.length > 0
      ? [...base, { label: 'Your Categories', options: dedupedExtra }]
      : base;
  }, [saved, businessType]);

  /**
   * Persist a typed-in category so it is offered next time. No-ops for blanks,
   * for a bare gender/age word (that belongs in the Gender field, not here —
   * see isGenderOnlyLabel), and for anything already saved (compared
   * case-insensitively). Failure is deliberately swallowed: saving the
   * product matters, remembering the category label does not, and this runs
   * alongside the product save.
   */
  const saveCategory = useCallback(
    async (name: string | undefined | null) => {
      const clean = String(name ?? '').trim();
      if (!clean || isGenderOnlyLabel(clean)) return;
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

  return { suggestions, groups, saveCategory, savedCategories: saved };
}
