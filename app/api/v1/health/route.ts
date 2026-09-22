import { NextResponse } from 'next/server';
import prisma from '@/lib/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const startTime = Date.now();
    // Fast lightweight ping
    await prisma.$queryRaw`SELECT 1`;
    const responseTimeMs = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      responseTimeMs,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
