import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import { readForm } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const payuData = await readForm(req);
    const plan = payuData.udf1 || 'shop';
    const errorMsg = payuData.error_Message || payuData.unmappedstatus || 'payment_failed';
    return NextResponse.redirect(
      `${config.appUrl}/en/payment?plan=${plan}&error=${encodeURIComponent(errorMsg)}`,
      303,
    );
  } catch (err) {
    console.error('PayU failure error:', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${config.appUrl}/en/payment?error=unknown`, 303);
  }
}
