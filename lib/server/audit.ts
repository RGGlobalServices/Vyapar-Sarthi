import prisma from '@/lib/server/prisma';

export async function recordStageAuditEvent({
  shopId,
  userId,
  action,
  entityId,
  details = {},
}: {
  shopId: string;
  userId?: string | null;
  action: string;
  entityId?: string | null;
  details?: Record<string, any>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        shopId,
        userId: userId || null,
        action,
        entityId: entityId || null,
        details: details || {},
      },
    });
  } catch (err) {
    // Non-fatal audit log failure: do not break business operations
    console.error(`Audit log creation failed non-fatally [${action}]:`, err);
  }
}
