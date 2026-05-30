import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = ['/login', '/signup'];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip locale prefix to get bare path e.g. /en/products → /products
  const pathnameWithoutLocale = pathname.replace(/^\/(en|hi|mr)/, '') || '/';

  const isPublic       = PUBLIC_PATHS.some(p => pathnameWithoutLocale.startsWith(p));
  const isAdminRoute   = pathnameWithoutLocale.startsWith('/admin');
  const isAuthed       = request.cookies.has('ks_auth');
  const localeMatch    = pathname.match(/^\/(en|hi|mr)/);
  const locale = localeMatch ? localeMatch[1] : 'mr';

  // Localize admin paths (no locale prefix → add one)
  if (!localeMatch && isAdminRoute) {
    const localizedUrl = request.nextUrl.clone();
    localizedUrl.pathname = `/${locale}${pathname}`;
    return NextResponse.redirect(localizedUrl);
  }

  // Localize other public paths
  if (!localeMatch && isPublic) {
    const localizedUrl = request.nextUrl.clone();
    localizedUrl.pathname = `/${locale}${pathname}`;
    return NextResponse.redirect(localizedUrl);
  }

  // Admin routes bypass user auth (admin uses separate localStorage token)
  if (isAdminRoute) {
    return intlMiddleware(request);
  }

  // Not logged in & trying to access a protected page → redirect to login
  if (!isAuthed && !isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  // Already logged in & trying to visit login/signup → redirect to dashboard
  if (isAuthed && isPublic) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // Handle legacy /setup route
  if (pathnameWithoutLocale === '/setup') {
    return NextResponse.redirect(new URL(`/${locale}/`, request.url));
  }

  // Otherwise let next-intl handle routing normally
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/login', '/signup', '/(hi|en|mr)/:path*', '/admin/:path*'],
};
