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
 * A failure in one job is reported but does not stop the others from running.
 */
export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const results: Record<string, any> = {};

  try {
    results.stockAlerts = await runStockAlerts();
  } catch (err: any) {
    console.error('[CRON tick] stock-alerts failed:', err);
    results.stockAlerts = { error: err.message };
  }

  try {
    results.dailySummary = await runDailySummary();
  } catch (err: any) {
    console.error('[CRON tick] daily-summary failed:', err);
    results.dailySummary = { error: err.message };
  }

  try {
    results.subscriptions = await processDueSubscriptions();
  } catch (err: any) {
    console.error('[CRON tick] process-subscriptions failed:', err);
    results.subscriptions = { error: err.message };
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...results });
}

export const POST = GET;
