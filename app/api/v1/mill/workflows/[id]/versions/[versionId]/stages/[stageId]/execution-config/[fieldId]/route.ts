import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DECIMAL',
  'SELECT',
  'MULTI_SELECT',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TEXTAREA',
  'MACHINE',
  'OPERATOR',
  'PRODUCT',
  'GODOWN',
  'LOT',
];

export const PUT = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId, fieldId } = await ctx.params;
  const body = await readBody(req);

  const stage = await prisma.workflowStage.findFirst({
    where: {
      id: stageId,
      workflowVersionId: versionId,
      workflowVersion: {
        id: versionId,
        workflowId: id,
        workflow: { shopId: shop.id },
      },
    },
    include: {
      workflowVersion: true,
    },
  });

  if (!stage) {
    throw new ApiError(404, 'Workflow stage not found');
  }

  if (stage.workflowVersion.status !== 'draft') {
    throw new ApiError(400, 'Cannot modify configuration of a non-draft workflow version.');
  }

  const existingField = await prisma.stageExecutionFieldConfig.findFirst({
    where: {
      id: fieldId,
      workflowStageId: stageId,
      shopId: shop.id,
    },
  });

  if (!existingField) {
    throw new ApiError(404, 'Execution field configuration not found');
  }

  const {
    fieldCode,
    fieldName,
    description,
    fieldType,
    unit,
    isRequired,
    isActive,
    sequence,
    options,
    defaultValue,
    placeholder,
    helpText,
    section,
  } = body;

  let normalizedFieldType: string | undefined = undefined;
  if (fieldType) {
    normalizedFieldType = String(fieldType).toUpperCase();
    if (!ALLOWED_FIELD_TYPES.includes(normalizedFieldType)) {
      throw new ApiError(400, `Invalid fieldType. Must be one of: ${ALLOWED_FIELD_TYPES.join(', ')}`);
    }
  }

  if (fieldCode && String(fieldCode).trim() !== existingField.fieldCode) {
    const codeConflict = await prisma.stageExecutionFieldConfig.findFirst({
      where: {
        workflowStageId: stageId,
        fieldCode: String(fieldCode).trim(),
        id: { not: fieldId },
      },
    });
    if (codeConflict) {
      throw new ApiError(409, `Field code '${fieldCode}' already exists in this stage.`);
    }
  }

  const updated = await prisma.stageExecutionFieldConfig.update({
    where: { id: fieldId },
    data: {
      ...(fieldCode !== undefined && { fieldCode: String(fieldCode).trim() }),
      ...(fieldName !== undefined && { fieldName: String(fieldName).trim() }),
      ...(description !== undefined && { description: description ? String(description).trim() : null }),
      ...(normalizedFieldType !== undefined && { fieldType: normalizedFieldType }),
      ...(unit !== undefined && { unit: unit ? String(unit).trim() : null }),
      ...(isRequired !== undefined && { isRequired: Boolean(isRequired) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(sequence !== undefined && { sequence: Number(sequence) }),
      ...(options !== undefined && { options: options ?? null }),
      ...(defaultValue !== undefined && { defaultValue: defaultValue ? String(defaultValue).trim() : null }),
      ...(placeholder !== undefined && { placeholder: placeholder ? String(placeholder).trim() : null }),
      ...(helpText !== undefined && { helpText: helpText ? String(helpText).trim() : null }),
      ...(section !== undefined && { section: section ? String(section).trim() : null }),
    },
  });

  return json(updated);
});

export const PATCH = PUT;

export const DELETE = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId, fieldId } = await ctx.params;

  const stage = await prisma.workflowStage.findFirst({
    where: {
      id: stageId,
      workflowVersionId: versionId,
      workflowVersion: {
        id: versionId,
        workflowId: id,
        workflow: { shopId: shop.id },
      },
    },
    include: {
      workflowVersion: true,
    },
  });

  if (!stage) {
    throw new ApiError(404, 'Workflow stage not found');
  }

  if (stage.workflowVersion.status !== 'draft') {
    throw new ApiError(400, 'Cannot modify configuration of a non-draft workflow version.');
  }

  const existingField = await prisma.stageExecutionFieldConfig.findFirst({
    where: {
      id: fieldId,
      workflowStageId: stageId,
      shopId: shop.id,
    },
  });

  if (!existingField) {
    throw new ApiError(404, 'Execution field configuration not found');
  }

  await prisma.stageExecutionFieldConfig.delete({
    where: { id: fieldId },
  });

  return json({ success: true });
});
