import { config } from './config';

const STORAGE_KEY = 'vs_auth';

interface AuthUser {
  id: number;
  email: string;
  name: string;
  storeName: string | null;
  mobile: string | null;
}

interface AuthData {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export function storeAuth(data: AuthData) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).access_token;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).user;
  } catch {
    return null;
  }
}

export async function apiPost<T = any>(path: string, body: any, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${config.API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export async function apiGet<T = any>(path: string, token: string): Promise<T> {
  const res = await fetch(`${config.API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<AuthData> {
  const data = await apiPost<AuthData>('/auth/login', { email, password });
  storeAuth(data);
  return data;
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
  fullName: string;
  mobile: string;
  storeName: string;
  businessType: string;
}): Promise<AuthData> {
  const result = await apiPost<AuthData>('/auth/register', data);
  storeAuth(result);
  return result;
}

export function getRedirectParam(): string {
  if (typeof window === 'undefined') return '/';
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || '/';
}

export function redirectAfterAuth(fallback: string = '/') {
  const redirect = getRedirectParam();
  const target = redirect && redirect !== '/login' && redirect !== '/register'
    ? redirect
    : fallback;
  window.location.href = target;
}
