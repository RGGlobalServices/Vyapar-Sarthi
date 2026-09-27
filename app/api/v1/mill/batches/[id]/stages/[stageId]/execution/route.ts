import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';
import { recordStageAuditEvent } from '@/lib/server/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function findBatchStage(batchId: string, stageId: string, shopId: string) {
  // Try direct BatchStage lookup
  let batchStage = await prisma.batchStage.findFirst({
    where: {
      id: stageId,
      batchId,
      batch: { shopId },
    },
    include: {
      batch: {
        include: {
          rawLot: { include: { product: true } },
          outputProduct: true,
          stages: { orderBy: { sequence: 'asc' } },
        },
      },
    },
  });

  // If not found directly, stageId might be a BatchStageSnapshot ID
  if (!batchStage) {
    const snapshotStage = await prisma.batchStageSnapshot.findFirst({
      where: {
        id: stageId,
        snapshot: { productionBatchId: batchId, batch: { shopId } },
      },
    });

    if (snapshotStage) {
      batchStage = await prisma.batchStage.findFirst({
        where: {
          batchId,
          sequence: snapshotStage.sequence,
        },
        include: {
          batch: {
            include: {
              rawLot: { include: { product: true } },
              outputProduct: true,
              stages: { orderBy: { sequence: 'asc' } },
            },
          },
        },
      });
    }
  }

  return batchStage;
}

import { randomUUID } from 'crypto';

