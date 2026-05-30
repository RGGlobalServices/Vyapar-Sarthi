'use client';

/**
 * Native Fetch-based API client for Next.js 15
 * Simplified and robust to avoid Webpack module evaluation issues.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000/api/v1';

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

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  try {
    console.log(`[API] Fetching: ${fullUrl}`);
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
        if (!window.location.pathname.includes('/login')) {
          window.location.href = `/${window.location.pathname.split('/')[1] || 'en'}/login`;
        }
      }
      throw new Error('Unauthorized');
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
      const err = { response: { status: response.status, data: errorData }, message: `Request failed with status ${response.status}` };
      console.error(`[API] Error ${response.status} on ${url}:`, err);
      throw err;
    }

    // Axios compatibility: return { data }
    const data = await response.json();
    return { data };
  } catch (error) {
    if ((error as any).response) throw error;
    const errorMessage = (error as Error).message || 'Unknown network error';
    const err = { 
      response: { 
        status: 500, 
        data: { detail: errorMessage } 
      },
      message: errorMessage,
      isNetworkError: true
    };
    console.error(`[API] Network/Internal Error on ${url}:`, error);
    throw err;
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
  delete: (url: string, config: any = {}) => request(url, { ...config, method: 'DELETE' }),
};

export default api;
