import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = ['/login', '/signup', '/auth/sso'];

// Origins allowed to call the /api/v1 endpoints cross-origin (the landing page
// is deployed on a separate origin). Built from env vars, plus the known
// production domains as a safety net, plus localhost for dev. Trailing slashes
// are stripped so values like "https://site.com/" still match the browser's
// Origin header (which never has a trailing slash).
const stripSlash = (s: string) => s.replace(/\/+$/, '');
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  process.env.LANDING_URL,
  process.env.APP_URL,
  process.env.NEXT_PUBLIC_FRONTEND_URL,
  process.env.NEXT_PUBLIC_LANDING_URL,
  'https://vyaparsarthii.com',
  'https://www.vyaparsarthii.com',
  'https://app.vyaparsarthii.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
].filter(Boolean).map((o) => stripSlash(o as string));

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(stripSlash(origin))) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-shop-id',
    );
  }
  return response;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes: handle CORS (incl. preflight) and let the route handler run.
  if (pathname.startsWith('/api')) {
    if (request.method === 'OPTIONS') {
      return applyCors(request, new NextResponse(null, { status: 204 }));
    }
    return applyCors(request, NextResponse.next());
  }

  // Strip locale prefix to get bare path e.g. /en/products → /products
  const pathnameWithoutLocale = pathname.replace(/^\/(en|hi|mr)/, '') || '/';

  const isPublic       = PUBLIC_PATHS.some(p => pathnameWithoutLocale.startsWith(p));
  const isAdminRoute   = pathnameWithoutLocale.startsWith('/admin');
  const isAuthed       = request.cookies.has('ks_auth');
  const localeMatch    = pathname.match(/^\/(en|hi|mr)/);
  // Fall back to the NEXT_LOCALE cookie (set by next-intl whenever the user
  // navigates to a localised URL or switches language). Without this, every
  // redirect our middleware emits (login page, 401 guard) would hard-code 'mr'
  // and ignore the user's saved preference.
  const savedLocale    = request.cookies.get('NEXT_LOCALE')?.value;
  const locale = localeMatch ? localeMatch[1] : (savedLocale && ['en','hi','mr'].includes(savedLocale) ? savedLocale : 'mr');

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
  // But SSO page must always be reachable so a landing-page login can hand off
  // a new token even when a session cookie already exists.
  if (isAuthed && isPublic && !pathnameWithoutLocale.startsWith('/auth/sso')) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // NOTE: No "pick a plan" gate here. Every account starts with an auto free
  // trial, so authenticated users always have access. Subscription enforcement
  // (expired / cancelled) is handled client-side in MainLayoutClient via
  // isSubscriptionEnded() → /billing, and server-side in requireShop(). A
  // middleware redirect to the separate landing domain broke auth (cookies
  // don't cross origins) and caused a login loop.

  // Handle legacy /setup route
  if (pathnameWithoutLocale === '/setup') {
    return NextResponse.redirect(new URL(`/${locale}/`, request.url));
  }

  // Otherwise let next-intl handle routing normally
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/login', '/signup', '/(hi|en|mr)/:path*', '/admin/:path*', '/api/:path*'],
};
