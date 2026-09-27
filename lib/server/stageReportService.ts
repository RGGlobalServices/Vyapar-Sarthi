import prisma from '@/lib/server/prisma';
import { ApiError } from '@/lib/server/http';

export type StageReportData = {
  shop: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    gstin: string | null;
  };
  batch: {
    id: string;
    batchNumber: string;
    status: string;
    startedAt: string | null;
    rawLotNumber: string | null;
    productName: string | null;
    workflowName: string | null;
    workflowVersionNumber: number | null;
  };
  stage: {
    id: string;
    stageName: string;
    sequence: number;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMinutes: number | null;
    operatorName: string | null;
    machineName: string | null;
    notes: string | null;
  };
  executionFields: Array<{
    id: string;
    fieldCode: string;
    fieldName: string;
    description: string | null;
    fieldType: string;
    unit: string | null;
    isRequired: boolean;
    sequence: number;
    section: string | null;
    actualValue: any;
  }>;
  inputs: Array<{
    id: string;
    productName: string;
    sourceLotNumber: string | null;
    inputType: string;
    quantity: number;
    unit: string;
    notes: string | null;
  }>;
  outputs: Array<{
    id: string;
    productName: string;
    outputType: string;
    quantity: number;
    unit: string;
    wipLotNumber?: string | null;
    notes: string | null;
  }>;
  quality: Array<{
    id: string;
    parameterName: string;
    dataType: string;
    unit: string | null;
    minValue: number | null;
    maxValue: number | null;
    targetValue: string | null;
    actualValue: string | null;
    result: string;
    isCritical: boolean;
    failureAction: string;
  }>;
  balance: {
    totalInputKg: number;
    totalOutputKg: number;
    wastageKg: number;
    differenceKg: number;
    balanceStatus: 'PASS' | 'FAIL' | 'UNBALANCED';
    tolerancePercent: number;
  };
  analytics: {
    yieldPercent: number | null;
    lossPercent: number | null;
    recoveryPercent: number | null;
    usefulOutputKg: number;
    byProductsKg: number;
    rejectionKg: number;
  };
  auditLogs: Array<{
    action: string;
    createdAt: string;
    details: any;
  }>;
};

