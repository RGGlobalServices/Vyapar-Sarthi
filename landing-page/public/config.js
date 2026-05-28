/* ================================================================
   Vyapar Sarthi — Centralized Config
   Single source of truth for all landing-page ↔ backend ↔ frontend
   wiring. Update these two URLs for staging / production.
   ================================================================ */

const KS_CONFIG = {
  API_BASE:         window.KS_API_BASE || 'https://kirana-manager.onrender.com/api/v1',
  FRONTEND_URL:     window.KS_FRONTEND_URL || 'https://kirana-manager-fronend.onrender.com',
  LANDING_URL:      window.KS_LANDING_URL || window.location.origin,
  GOOGLE_CLIENT_ID: window.KS_GOOGLE_CLIENT_ID || '730675030887-3vsmtjo02gvk8b25m6fq9pkk83092p9m.apps.googleusercontent.com',
};

/* ── Auth helpers ─────────────────────────────────────────────── */

/**
 * Persist the JWT so the Next.js frontend middleware can read it.
 * The middleware reads the `ks_auth` cookie (not localStorage).
 * Cookies on `localhost` are port-agnostic, so a cookie set here
 * (port 5173) is readable by the frontend on port 3000.
 */
function ksSetAuth(token, apiUser) {
  const MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
  document.cookie = `ks_auth=${token}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
  localStorage.setItem('ks_auth', token);
  if (apiUser) localStorage.setItem('ks_api_user', JSON.stringify(apiUser));
}

/** Clear auth state on logout */
function ksClearAuth() {
  document.cookie = 'ks_auth=; path=/; max-age=0';
  localStorage.removeItem('ks_auth');
  localStorage.removeItem('ks_api_user');
}

/** Return the locale key selected during registration (defaults 'en') */
function ksGetLocale() {
  const lang = localStorage.getItem('ks_language') || 'en';
  return ['en', 'hi', 'mr'].includes(lang) ? lang : 'en';
}

/** Navigate to the authenticated frontend dashboard */
function ksLaunchDashboard() {
  window.location.href = `${KS_CONFIG.FRONTEND_URL}/${ksGetLocale()}`;
}

/* ── API wrapper ──────────────────────────────────────────────── */

/**
 * Thin fetch wrapper.
 * Returns { ok: true, data } on success, { ok: false, error, status } on failure.
 * Never throws — all errors are caught and normalised.
 */
async function ksPost(path, body) {
  try {
    const res = await fetch(`${KS_CONFIG.API_BASE}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    let data;
    try { data = await res.json(); } catch (_) { data = {}; }

    if (res.ok) return { ok: true, data };

    const detail = data.detail;
    let error = 'Something went wrong. Please try again.';
    if (typeof detail === 'string') error = detail;
    else if (Array.isArray(detail) && detail[0]?.msg) error = detail[0].msg;
    else console.error('[ksPost] Unhandled error shape:', res.status, data);

    return { ok: false, error, status: res.status };
  } catch (err) {
    return { ok: false, error: 'NETWORK_ERROR: ' + err.message, status: 0 };
  }
}
