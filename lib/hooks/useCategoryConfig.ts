import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { getConfigForIndustry, type CategoryConfig } from '@/lib/categoryConfig';
import { useBusinessStore } from '@/lib/businessStore';

let cache: Record<string, CategoryConfig> = {};

/**
 * Returns the CategoryConfig that matches the active shop's industry category.
 * Falls back to the built-in defaults if the API is unavailable.
 */
export function useCategoryConfig(): { config: CategoryConfig; loading: boolean } {
  const { profile } = useBusinessStore();
  const industryName: string = (profile as any)?.industryCategoryName ?? (profile as any)?.industryCategory ?? '';

  const cacheKey = industryName || 'general';
  const [config, setConfig] = useState<CategoryConfig>(() => cache[cacheKey] ?? getConfigForIndustry(industryName));
  const [loading, setLoading] = useState(!cache[cacheKey]);

  useEffect(() => {
    if (cache[cacheKey]) {
      setConfig(cache[cacheKey]);
      setLoading(false);
      return;
    }
    if (!industryName) {
      const fallback = getConfigForIndustry(null);
      cache[cacheKey] = fallback;
      setConfig(fallback);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get(`/category-configs?industry=${encodeURIComponent(industryName)}`)
      .then(res => {
        const rows: CategoryConfig[] = res.data ?? [];
        const hit = rows[0] ?? getConfigForIndustry(industryName);
        cache[cacheKey] = hit;
        setConfig(hit);
      })
      .catch(() => {
        const fallback = getConfigForIndustry(industryName);
        cache[cacheKey] = fallback;
        setConfig(fallback);
      })
      .finally(() => setLoading(false));
  }, [industryName, cacheKey]);

  return { config, loading };
}

/** Invalidate the client-side cache (call after saving a new config). */
export function invalidateCategoryConfigCache() {
  cache = {};
}
