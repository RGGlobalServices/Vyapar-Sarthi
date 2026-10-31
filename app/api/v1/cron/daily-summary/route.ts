import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/server/cronAuth';
import { runDailySummary } from '@/lib/server/dailySummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  try {
    const force = new URL(req.url).searchParams.get('force') === '1';
    const { count } = await runDailySummary({ force });
    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error('[CRON] Error generating daily summaries:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
