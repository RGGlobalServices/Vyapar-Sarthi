import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = ['/login', '/signup'];

// Origins allowed to call the /api/v1 endpoints cross-origin (the landing page
// is deployed on a separate origin). Mirrors the former Express CORS config.
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  process.env.LANDING_URL,
  process.env.APP_URL,
  process.env.NEXT_PUBLIC_FRONTEND_URL,
  process.env.NEXT_PUBLIC_LANDING_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[];

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
  const isPaymentPage  = pathnameWithoutLocale.startsWith('/payment');
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

  // ── Plan gate: user is authenticated but hasn't selected a real plan ──
  // The ks_plan cookie is set by MainLayoutClient after fetching the shop
  // profile. If it's missing or still 'starter' (the default from DB),
  // the user hasn't completed plan selection yet.
  const LANDING_PAYMENT = process.env.NEXT_PUBLIC_LANDING_URL
    ? `${process.env.NEXT_PUBLIC_LANDING_URL}/payment`
    : 'http://localhost:3001/payment';
  const planCookie = request.cookies.get('ks_plan')?.value || '';
  const isDev = process.env.NODE_ENV === 'development';
  const needsPlan = !isDev && isAuthed && !isPublic && !isAdminRoute && !isPaymentPage
    && (!planCookie || planCookie === 'starter');
  if (needsPlan) {
    return NextResponse.redirect(LANDING_PAYMENT);
  }

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
