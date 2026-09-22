import crypto from 'crypto';
import { errorResponse, query } from '@/lib/server/http';

// Shared guard for /api/v1/cron/*. Fails CLOSED: with no CRON_SECRET
// configured no caller is accepted (the old code either skipped the check
// entirely, or fell back to a hardcoded default string).
//
// The secret is accepted as `Authorization: Bearer <secret>` or `?secret=`
// (the latter matches the documented usage of process-subscriptions, so an
// existing scheduler keeps working unchanged).
export function checkCronAuth(req: Request): Response | null {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    console.error('[CRON] CRON_SECRET is not configured — refusing request');
    return errorResponse('Unauthorized', 401);
  }

  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const supplied = bearer || query(req).secret || '';

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return ok ? null : errorResponse('Unauthorized', 401);
}
