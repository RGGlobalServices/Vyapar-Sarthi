import { config } from '@/lib/server/config';
import { json, errorResponse, query } from '@/lib/server/http';
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
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const secret = bearer || query(req).secret || '';

  if (secret !== config.cronSecret) {
    return errorResponse('Unauthorized', 401);
  }

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
