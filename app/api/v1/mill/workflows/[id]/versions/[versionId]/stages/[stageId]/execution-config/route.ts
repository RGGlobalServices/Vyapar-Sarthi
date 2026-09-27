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

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId } = await ctx.params;

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
  });

  if (!stage) {
    throw new ApiError(404, 'Workflow stage not found');
  }

  const fields = await prisma.stageExecutionFieldConfig.findMany({
    where: {
      workflowStageId: stageId,
      shopId: shop.id,
    },
    orderBy: { sequence: 'asc' },
  });

  return json(fields);
});

export const POST = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, versionId, stageId } = await ctx.params;
  const body = await readBody(req);

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

  if (!fieldCode || !fieldName || !fieldType) {
    throw new ApiError(400, 'fieldCode, fieldName, and fieldType are required.');
  }

  const normalizedFieldType = String(fieldType).toUpperCase();
  if (!ALLOWED_FIELD_TYPES.includes(normalizedFieldType)) {
    throw new ApiError(400, `Invalid fieldType. Must be one of: ${ALLOWED_FIELD_TYPES.join(', ')}`);
  }

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

  // Check unique fieldCode in workflow stage
  const existingCode = await prisma.stageExecutionFieldConfig.findFirst({
    where: {
      workflowStageId: stageId,
      fieldCode: String(fieldCode).trim(),
    },
  });

  if (existingCode) {
    throw new ApiError(409, `Field code '${fieldCode}' already exists in this stage.`);
  }

  const field = await prisma.stageExecutionFieldConfig.create({
    data: {
      shopId: shop.id,
      workflowStageId: stageId,
      fieldCode: String(fieldCode).trim(),
      fieldName: String(fieldName).trim(),
      description: description ? String(description).trim() : null,
      fieldType: normalizedFieldType,
      unit: unit ? String(unit).trim() : null,
      isRequired: isRequired ?? false,
      isActive: isActive ?? true,
      sequence: sequence !== undefined && sequence !== null ? Number(sequence) : 0,
      options: options ?? null,
      defaultValue: defaultValue ? String(defaultValue).trim() : null,
      placeholder: placeholder ? String(placeholder).trim() : null,
      helpText: helpText ? String(helpText).trim() : null,
      section: section ? String(section).trim() : null,
    },
  });

  return json(field, 201);
});
