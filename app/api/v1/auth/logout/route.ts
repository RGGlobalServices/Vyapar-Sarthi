import prisma from '@/lib/server/prisma';
import { getAuthPayloadFromToken } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Deletes the UserSession tied to the current token, so it stops appearing
// as "Active" in Settings > Active Devices & Sessions, and so the token's
// sessionId claim is rejected by requireUser() on any future reuse.
export const POST = handle(async (req) => {
  try {
    const { sessionId } = getAuthPayloadFromToken(req);
    if (sessionId) {
      await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => {});
    }
  } catch {
    // No/invalid/expired token — nothing to invalidate server-side; the
    // client-side logout (clearing localStorage/cookies) still proceeds.
  }
  return json({ ok: true });
});
