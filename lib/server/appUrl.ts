// APP_URL is the public origin of this deployment. It is baked into things that
// leave the server and are followed by real users / third parties: PayU's
// success + failure callback URLs, payment redirects, and the renewal links sent
// over WhatsApp and email. A wrong value (especially the localhost default)
// silently breaks payments, so production must set it explicitly.
//
// - production (runtime): APP_URL is REQUIRED, must be a valid http(s) URL and
//   must not point at localhost. Otherwise this throws with a clear message.
// - `next build` (NEXT_PHASE=phase-production-build): never throws — the value is
//   only read at request time, and build machines often lack runtime env.
// - development / test: keeps the existing localhost default.
const DEV_DEFAULT = 'http://localhost:3000';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export function resolveAppUrl(env: Record<string, string | undefined> = process.env): string {
  const isProd = env.NODE_ENV === 'production';
  const isBuild = env.NEXT_PHASE === 'phase-production-build';
  const raw = (env.APP_URL || '').trim();

  if (!raw) {
    if (isProd && !isBuild) {
      throw new Error(
        'Server misconfigured: APP_URL must be set in production (the public https origin of this app, e.g. https://app.example.com). ' +
          'It is used for PayU callback URLs and renewal links.'
      );
    }
    return DEV_DEFAULT;
  }

  if (isProd && !isBuild) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('Server misconfigured: APP_URL is not a valid URL.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Server misconfigured: APP_URL must start with http:// or https://.');
    }
    if (LOCAL_HOSTS.has(url.hostname)) {
      throw new Error('Server misconfigured: APP_URL must not point at localhost in production.');
    }
  }

  // No trailing slash: callers append "/path".
  return raw.replace(/\/+$/, '');
}
