import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/server/cronAuth';
import { runStockAlerts } from '@/lib/server/stockAlerts';
import { runDailySummary } from '@/lib/server/dailySummary';
import { processDueSubscriptions } from '@/lib/server/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Single entry point for every scheduled job (Daily Summary, Low Stock /
 * Expiry alerts, Subscription reminders) — built so a host with no shell/
 * crontab access (e.g. a managed PaaS) only has to configure ONE external
 * scheduler hitting ONE URL, hourly. See README "Scheduling".
 *
 * Each job is self-gating and safe to call more often than it actually
 * needs to act:
 *   - stock-alerts: every finding is deduped per-product for 24h (low stock)
 *     or 7 days (expiring), so hourly calls just no-op after the first hit.
 *   - daily-summary: only fires for a user in the hour matching their chosen
 *     alertTime (IST) — see runDailySummary.
 *   - subscription reminders: deduped per user for 20h (see maybeNotify in
 *     lib/server/billing.ts).
 *
 * Responds immediately (202) and runs the three jobs in the background,
 * concurrently, instead of awaiting them — scanning every shop's products/
 * batches can take well past the ~30s hard timeout most free external
 * schedulers enforce (e.g. cron-job.org's free plan). This deploys as one
 * persistent Next.js server (see README "Deployment" — PM2/`next start`,
 * not a serverless function that gets frozen after the response), so the
 * unawaited work below keeps running on the Node event loop after the HTTP
 * response is sent; each job logs its own completion/failure since there is
 * no caller left waiting to read a result.
 */
export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const startedAt = new Date().toISOString();

  // Fire-and-forget: deliberately not awaited so the response below returns
  // immediately. Each job already logs its own failure internally.
  void (async () => {
    const results = await Promise.allSettled([
      runStockAlerts().catch((err) => {
        console.error('[CRON tick] stock-alerts failed:', err);
        throw err;
      }),
      runDailySummary().catch((err) => {
        console.error('[CRON tick] daily-summary failed:', err);
        throw err;
      }),
      processDueSubscriptions().catch((err) => {
        console.error('[CRON tick] process-subscriptions failed:', err);
        throw err;
      }),
    ]);
    console.log('[CRON tick] finished (started', startedAt, '):', results.map((r) => r.status));
  })();

  return NextResponse.json({ ok: true, accepted: true, startedAt }, { status: 202 });
}

export const POST = GET;
