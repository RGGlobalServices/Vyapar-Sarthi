import prisma from '@/lib/server/prisma';
import { requireUser } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/user/tool-usage — return all tool usage counts for the logged-in user
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const usages = await prisma.toolUsage.findMany({
    where: { userId: user.id },
    orderBy: { count: 'desc' },
  });
  return json(usages);
});

// POST /api/v1/user/tool-usage — increment usage count for a tool
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const { tool } = await readBody<{ tool?: string }>(req);
  if (!tool?.trim()) throw new ApiError(400, 'tool is required');

  await prisma.toolUsage.upsert({
    where: { userId_tool: { userId: user.id, tool: tool.trim() } },
    update: { count: { increment: 1 }, lastUsed: new Date() },
    create: { userId: user.id, tool: tool.trim(), count: 1 },
  });

  return json({ ok: true });
});
