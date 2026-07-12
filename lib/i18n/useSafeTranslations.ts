import { useTranslations } from 'next-intl';

export function useSafeTranslations(namespace?: string) {
  const t = useTranslations(namespace);

  const safeT = (key: string, fallback: string, values?: any): string => {
    try {
      if (t.has && t.has(key)) {
        return t(key, values);
      }
      
      const result = t(key, values);
      if (result === key || result === `${namespace ? namespace + '.' : ''}${key}` || result.includes('MISSING_MESSAGE')) {
        return fallback;
      }
      return result;
    } catch (error) {
      return fallback;
    }
  };

  return { safeT, t };
}
