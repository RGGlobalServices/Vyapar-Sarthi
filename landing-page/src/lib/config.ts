// Returns the API base URL at runtime, not at build time.
// NEXT_PUBLIC_API_URL may be baked-in as a relative "/api/v1" from the
// root .env.local.  When the landing page (port 3000) sees a relative URL
// it would hit itself — which has no API routes.  Instead, detect at runtime
// and always point to the app server (port 3001 in dev, env var in prod).
function resolveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL ?? '';
  // If the env gave us an absolute URL (starts with http), trust it.
  if (env.startsWith('http')) return env;
  // Client-side runtime detection:
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Landing page is always on 3001 in dev; API is always on 3000.
      return `${protocol}//${hostname}:3000/api/v1`;
    }
  }
  // Server-side fallback (SSG/SSR or non-localhost prod)
  return env || 'http://localhost:3000/api/v1';
}

// Resolve the app (dashboard) URL at runtime for the same reason as API_BASE.
function resolveAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_FRONTEND_URL ?? '';
  if (env.startsWith('http')) return env;
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:3000`;
    }
  }
  return env || 'http://localhost:3000';
}

export const config = {
  get API_BASE()    { return resolveApiBase(); },
  get FRONTEND_URL(){ return resolveAppUrl(); },
  LANDING_URL:  process.env.NEXT_PUBLIC_LANDING_URL  || 'http://localhost:3001',
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
};
