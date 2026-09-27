import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const machines = await prisma.machine.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'asc' },
  });

  return json(machines);
});

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const body = await readBody(req);

  const { name, machineType, status = 'working', notes } = body;
  if (!name || typeof name !== 'string') {
    throw new ApiError(400, 'Machine name is required.');
  }

  const machine = await prisma.machine.create({
    data: {
      shopId: shop.id,
      name: name.trim(),
      machineType: machineType ? String(machineType).trim() : null,
      status: status ? String(status).trim() : 'working',
      notes: notes ? String(notes).trim() : null,
    },
  });

  return json(machine, 201);
});
