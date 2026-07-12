import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// DELETE /shop/:id — delete a non-primary shop
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(req);
  const shop = await prisma.shop.findFirst({ where: { id, ownerId: user.uuid! } });
  if (!shop) throw new ApiError(404, 'Shop not found');

  // Prevent deleting the only/primary shop
  const total = await prisma.shop.count({ where: { ownerId: user.uuid! } });
  if (total <= 1) throw new ApiError(400, 'Cannot delete your only shop');

  // Soft delete by removing the ownerId to avoid Foreign Key constraint errors 
  // (e.g., if there are products or customers tied to this shop with onDelete: NoAction)
  try {
    await prisma.shop.update({ 
      where: { id },
      data: { ownerId: null }
    });
  } catch (e: any) {
    require('fs').appendFileSync(require('path').join(process.cwd(), 'scratch', 'delete_error.log'), `Error: ${e.message}\nStack: ${e.stack}\nStringified: ${JSON.stringify(e)}\n\n`);
    throw new ApiError(500, e.message || 'Unknown database error');
  }
  
  return json({ detail: 'Shop removed successfully' });
});
