import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/server/cronAuth';
import { runStockAlerts } from '@/lib/server/stockAlerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  try {
    const { notificationsCreated } = await runStockAlerts();
    return NextResponse.json({ success: true, notificationsCreated });
  } catch (err: any) {
    console.error('[CRON] Error generating stock alerts:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
