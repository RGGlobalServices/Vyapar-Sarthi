import { requireAdmin } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const admin = await requireAdmin(req);
  return json({
    id: admin.id,
    email: admin.email,
    name: admin.fullName,
    role: admin.role,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
  });
});
