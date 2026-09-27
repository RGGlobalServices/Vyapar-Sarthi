'use client';

/**
 * Native Fetch-based API client for Next.js 15
 * Simplified and robust to avoid Webpack module evaluation issues.
 */

// Backend now lives in this same Next.js app under /api/v1 (Route Handlers),
// so the default is a same-origin relative path. NEXT_PUBLIC_API_URL can still
// override it if the API is ever hosted on a separate origin.
import { clearLocalSession, clearShopScopedLocalCache } from './clientSession';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

/**
 * Auto-refresh after writes.
 *
 * Every screen used to have to remember to refetch after its own mutation, and
 * none of them refreshed the *other* screens that show the same figures — so a
 * new sale left the dashboard totals stale until a manual page reload. Instead
 * of repeating that at ~80 call sites, any successful write revalidates the
 * SWR cache centrally here.
 *
 * This is cheap: SWR only refetches keys that currently have a mounted
 * subscriber, so it refreshes what the user is actually looking at, not every
 * endpoint in the app. Calls are debounced so a burst of writes (a batched
 * import, for example) collapses into a single revalidation pass.
 *
 * Note this cannot help components that hold results in their own useState —
 * those still need their own refetch after mutating.
 */
let revalidateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRevalidateAll() {
  if (typeof window === 'undefined') return;
  if (revalidateTimer) clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => {
    revalidateTimer = null;
    import('swr')
      .then(({ mutate }) => {
        // Bare matcher form: revalidates in the background and keeps the
        // existing data on screen, so no loading spinner flashes.
        mutate(() => true, undefined, { revalidate: true });
      })
      .catch(() => {});
  }, 400);
}