function generateDefaultFieldsForStage(stageName: string, batchStageId: string, batch?: any, stage?: any) {
  const upper = stageName.toUpperCase();
  const defaultInputQty = stage?.inputKg ? String(stage.inputKg) : (batch?.inputKg ? String(batch.inputKg) : null);
  const defaultMaterialId = batch?.rawLot?.productId || batch?.rawLot?.product?.id || batch?.outputProductId || batch?.outputProduct?.id || null;
  const defaultLotId = batch?.rawLotId || batch?.rawLot?.id || null;
  const defaultOperator = stage?.operatorName || null;
  const defaultNotes = stage?.notes || null;

  const commonFields = [
    { fieldCode: 'input_qty', fieldName: 'Input Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'INPUT', isRequired: true, actualValue: defaultInputQty },
    { fieldCode: 'input_unit', fieldName: 'Input Unit', fieldType: 'TEXT', unit: null, section: 'INPUT', isRequired: true, actualValue: 'kg' },
    { fieldCode: 'output_qty', fieldName: 'Output Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: true },
    { fieldCode: 'output_unit', fieldName: 'Output Unit', fieldType: 'TEXT', unit: null, section: 'OUTPUT', isRequired: true, actualValue: 'kg' },
    { fieldCode: 'waste_loss_qty', fieldName: 'Waste / Loss Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
    { fieldCode: 'waste_loss_unit', fieldName: 'Waste / Loss Unit', fieldType: 'TEXT', unit: null, section: 'OUTPUT', isRequired: false, actualValue: 'kg' },
    { fieldCode: 'operator_name', fieldName: 'Operator', fieldType: 'OPERATOR', unit: null, section: 'OPERATOR', isRequired: false, actualValue: defaultOperator },
    { fieldCode: 'machine_id', fieldName: 'Machine', fieldType: 'MACHINE', unit: null, section: 'MACHINE', isRequired: false },
    { fieldCode: 'start_datetime', fieldName: 'Start Date/Time', fieldType: 'DATETIME', unit: null, section: 'TIMING', isRequired: false },
    { fieldCode: 'end_datetime', fieldName: 'End Date/Time', fieldType: 'DATETIME', unit: null, section: 'TIMING', isRequired: false },
    { fieldCode: 'notes', fieldName: 'Notes', fieldType: 'TEXTAREA', unit: null, section: 'NOTES', isRequired: false, actualValue: defaultNotes },
  ];

  let stageSpecificFields: any[] = [];

  if (upper.includes('CLEAN')) {
    stageSpecificFields = [
      { fieldCode: 'input_material', fieldName: 'Input Material', fieldType: 'PRODUCT', section: 'INPUT', isRequired: false, actualValue: defaultMaterialId },
      { fieldCode: 'input_lot', fieldName: 'Input Lot', fieldType: 'LOT', section: 'INPUT', isRequired: false, actualValue: defaultLotId },
      { fieldCode: 'cleaned_output_qty', fieldName: 'Cleaned Output Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'dust_foreign_matter_qty', fieldName: 'Dust / Foreign Matter Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'moisture_pct', fieldName: 'Moisture %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'impurity_pct', fieldName: 'Impurity %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'cleaning_loss_pct', fieldName: 'Cleaning Loss %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'cleaning_method', fieldName: 'Cleaning Method / Mode', fieldType: 'SELECT', options: ['Dry Cleaning / Aspirator', 'Pre-Cleaner Sieve', 'Magnetic Separator', 'Wet Washing', 'Vibratory Screen'], section: 'PROCESS', isRequired: false },
      { fieldCode: 'quality_result', fieldName: 'Quality Result', fieldType: 'SELECT', options: ['PASSED', 'FAILED', 'REINSPECT'], section: 'QUALITY', isRequired: false },
    ];
  } else if (upper.includes('STONE') || upper.includes('DESTONE') || upper.includes('DE-STONE')) {
    stageSpecificFields = [
      { fieldCode: 'input_lot', fieldName: 'Input Lot', fieldType: 'LOT', section: 'INPUT', isRequired: false, actualValue: defaultLotId },
      { fieldCode: 'destoned_output_qty', fieldName: 'Destoned Recovery Output', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'stone_foreign_matter_qty', fieldName: 'Stone / Heavy Foreign Matter Removed', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'destoner_setting', fieldName: 'Destoner Air Flow / Deck Setting', fieldType: 'TEXT', section: 'PROCESS', isRequired: false },
      { fieldCode: 'stone_loss_pct', fieldName: 'Stone Removal Loss %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'stone_free_purity_pct', fieldName: 'Stone-Free Purity %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'quality_result', fieldName: 'Quality Result', fieldType: 'SELECT', options: ['PASSED', 'FAILED', 'REINSPECT'], section: 'QUALITY', isRequired: false },
    ];
  } else if (upper.includes('MILL') || upper.includes('DEHUSK') || upper.includes('HULL') || upper.includes('SHELL') || upper.includes('GRIND') || upper.includes('POLISH')) {
    stageSpecificFields = [
      { fieldCode: 'input_lot', fieldName: 'Input Lot / WIP Lot', fieldType: 'LOT', section: 'INPUT', isRequired: false, actualValue: defaultLotId },
      { fieldCode: 'output_product_id', fieldName: 'Output Product', fieldType: 'PRODUCT', section: 'OUTPUT', isRequired: false, actualValue: defaultMaterialId },
      { fieldCode: 'fine_main_output_qty', fieldName: 'Fine Flour / Main Grain Output', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'coarse_broken_qty', fieldName: 'Coarse Grain / Broken / Rava Output', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'bran_byproduct_qty', fieldName: 'Bran / Husk / Bhusa By-Product', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'milling_method', fieldName: 'Milling Method / Mode', fieldType: 'SELECT', options: ['Dehusking & Polishing', 'Chakki Grinding', 'Hammer Milling', 'Roller Milling', 'Emery Stone Milling'], section: 'PROCESS', isRequired: false },
      { fieldCode: 'machine_parameters', fieldName: 'Machine RPM / Roller Clearance', fieldType: 'TEXT', section: 'PROCESS', isRequired: false },
      { fieldCode: 'milling_recovery_pct', fieldName: 'Recovery / Yield %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'moisture_pct', fieldName: 'Moisture %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'quality_result', fieldName: 'Quality Result', fieldType: 'SELECT', options: ['PASSED', 'FAILED', 'REINSPECT'], section: 'QUALITY', isRequired: false },
    ];
  } else if (upper.includes('GRADE') || upper.includes('GRADING')) {
    stageSpecificFields = [
      { fieldCode: 'input_lot', fieldName: 'Input Lot', fieldType: 'LOT', section: 'INPUT', isRequired: false, actualValue: defaultLotId },
      { fieldCode: 'sieve_size', fieldName: 'Sieve / Screen Mesh Size', fieldType: 'TEXT', section: 'PROCESS', isRequired: false },
      { fieldCode: 'grade_1_output_qty', fieldName: 'Grade 1 / Premium Output Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'grade_2_output_qty', fieldName: 'Grade 2 / Standard Output Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'grade_3_output_qty', fieldName: 'Grade 3 / Small Grain Output Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'rejected_qty', fieldName: 'Rejected / Under-sized Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'grade_classification', fieldName: 'Grade / Classification', fieldType: 'SELECT', options: ['Super Premium', 'Grade A', 'Grade B', 'Grade C', 'Standard Commercial'], section: 'QUALITY', isRequired: false },
      { fieldCode: 'oversize_pct', fieldName: 'Oversize %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'undersize_pct', fieldName: 'Undersize %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'quality_result', fieldName: 'Quality Result', fieldType: 'SELECT', options: ['PASSED', 'FAILED', 'REINSPECT'], section: 'QUALITY', isRequired: false },
    ];
  } else if (upper.includes('SORT') || upper.includes('COLOR')) {
    stageSpecificFields = [
      { fieldCode: 'input_lot', fieldName: 'Input Lot', fieldType: 'LOT', section: 'INPUT', isRequired: false, actualValue: defaultLotId },
      { fieldCode: 'sorting_category', fieldName: 'Sorting Mode / Program', fieldType: 'SELECT', options: ['Color Sortex (Black/Yellow/Chalky)', 'Defect & Foreign Seed Removal', 'Size & Shape Sorting', 'Export Premium Sort'], section: 'PROCESS', isRequired: false },
      { fieldCode: 'sortex_sensitivity_setting', fieldName: 'Sortex Camera Sensitivity / Channel', fieldType: 'TEXT', section: 'PROCESS', isRequired: false },
      { fieldCode: 'accepted_output_qty', fieldName: 'Accepted / Clean Sortex Output', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'rejected_qty', fieldName: 'Rejected / Color Defect Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'byproduct_qty', fieldName: 'By-Product / Re-pass Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'OUTPUT', isRequired: false },
      { fieldCode: 'defect_rejection_reason', fieldName: 'Primary Defect / Rejection Reason', fieldType: 'SELECT', options: ['Discoloration / Black Spot', 'Chalky / Immature Grain', 'Foreign Weed Seeds', 'Insect Damaged Grain', 'Pinhead / Broken'], section: 'QUALITY', isRequired: false },
      { fieldCode: 'color_purity_pct', fieldName: 'Color Purity %', fieldType: 'DECIMAL', unit: '%', section: 'QUALITY', isRequired: false },
      { fieldCode: 'quality_result', fieldName: 'Quality Result', fieldType: 'SELECT', options: ['PASSED', 'FAILED', 'REINSPECT'], section: 'QUALITY', isRequired: false },
    ];
  } else if (upper.includes('PACK') || upper.includes('BAGGING')) {
    stageSpecificFields = [
      { fieldCode: 'input_lot', fieldName: 'Input Lot / WIP Lot', fieldType: 'LOT', section: 'INPUT', isRequired: false, actualValue: defaultLotId },
      { fieldCode: 'finished_product_id', fieldName: 'Finished Product', fieldType: 'PRODUCT', section: 'PACKAGING', isRequired: false, actualValue: defaultMaterialId },
      { fieldCode: 'pack_size', fieldName: 'Pack Size (Kg/Bag)', fieldType: 'DECIMAL', unit: 'kg', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'number_of_packs', fieldName: 'Number of Packs (Bags Count)', fieldType: 'NUMBER', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'packed_qty', fieldName: 'Total Packed Quantity', fieldType: 'DECIMAL', unit: 'kg', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'packaging_material', fieldName: 'Packaging Material', fieldType: 'SELECT', options: ['HDPE Woven Bag', 'BOPP Laminated Bag', 'Jute Gunny Bag', 'Laminated Pouch', 'Corrugated Box'], section: 'PACKAGING', isRequired: false },
      { fieldCode: 'packaging_material_qty', fieldName: 'Packaging Material Used (Pcs)', fieldType: 'NUMBER', unit: 'Pcs', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'rejected_packs', fieldName: 'Rejected / Damaged Packs', fieldType: 'NUMBER', unit: 'Pcs', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'packing_waste_qty', fieldName: 'Packing Waste / Spillage', fieldType: 'DECIMAL', unit: 'kg', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'sealing_quality_check', fieldName: 'Stitching / Sealing Quality Check', fieldType: 'SELECT', options: ['PERFECT_SEAL', 'ACCEPTABLE', 'LEAKAGE_REJECT'], section: 'QUALITY', isRequired: false },
      { fieldCode: 'batch_lot_number', fieldName: 'Batch / Lot Code Printed', fieldType: 'TEXT', section: 'PACKAGING', isRequired: false },
      { fieldCode: 'quality_result', fieldName: 'Packaging Quality Check', fieldType: 'SELECT', options: ['PASSED', 'FAILED', 'REINSPECT'], section: 'QUALITY', isRequired: false },
    ];
  }

  const fieldMap = new Map<string, any>();
  commonFields.forEach((f) => fieldMap.set(f.fieldCode, f));
  stageSpecificFields.forEach((f) => fieldMap.set(f.fieldCode, f));

  // Remove generic common fields that are superseded by stage-specific equivalents
  // so operators don't see duplicate output / waste fields.
  const hasSpecificOutput = stageSpecificFields.some((f) =>
    ['cleaned_output_qty', 'destoned_output_qty', 'milled_output_qty', 'fine_main_output_qty',
     'grade_1_output_qty', 'accepted_output_qty', 'packed_qty'].includes(f.fieldCode)
  );
  const hasSpecificWaste = stageSpecificFields.some((f) =>
    ['dust_foreign_matter_qty', 'stone_foreign_matter_qty', 'bran_byproduct_qty',
     'packing_waste_qty'].includes(f.fieldCode)
  );
  if (hasSpecificOutput) { fieldMap.delete('output_qty'); fieldMap.delete('output_unit'); }
  if (hasSpecificWaste)  { fieldMap.delete('waste_loss_qty'); fieldMap.delete('waste_loss_unit'); }

  let seq = 1;
  const result: any[] = [];
  fieldMap.forEach((f) => {
    result.push({
      id: randomUUID(),
      batchStageId,
      sourceConfigId: null,
      fieldCode: f.fieldCode,
      fieldName: f.fieldName,
      description: f.description || null,
      fieldType: f.fieldType,
      unit: f.unit || null,
      isRequired: f.isRequired ?? false,
      sequence: seq++,
      options: f.options ? f.options : null,
      section: f.section || 'GENERAL',
      actualValue: f.actualValue ?? null,
    });
  });

  return result;
}

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, stageId } = await ctx.params;

  const batchStage = await findBatchStage(id, stageId, shop.id);
  if (!batchStage) {
    throw new ApiError(404, 'Batch stage not found');
  }

  let fields = await prisma.batchStageExecutionField.findMany({
    where: {
      batchStageId: batchStage.id,
    },
    orderBy: { sequence: 'asc' },
  });

  const defaultDefs = generateDefaultFieldsForStage(batchStage.stageName, batchStage.id, batchStage.batch, batchStage);
  const validCodes = new Set(defaultDefs.map((d) => d.fieldCode));

  // Remove stale duplicate fields that are no longer in the canonical definition
  // (e.g. output_qty when cleaned_output_qty supersedes it for Cleaning stages)
  const staleCodes = fields.map((f) => f.fieldCode).filter((c) => !validCodes.has(c));
  if (staleCodes.length > 0) {
    await prisma.batchStageExecutionField.deleteMany({
      where: { batchStageId: batchStage.id, fieldCode: { in: staleCodes } },
    });
    fields = fields.filter((f) => validCodes.has(f.fieldCode));
  }

  const existingCodes = new Set(fields.map((f) => f.fieldCode));
  const missingDefs = defaultDefs.filter((d) => !existingCodes.has(d.fieldCode));

  if (missingDefs.length > 0) {
    let nextSeq = fields.length > 0 ? Math.max(...fields.map((f) => f.sequence || 0)) + 1 : 1;
    const toInsert = missingDefs.map((d) => ({
      ...d,
      sequence: nextSeq++,
    }));
    await prisma.batchStageExecutionField.createMany({
      data: toInsert,
    });
    fields = await prisma.batchStageExecutionField.findMany({
      where: { batchStageId: batchStage.id },
      orderBy: { sequence: 'asc' },
    });
  }

  // Pipeline healing: sync input_qty from the previous completed stage's output.
  // If the previous stage has no outputKg stored (completed before the auto-seed
  // was in place), compute it from its execution fields so the chain self-heals.
  const OUTPUT_CODES_HEAL = new Set([
    'output_qty', 'cleaned_output_qty', 'destoned_output_qty', 'milled_output_qty',
    'fine_main_output_qty', 'accepted_output_qty', 'packed_qty',
    'grade_1_output_qty', 'grade_2_output_qty', 'grade_3_output_qty',
  ]);

  const allStages: any[] = (batchStage.batch as any).stages || [];
  const thisIdx = allStages.findIndex((s: any) => s.id === batchStage.id);
  if (thisIdx > 0) {
    const prevStage = allStages[thisIdx - 1];
    if (prevStage?.completedAt) {
      let prevOutputKg: number | null = prevStage.outputKg ?? null;

      // If outputKg was never stored, recover it from the prev stage's execution fields
      if (prevOutputKg == null) {
        const prevFields = await prisma.batchStageExecutionField.findMany({
          where: { batchStageId: prevStage.id },
        });
        let computed = 0;
        for (const f of prevFields) {
          if (OUTPUT_CODES_HEAL.has(f.fieldCode) && f.actualValue) {
            const v = Number(f.actualValue);
            if (!isNaN(v) && v > 0) computed += v;
          }
        }
        if (computed > 0) {
          prevOutputKg = computed;
          await prisma.batchStage.update({ where: { id: prevStage.id }, data: { outputKg: computed } });
        }
      }

      if (prevOutputKg != null) {
        const seededValue = String(prevOutputKg);
        if ((batchStage as any).inputKg !== prevOutputKg) {
          await prisma.batchStage.update({ where: { id: batchStage.id }, data: { inputKg: prevOutputKg } });
        }
        const inputQtyIdx = fields.findIndex((f: any) => f.fieldCode === 'input_qty');
        if (inputQtyIdx !== -1 && String(fields[inputQtyIdx].actualValue) !== seededValue) {
          await prisma.batchStageExecutionField.update({
            where: { id: fields[inputQtyIdx].id },
            data: { actualValue: seededValue },
          });
          fields[inputQtyIdx] = { ...fields[inputQtyIdx], actualValue: seededValue };
        }
      }
    }
  }

  // Pre-populate missing actualValue on returned fields if not yet explicitly saved
  const defaultMap = new Map<string, any>();
  defaultDefs.forEach((d) => defaultMap.set(d.fieldCode, d.actualValue));

  const responseFields = fields.map((f: any) => {
    if ((f.actualValue === null || f.actualValue === '' || f.actualValue === '0.00' || f.actualValue === 0) && defaultMap.has(f.fieldCode)) {
      return {
        ...f,
        actualValue: defaultMap.get(f.fieldCode) ?? f.actualValue,
      };
    }
    return f;
  });

  return json(responseFields);
});

export const PATCH = handle(async (req, ctx: any) => {
  const { shop, user } = await requireShop(req);
  const { id, stageId } = await ctx.params;
  const body = await readBody(req);

  const batchStage = await findBatchStage(id, stageId, shop.id);
  if (!batchStage) {
    throw new ApiError(404, 'Batch stage not found');
  }

  if (batchStage.completedAt) {
    throw new ApiError(400, 'Completed stage cannot be modified.', 'STAGE_COMPLETED');
  }

  const { executionFields } = body;
  if (!Array.isArray(executionFields)) {
    throw new ApiError(400, 'executionFields must be an array of field updates.');
  }

  const snapshotFields = await prisma.batchStageExecutionField.findMany({
    where: { batchStageId: batchStage.id },
  });

  const snapshotMap = new Map<string, any>();
  snapshotFields.forEach((f) => snapshotMap.set(f.fieldCode, f));

  // Collect all FK ids that need DB validation before touching data
  const machineIds: string[] = [];
  const productIds: string[] = [];
  const godownIds: string[] = [];
  const lotIds: string[] = [];

  const updates: Array<{ id: string; actualValue: any }> = [];

  for (const item of executionFields) {
    const { fieldCode, actualValue } = item;
    if (!fieldCode) continue;

    const targetField = snapshotMap.get(fieldCode);
    if (!targetField) {
      // Field may have been removed as a duplicate (e.g. output_qty superseded by cleaned_output_qty) — skip silently
      continue;
    }

    if (actualValue !== null && actualValue !== undefined && actualValue !== '') {
      const type = targetField.fieldType;

      if (type === 'NUMBER' || type === 'DECIMAL') {
        const num = Number(actualValue);
        if (isNaN(num)) throw new ApiError(400, `Field '${targetField.fieldName}' requires a valid numeric value.`);
      } else if (type === 'SELECT') {
        const opts = Array.isArray(targetField.options) ? targetField.options : [];
        if (opts.length > 0 && !opts.includes(String(actualValue))) {
          throw new ApiError(400, `Value '${actualValue}' is not a valid option for '${targetField.fieldName}'.`);
        }
      } else if (type === 'MULTI_SELECT') {
        const selected = Array.isArray(actualValue) ? actualValue : [actualValue];
        const opts = Array.isArray(targetField.options) ? targetField.options : [];
        if (opts.length > 0) {
          for (const val of selected) {
            if (!opts.includes(String(val))) throw new ApiError(400, `Value '${val}' is not a valid option for '${targetField.fieldName}'.`);
          }
        }
      } else if (type === 'DATE' || type === 'DATETIME') {
        const d = new Date(actualValue);
        if (isNaN(d.getTime())) throw new ApiError(400, `Field '${targetField.fieldName}' requires a valid date.`);
      } else if (type === 'MACHINE') {
        machineIds.push(String(actualValue));
      } else if (type === 'PRODUCT') {
        productIds.push(String(actualValue));
      } else if (type === 'GODOWN') {
        godownIds.push(String(actualValue));
      } else if (type === 'LOT') {
        lotIds.push(String(actualValue));
      }
    }

    updates.push({ id: targetField.id, actualValue: actualValue !== undefined ? actualValue : null });
  }

  // Batch-validate all FK references in parallel — one query per entity type instead of one per field
  const [machineCheck, productCheck, godownCheck, lotCheck] = await Promise.all([
    machineIds.length ? prisma.machine.findMany({ where: { id: { in: machineIds }, shopId: shop.id }, select: { id: true } }) : [],
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds }, shopId: shop.id }, select: { id: true } }) : [],
    godownIds.length ? prisma.godown.findMany({ where: { id: { in: godownIds }, shopId: shop.id }, select: { id: true } }) : [],
    lotIds.length ? prisma.rawMaterialLot.findMany({ where: { id: { in: lotIds }, shopId: shop.id }, select: { id: true } }) : [],
  ]);
  const validMachines = new Set((machineCheck as any[]).map((r: any) => r.id));
  const validProducts = new Set((productCheck as any[]).map((r: any) => r.id));
  const validGodowns = new Set((godownCheck as any[]).map((r: any) => r.id));
  const validLots    = new Set((lotCheck as any[]).map((r: any) => r.id));

  for (const id of machineIds) { if (!validMachines.has(id)) throw new ApiError(400, `Selected machine not found for this shop.`); }
  for (const id of productIds) { if (!validProducts.has(id)) throw new ApiError(400, `Selected product not found for this shop.`); }
  for (const id of godownIds)  { if (!validGodowns.has(id))  throw new ApiError(400, `Selected godown not found for this shop.`); }
  for (const id of lotIds)     { if (!validLots.has(id))     throw new ApiError(400, `Selected lot not found for this shop.`); }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.batchStageExecutionField.update({
        where: { id: u.id },
        data: { actualValue: u.actualValue },
      })
    )
  );

  // Fetch ALL saved fields to compute stage-level metrics from the complete picture.
  // Computing from only the incoming payload misses fields saved in earlier calls
  // (e.g. grade_1 saved now but grade_2/3 saved previously → partial sum).
  const updatedFields = await prisma.batchStageExecutionField.findMany({
    where: { batchStageId: batchStage.id },
    orderBy: { sequence: 'asc' },
  });

  // Field codes whose values sum into outputKg (primary flow-through output)
  const OUTPUT_SUM_CODES = new Set([
    'output_qty', 'cleaned_output_qty', 'destoned_output_qty', 'milled_output_qty',
    'fine_main_output_qty', 'accepted_output_qty', 'packed_qty',
    'grade_1_output_qty', 'grade_2_output_qty', 'grade_3_output_qty',
  ]);
  // Field codes whose values sum into wastageKg
  const WASTE_SUM_CODES = new Set([
    'waste_loss_qty', 'dust_foreign_matter_qty', 'stone_foreign_matter_qty',
    'rejected_qty', 'bran_byproduct_qty', 'coarse_broken_qty',
    'byproduct_qty', 'packing_waste_qty',
  ]);

  const stageUpdates: any = {};
  let totalOutput = 0;
  let totalWaste = 0;

  for (const f of updatedFields) {
    const val = f.actualValue !== null && f.actualValue !== '' ? Number(f.actualValue) : NaN;
    if (f.fieldCode === 'input_qty') {
      stageUpdates.inputKg = !isNaN(val) ? val : null;
    } else if (OUTPUT_SUM_CODES.has(f.fieldCode) && !isNaN(val)) {
      totalOutput += val;
    } else if (WASTE_SUM_CODES.has(f.fieldCode) && !isNaN(val)) {
      totalWaste += val;
    } else if (f.fieldCode === 'operator_name') {
      stageUpdates.operatorName = f.actualValue ? String(f.actualValue).trim() || null : null;
    } else if (f.fieldCode === 'notes') {
      stageUpdates.notes = f.actualValue ? String(f.actualValue).trim() || null : null;
    }
  }

  if (totalOutput > 0) stageUpdates.outputKg = totalOutput;
  if (totalWaste > 0) stageUpdates.wastageKg = totalWaste;

  if (Object.keys(stageUpdates).length > 0) {
    await prisma.batchStage.update({
      where: { id: batchStage.id },
      data: stageUpdates,
    });
  }

  await recordStageAuditEvent({
    shopId: shop.id,
    userId: user?.id,
    action: 'EXECUTION_FIELDS_UPDATED',
    entityId: batchStage.id,
    details: { batchId: id, updatedCount: updates.length },
  });

  return json(updatedFields);
});
