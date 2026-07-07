import prisma from '@/lib/server/prisma';
import { requireUser, getAuthPayloadFromToken } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const { sessionId: currentSessionId } = getAuthPayloadFromToken(req);

  const sessions = await prisma.userSession.findMany({
    where: { userId: user.id },
    orderBy: { lastSeen: 'desc' },
    select: {
      id: true,
      device: true,
      os: true,
      browser: true,
      ip: true,
      createdAt: true,
      lastSeen: true,
    }
  });

  return json(sessions.map(s => ({
    ...s,
    isCurrent: s.id === currentSessionId
  })));
});