async function request(url: string, options: RequestInit = {}) {
  // Extract token from localStorage safely
  const getAuthToken = () => {
    if (typeof window === 'undefined') return null;
    try {
      // Admin routes use separate admin token
      if (url.startsWith('/admin/')) {
        const adminRaw = localStorage.getItem('ks_admin_auth');
        if (adminRaw) {
          const parsed = JSON.parse(adminRaw);
          return parsed.access_token || null;
        }
      }
      const raw = localStorage.getItem('ks_auth');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.access_token || parsed.accessToken;
    } catch {
      return null;
    }
  };

  const token = getAuthToken();
  const headers = new Headers(options.headers);

  if (token) headers.set('Authorization', `Bearer ${token}`);

  // Inject active shop ID for multi-shop switching (skip for shop-management endpoints).
  // Only fills in when the caller hasn't already set one — with All Shop Access
  // on, a page can be acting on a specific row that belongs to a DIFFERENT shop
  // than whichever one is currently "active" (e.g. editing a pooled cross-shop
  // list row without switching shops first), and needs to target that row's own
  // shop explicitly rather than silently 404ing against the active shop's id.
  // `shopAtStart` is set only when the shop header was auto-attached from the
  // active shop — a caller that pins its own x-shop-id (pooled cross-shop rows,
  // the offline sync) opts out of the stale-response and recovery handling below.
  let shopAtStart: string | null = null;
  if (!url.startsWith('/shop/my-shops') && !url.startsWith('/shop/create')) {
    if (!headers.has('x-shop-id')) {
      const activeShopId = typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') : null;
      if (activeShopId) {
        headers.set('x-shop-id', activeShopId);
        shopAtStart = activeShopId;
      }
    }
  }

  // The Profile page's admin/staff toggle (useAuthStore's `role`) was purely
  // a client-side UI convenience until now — nothing on the server ever knew
  // which mode a request came from, so anything gated on it (e.g. hiding
  // Reports/Suppliers in the sidebar for staff mode) was cosmetic only, not
  // real authorization. Carrying it as a header lets specific routes (see
  // GET /staff/:id/salary and /advance) enforce it server-side instead.
  if (!headers.has('x-ui-role')) {
    const uiRole = typeof window !== 'undefined' ? localStorage.getItem('ks_role') : null;
    if (uiRole) headers.set('x-ui-role', uiRole);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let cleanUrl = url;
  if (cleanUrl.startsWith('/api/v1/')) {
    cleanUrl = cleanUrl.substring(7);
  } else if (cleanUrl.startsWith('/api/v1')) {
    cleanUrl = cleanUrl.substring(7);
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    // Handle Unauthenticated — skip for auth endpoints (login, register, forgot)
    if (response.status === 401 && typeof window !== 'undefined' && !url.startsWith('/auth/')) {
      if (url.startsWith('/admin/')) {
        localStorage.removeItem('ks_admin_auth');
        const loc = window.location.pathname.split('/')[1] || 'en';
        if (!window.location.pathname.includes('/admin/login')) {
          window.location.href = `/${loc}/admin/login`;
        }
      } else {
        // Wipes the user's shop id, role, cached data etc. — but never the
        // offline outbox, so unsynced bills survive an expired session.
        await clearLocalSession();
        if (!window.location.pathname.includes('/login')) {
          window.location.href = `/${window.location.pathname.split('/')[1] || 'en'}/login`;
        }
      }
      throw new Error('Unauthorized');
    }

    // Handle Subscription Expired
    if (response.status === 403) {
      const data = await response.clone().json().catch(() => ({}));
      if (data.detail === 'Subscription expired' && typeof window !== 'undefined') {
        const loc = window.location.pathname.split('/')[1] || 'en';
        if (!window.location.pathname.includes('/billing')) {
          window.location.href = `/${loc}/billing`;
        }
        throw new Error('Subscription expired');
      }
    }

    if (!response.ok) {
      let errorData;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json().catch(() => ({}));
      } else {
        const text = await response.text().catch(() => '');
        errorData = { detail: text || `HTTP Error ${response.status}` };
      }
      
      // The stored active shop is no longer one of this account's shops (deleted,
      // or the id was tampered with). Drop it and reload once so the app
      // re-resolves to a valid shop instead of failing every request.
      if (
        response.status === 403 &&
        errorData?.code === 'SHOP_INVALID' &&
        shopAtStart &&
        typeof window !== 'undefined' &&
        !url.startsWith('/admin/')
      ) {
        try {
          if (sessionStorage.getItem('ks_shop_recovering') !== shopAtStart) {
            sessionStorage.setItem('ks_shop_recovering', shopAtStart);
            if (localStorage.getItem('ks_active_shop_id') === shopAtStart) {
              localStorage.removeItem('ks_active_shop_id');
            }
            clearShopScopedLocalCache();
            window.location.reload();
          }
        } catch {}
      }

      const errorMessage = errorData?.error || errorData?.detail || `Request failed with status ${response.status}`;
      const err = new Error(errorMessage);
      (err as any).response = { status: response.status, data: errorData };
      console.error(`[API] Error ${response.status} on ${url}:`, err);
      throw err;
    }

    // Axios compatibility: return { data }
    // Guard against routes that accidentally return HTML (e.g. Next.js error pages)
    // instead of JSON — without this check a successful-looking HTML response throws
    // "Unexpected token '<', <!DOCTYPE..." which is hard to debug.
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
      // Likely an HTML page (404/500 from Next.js itself, not our route handlers)
      const text = await response.text().catch(() => '');
      const htmlSnippet = text.substring(0, 200);
      const friendlyErr = new Error('API route returned HTML instead of JSON — possible missing route or server crash');
      (friendlyErr as any).response = { status: response.status, data: { detail: `Server returned non-JSON response. Check if the API route exists. Preview: ${htmlSnippet}` } };
      console.error(`[API] Non-JSON success response on ${url}:`, friendlyErr);
      throw friendlyErr;
    }
    const data = await response.json().catch(() => ({}));

    // The user switched shops while this READ was in flight: its rows belong to
    // the previous shop and must not be written into the new shop's screens.
    // Reads only — a WRITE that already succeeded must still report success,
    // or the caller would retry it and create a duplicate.
    if (
      shopAtStart &&
      (options.method || 'GET').toUpperCase() === 'GET' &&
      typeof window !== 'undefined' &&
      localStorage.getItem('ks_active_shop_id') !== shopAtStart
    ) {
      const abort = new Error('Shop changed while the request was in flight');
      abort.name = 'AbortError';
      throw abort;
    }

    // A write succeeded — pull the rest of the visible UI back in sync.
    // Auth calls are excluded: those navigate the app anyway, and revalidating
    // mid-login/logout just fires requests against a token that is changing.
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && !url.startsWith('/auth/')) {
      scheduleRevalidateAll();
    }

    return { data };
  } catch (error: any) {
    if (error.response) throw error;
    if (error.name === 'AbortError') throw error;
    
    console.warn(`[API] Network/Internal Error on ${url}:`, error.message);
    throw error;
  }
}

const api = {
  get: (url: string, config: any = {}) => request(url, { ...config, method: 'GET' }),
  post: (url: string, data: any, config: any = {}) => 
    request(url, { ...config, method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data) }),
  put: (url: string, data: any, config: any = {}) =>
    request(url, { ...config, method: 'PUT', body: data instanceof FormData ? data : JSON.stringify(data) }),
  patch: (url: string, data: any, config: any = {}) =>
    request(url, { ...config, method: 'PATCH', body: data instanceof FormData ? data : JSON.stringify(data) }),
  delete: (url: string, config: any = {}) => {
    const fetchConfig = { ...config, method: 'DELETE' };
    if (config.data) {
      fetchConfig.body = config.data instanceof FormData ? config.data : JSON.stringify(config.data);
      delete fetchConfig.data;
    }
    return request(url, fetchConfig);
  },
};

/**
 * Download a binary file (PDF, CSV, …) from an API route.
 * Uses the same auth headers as the regular `api` client but returns a Blob
 * instead of parsed JSON, bypassing the JSON-only guard in `request()`.
 */
export async function downloadBlob(url: string): Promise<Blob> {
  const getToken = () => {
    try {
      const raw = localStorage.getItem('ks_auth');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.access_token || parsed.accessToken || null;
    } catch { return null; }
  };

  const cleanUrl = url.startsWith('/api/v1/') ? url.substring(7) : url;
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const shopId = typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') : null;
  if (shopId) headers['x-shop-id'] = shopId;

  const res = await fetch(fullUrl, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Download failed (${res.status}): ${text.substring(0, 200)}`);
  }
  return res.blob();
}

export default api;
