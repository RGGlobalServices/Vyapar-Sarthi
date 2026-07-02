import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = handle(async (req) => {
  const user = await requireUser(req);
  const { relationshipId } = await readBody(req);
  if (!relationshipId) throw new ApiError(400, 'relationshipId required');

  // Verify ownership
  const rel = await prisma.dukandarRelationship.findFirst({
    where: { id: relationshipId, wholesalerId: user.uuid! },
  });
  if (!rel) throw new ApiError(404, 'Relationship not found');

  await prisma.dukandarRelationship.delete({ where: { id: relationshipId } });

  return json({ detail: 'Dukandar removed successfully' });
});
