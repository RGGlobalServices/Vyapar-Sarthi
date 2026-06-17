import {defineRouting} from 'next-intl/routing';
import {createNavigation} from 'next-intl/navigation';

export const locales = ['en', 'hi', 'mr'] as const;
export const defaultLocale = 'mr' as const;

export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always'
});

// Navigation helpers
export const {Link, redirect, usePathname, useRouter} = createNavigation(routing);
