import prisma from './prisma';

export interface IdempotencyResult<T> {
  isDuplicate: boolean;
  result: T;
  syncRecordId?: string;
}

/**
 * Executes a transaction handler with tenant-safe idempotency.
 * 
 * If a transaction with (shopId, idempotencyKey) was already processed:
 * Returns the cached response payload immediately with zero duplicate side effects.
 * 
 * If new:
 * Executes handler, creates a sync_records entry inside the transaction, and returns the result.
 */
export async function withTenantIdempotency<T>(
  tx: any,
  params: {
    shopId: string;
    idempotencyKey?: string | null;
    deviceId?: string | null;
    entityType: string;
    localId?: string | null;
    handler: () => Promise<{ serverId: string; response: T }>;
  }
): Promise<IdempotencyResult<T>> {
  const { shopId, idempotencyKey, deviceId, entityType, localId, handler } = params;

  // If no idempotencyKey was provided by caller, simply run the handler
  if (!idempotencyKey || !idempotencyKey.trim()) {
    const executed = await handler();
    return {
      isDuplicate: false,
      result: executed.response,
    };
  }

  const cleanKey = idempotencyKey.trim();

  // 1. Check if this idempotency key already exists for this shop
  const existingRecord = await tx.syncRecord.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey: cleanKey,
      },
    },
  });

  if (existingRecord) {
    return {
      isDuplicate: true,
      result: (existingRecord.response as T) || ({ id: existingRecord.serverId } as unknown as T),
      syncRecordId: existingRecord.id,
    };
  }

  // 2. Execute the primary business handler
  const { serverId, response } = await handler();

  // 3. Record the idempotency commit in the same transaction
  const record = await tx.syncRecord.create({
    data: {
      shopId,
      deviceId: deviceId || 'unknown_device',
      idempotencyKey: cleanKey,
      entityType,
      localId: localId || null,
      serverId: serverId || null,
      status: 'processed',
      response: (response as any) || {},
    },
  });

  return {
    isDuplicate: false,
    result: response,
    syncRecordId: record.id,
  };
}
