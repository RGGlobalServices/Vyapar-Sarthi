'use client';

/**
 * Native Fetch-based API client for Next.js 15
 * Simplified and robust to avoid Webpack module evaluation issues.
 */

// Backend now lives in this same Next.js app under /api/v1 (Route Handlers),
// so the default is a same-origin relative path. NEXT_PUBLIC_API_URL can still
// override it if the API is ever hosted on a separate origin.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

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

  // Inject active shop ID for multi-shop switching (skip for shop-management endpoints)
  if (!url.startsWith('/shop/my-shops') && !url.startsWith('/shop/create')) {
    const activeShopId = typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') : null;
    if (activeShopId) headers.set('x-shop-id', activeShopId);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

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
        localStorage.removeItem('ks_auth');
        document.cookie = 'ks_auth=; path=/; max-age=0';
        document.cookie = 'ks_plan=; path=/; max-age=0';
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
      const err = new Error(`Request failed with status ${response.status}`);
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

export default api;
