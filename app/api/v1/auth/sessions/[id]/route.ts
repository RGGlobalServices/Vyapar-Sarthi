import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id: sessionId } = await params;

  const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  
  if (!session) {
    throw new ApiError(404, 'Session not found');
  }

  if (session.userId !== user.id) {
    throw new ApiError(403, 'Not authorized to delete this session');
  }

  await prisma.userSession.delete({ where: { id: sessionId } });

  return json({ ok: true });
});
