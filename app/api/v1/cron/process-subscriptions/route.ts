import { json } from '@/lib/server/http';
import { checkCronAuth } from '@/lib/server/cronAuth';
import { processDueSubscriptions } from '@/lib/server/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Scheduled subscription processor. Run daily from an external scheduler
// (Vercel Cron, Render Cron, GitHub Action, cron-job.org, etc.).
//
// Auth: pass the secret either as a Bearer token or ?secret= query param:
//   GET /api/v1/cron/process-subscriptions
//   Authorization: Bearer <CRON_SECRET>
async function run(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const result = await processDueSubscriptions();

  return json({
    ok: true,
    remindersSent: result.remindersSent,
    expired: result.expired,
    details: result.details,
    ranAt: new Date().toISOString(),
  });
}

export const GET = run;
export const POST = run;