export async function buildStageExecutionReportData(
  shopId: string,
  batchId: string,
  stageId: string
): Promise<StageReportData> {
  // 1. Load Shop
  const shop = await prisma.shop.findFirst({
    where: { id: shopId },
    select: { id: true, name: true, mobile: true, address: true, gst: true },
  });
  if (!shop) throw new ApiError(404, 'Shop not found', 'SHOP_NOT_FOUND');

  // 2. Load Batch with relations
  const batch = await (prisma as any).productionBatch.findFirst({
    where: { id: batchId, shopId: shop.id },
    include: {
      outputProduct: true,
      rawLot: true,
      batchWorkflowSnapshot: true,
      stages: true,
      inputLots: {
        include: {
          rawMaterialLot: {
            include: {
              product: true,
            },
          },
        },
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!batch) throw new ApiError(404, 'Production batch not found', 'BATCH_NOT_FOUND');

  // 3. Load Stage (either from BatchStage or BatchStageSnapshot)
  let batchStage = await prisma.batchStage.findFirst({
    where: { id: stageId, batchId: batch.id },
    include: {
      machine: true,
      executionFields: { orderBy: { sequence: 'asc' } },
    },
  });

  let snapshotStage: any = null;
  if (!batchStage) {
    snapshotStage = await prisma.batchStageSnapshot.findFirst({
      where: {
        id: stageId,
        snapshot: { productionBatchId: batch.id },
      },
      include: {
        machine: true,
        inputs: { include: { product: true, sourceLot: true, wipLot: true } },
        outputs: { include: { product: true, wipLot: true } },
        qualityParameters: true,
      },
    });

    if (snapshotStage) {
      batchStage = await prisma.batchStage.findFirst({
        where: { batchId: batch.id, sequence: snapshotStage.sequence },
        include: {
          machine: true,
          executionFields: { orderBy: { sequence: 'asc' } },
        },
      });
    }
  }

  if (!batchStage && !snapshotStage) {
    throw new ApiError(404, 'Stage not found for this batch', 'STAGE_NOT_FOUND');
  }

  const stageName = batchStage?.stageName || snapshotStage?.stageName || 'Stage';
  const sequence = batchStage?.sequence ?? snapshotStage?.sequence ?? 1;

  // 4. Timestamps & Duration
  const startedAtDate = snapshotStage?.startedAt || batchStage?.startedAt || null;
  const completedAtDate = snapshotStage?.completedAt || batchStage?.completedAt || null;

  let durationMinutes: number | null = null;
  if (startedAtDate && completedAtDate) {
    const diffMs = new Date(completedAtDate).getTime() - new Date(startedAtDate).getTime();
    durationMinutes = Math.max(0, Math.round(diffMs / 60000));
  }

  // 5. Execution Details Snapshot — resolve UUID refs (MACHINE/PRODUCT/LOT/TIMESTAMP)
  // to human-readable values before sending to the PDF renderer.
  const isUUID = (v: any): boolean =>
    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const formatISTDateTime = (iso: string): string => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Fetch machine name lookup for MACHINE-type fields
  const machineIds = (batchStage?.executionFields || [])
    .filter((f: any) => f.fieldType === 'MACHINE' && isUUID(f.actualValue))
    .map((f: any) => f.actualValue as string);
  const machineNameById = new Map<string, string>();
  if (machineIds.length > 0) {
    const machines = await prisma.machine.findMany({ where: { id: { in: machineIds } }, select: { id: true, name: true } });
    machines.forEach((m) => machineNameById.set(m.id, m.name));
  }

  // Fetch product name lookup for PRODUCT-type fields
  const productIds = (batchStage?.executionFields || [])
    .filter((f: any) => f.fieldType === 'PRODUCT' && isUUID(f.actualValue))
    .map((f: any) => f.actualValue as string);
  const productNameById = new Map<string, string>();
  if (productIds.length > 0) {
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    products.forEach((p) => productNameById.set(p.id, p.name));
  }

  // Fetch lot number lookup for LOT-type fields
  const lotIds = (batchStage?.executionFields || [])
    .filter((f: any) => f.fieldType === 'LOT' && isUUID(f.actualValue))
    .map((f: any) => f.actualValue as string);
  const lotNumberById = new Map<string, string>();
  if (lotIds.length > 0) {
    const rawLots = await prisma.rawMaterialLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, lotNumber: true } });
    rawLots.forEach((l) => lotNumberById.set(l.id, l.lotNumber || l.id.substring(0, 8)));
  }

  const resolveFieldValue = (f: any): any => {
    const v = f.actualValue;
    if (v === null || v === undefined) return null;
    if (f.fieldType === 'MACHINE' && isUUID(v)) return machineNameById.get(v) || v;
    if (f.fieldType === 'PRODUCT' && isUUID(v)) return productNameById.get(v) || v;
    if (f.fieldType === 'LOT' && isUUID(v)) return lotNumberById.get(v) || v;
    if (f.fieldType === 'TIMESTAMP' && typeof v === 'string' && v.includes('T')) {
      try { return formatISTDateTime(v); } catch { return v; }
    }
    return v;
  };

  const executionFields = (batchStage?.executionFields || []).map((f) => ({
    id: f.id,
    fieldCode: f.fieldCode,
    fieldName: f.fieldName,
    description: f.description,
    fieldType: f.fieldType,
    unit: f.unit,
    isRequired: f.isRequired,
    sequence: f.sequence,
    section: f.section,
    actualValue: resolveFieldValue(f),
  }));

  // 6. Inputs & Outputs
  const inputs: StageReportData['inputs'] = [];
  const outputs: StageReportData['outputs'] = [];

  if (snapshotStage?.inputs) {
    snapshotStage.inputs.forEach((i: any) => {
      const lotNum = i.wipLot?.lotNumber
        ? `WIP: ${i.wipLot.lotNumber}`
        : i.sourceLot?.lotNumber
        ? i.sourceLot.lotNumber
        : i.sourceLotId
        ? 'Lot #' + i.sourceLotId.substring(0, 8)
        : null;

      inputs.push({
        id: i.id,
        productName: i.product?.name || i.inputType || 'Input',
        sourceLotNumber: lotNum,
        inputType: i.inputType || 'raw_material',
        quantity: Number(i.actualQuantity ?? i.configuredQuantityValue ?? 0),
        unit: i.actualUnit || i.unit || 'kg',
        notes: null,
      });
    });
  } else if (batch.inputLots && batch.inputLots.length > 0) {
    batch.inputLots.forEach((lotItem: any) => {
      inputs.push({
        id: lotItem.id,
        productName: lotItem.rawMaterialLot?.product?.name || 'Raw Material',
        sourceLotNumber: lotItem.rawMaterialLot?.lotNumber || null,
        inputType: 'raw_material',
        quantity: Number(lotItem.quantity),
        unit: lotItem.unit || 'kg',
        notes: lotItem.notes || null,
      });
    });
  } else if (batchStage?.inputKg) {
    inputs.push({
      id: `input-${batchStage.id}`,
      productName: batch.rawLot?.lotNumber ? `Lot ${batch.rawLot.lotNumber}` : 'Raw Material',
      sourceLotNumber: batch.rawLot?.lotNumber || null,
      inputType: 'raw_material',
      quantity: Number(batchStage.inputKg),
      unit: 'kg',
      notes: null,
    });
  }

  if (snapshotStage?.outputs) {
    snapshotStage.outputs.forEach((o: any) => {
      outputs.push({
        id: o.id,
        productName: o.product?.name || o.outputType || 'Output',
        outputType: o.outputType || 'finished_good',
        quantity: Number(o.actualQuantity ?? o.expectedQuantity ?? 0),
        unit: o.actualUnit || o.unit || 'kg',
        wipLotNumber: o.wipLot?.lotNumber || null,
        notes: null,
      });
    });
  } else if (batchStage?.outputKg) {
    outputs.push({
      id: `output-${batchStage.id}`,
      productName: batch.product?.name || 'Finished Product',
      outputType: 'finished_good',
      quantity: Number(batchStage.outputKg),
      unit: 'kg',
      notes: null,
    });
    if (batchStage.wastageKg) {
      outputs.push({
        id: `wastage-${batchStage.id}`,
        productName: 'Wastage / Loss',
        outputType: 'WASTE',
        quantity: Number(batchStage.wastageKg),
        unit: 'kg',
        notes: null,
      });
    }
  }

  // 7. Quality Parameters
  const quality: StageReportData['quality'] = [];
  if (snapshotStage?.qualityParameters) {
    snapshotStage.qualityParameters.forEach((q: any) => {
      quality.push({
        id: q.id,
        parameterName: q.parameterName,
        dataType: q.dataType,
        unit: q.unit,
        minValue: q.minValue ? Number(q.minValue) : null,
        maxValue: q.maxValue ? Number(q.maxValue) : null,
        targetValue: q.targetValue,
        actualValue: q.actualValue,
        result: q.result || 'PENDING',
        isCritical: Boolean(q.isCritical),
        failureAction: q.failureAction || 'WARNING',
      });
    });
  }

  // 8. Mass-Balance & Yield Analytics
  const totalInputKg = inputs.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalOutputKg = outputs.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
  const wastageKg = Number(batchStage?.wastageKg ?? Math.max(0, totalInputKg - totalOutputKg));

  let usefulOutputKg = 0;
  let byProductsKg = 0;
  let rejectionKg = 0;

  outputs.forEach((o) => {
    const type = (o.outputType || '').toUpperCase();
    const qty = Number(o.quantity) || 0;

    if (type === 'FINISHED_GOOD' || type === 'WIP' || type === 'FINISHED') {
      usefulOutputKg += qty;
    } else if (type === 'BY_PRODUCT' || type === 'BYPRODUCT') {
      byProductsKg += qty;
    } else if (type === 'REJECTION' || type === 'WASTE' || type === 'REJECT') {
      rejectionKg += qty;
    } else {
      usefulOutputKg += qty;
    }
  });

  const differenceKg = Math.abs(totalInputKg - (totalOutputKg + (snapshotStage ? 0 : wastageKg)));
  const tolerancePercent = 5;
  const diffPct = totalInputKg > 0 ? (differenceKg / totalInputKg) * 100 : 0;
  const balanceStatus: StageReportData['balance']['balanceStatus'] =
    totalInputKg === 0 && totalOutputKg === 0
      ? 'UNBALANCED'
      : diffPct <= tolerancePercent
      ? 'PASS'
      : 'FAIL';

  const yieldPercent = totalInputKg > 0 ? Number(((usefulOutputKg / totalInputKg) * 100).toFixed(2)) : null;
  const lossPercent = totalInputKg > 0 ? Number(((wastageKg / totalInputKg) * 100).toFixed(2)) : null;
  const recoveryPercent =
    totalInputKg > 0 ? Number((((usefulOutputKg + byProductsKg) / totalInputKg) * 100).toFixed(2)) : null;

  // 9. Audit Logs
  const auditLogsRaw = await prisma.activityLog.findMany({
    where: {
      shopId: shop.id,
      entityId: { in: [stageId, batchStage?.id, snapshotStage?.id].filter(Boolean) as string[] },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const auditLogs = auditLogsRaw.map((a) => ({
    action: a.action,
    createdAt: a.createdAt.toISOString(),
    details: a.details,
  }));

  return {
    shop: {
      id: shop.id,
      name: shop.name || 'Shop',
      phone: shop.mobile || null,
      address: shop.address || null,
      gstin: shop.gst || null,
    },
    batch: {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      startedAt: batch.startedAt ? new Date(batch.startedAt).toISOString() : null,
      rawLotNumber: batch.rawLot?.lotNumber || null,
      productName: batch.outputProduct?.name || null,
      workflowName: batch.batchWorkflowSnapshot?.name || null,
      workflowVersionNumber: batch.batchWorkflowSnapshot?.versionNumber || null,
    },
    stage: {
      id: stageId,
      stageName,
      sequence,
      status: snapshotStage?.status || (batchStage?.completedAt ? 'COMPLETED' : 'IN_PROGRESS'),
      startedAt: startedAtDate ? new Date(startedAtDate).toISOString() : null,
      completedAt: completedAtDate ? new Date(completedAtDate).toISOString() : null,
      durationMinutes,
      operatorName: batchStage?.operatorName || null,
      machineName: batchStage?.machine?.name || snapshotStage?.machine?.name || null,
      notes: batchStage?.notes || null,
    },
    executionFields,
    inputs,
    outputs,
    quality,
    balance: {
      totalInputKg,
      totalOutputKg,
      wastageKg,
      differenceKg,
      balanceStatus,
      tolerancePercent,
    },
    analytics: {
      yieldPercent,
      lossPercent,
      recoveryPercent,
      usefulOutputKg,
      byProductsKg,
      rejectionKg,
    },
    auditLogs,
  };
}
