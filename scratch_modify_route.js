const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/api/v1/mill/batches/route.ts');
let content = fs.readFileSync(filePath, 'utf8');

const target1 = `
  if (workflowVersionId) {
    const version = await prisma.workflowVersion.findFirst({
      where: { id: workflowVersionId, workflow: { shopId: shop.id } },
      include: {
        stages: {
          orderBy: { sequence: 'asc' },
          include: { processStage: true }
        }
      }
    });
    if (!version) throw new ApiError(404, 'Workflow version not found', 'WORKFLOW_NOT_FOUND');
    if (version.stages.length === 0) throw new ApiError(400, 'Workflow version has no stages', 'WORKFLOW_EMPTY');
    
    stageDefinitions = version.stages.map(s => ({
      name: s.processStage.name,
      processStageId: s.processStageId,
      machineId: s.machineId || undefined
    }));
  } else {
    const stageNames = parseStages(body.stages);
    stageDefinitions = stageNames.map(name => ({ name }));
  }
`;

const replacement1 = `
  let loadedVersion: any = null;
  if (workflowVersionId) {
    loadedVersion = await prisma.workflowVersion.findFirst({
      where: { id: workflowVersionId, workflow: { shopId: shop.id } },
      include: {
        workflow: true,
        stages: {
          orderBy: { sequence: 'asc' },
          include: { 
            processStage: true,
            inputs: true,
            outputs: true,
            qualityParameters: true
          }
        }
      }
    });
    if (!loadedVersion) throw new ApiError(404, 'Workflow version not found', 'WORKFLOW_NOT_FOUND');
    if (loadedVersion.status !== 'ACTIVE') throw new ApiError(400, 'Workflow version must be ACTIVE to start a batch', 'WORKFLOW_NOT_ACTIVE');
    if (loadedVersion.stages.length === 0) throw new ApiError(400, 'Workflow version has no stages', 'WORKFLOW_EMPTY');
    
    stageDefinitions = loadedVersion.stages.map((s: any) => ({
      name: s.processStage.name,
      processStageId: s.processStageId,
      machineId: s.machineId || undefined
    }));
  } else {
    const stageNames = parseStages(body.stages);
    stageDefinitions = stageNames.map(name => ({ name }));
  }
`;

content = content.replace(target1.trim(), replacement1.trim());

const target2 = `
    (prisma as any).batchStage.createMany({
      data: stageDefinitions.map((def, i) => ({
        batchId: newBatchId,
        stageName: def.name,
        processStageId: def.processStageId || null,
        machineId: def.machineId || null,
        sequence: i + 1,
        inputKg: i === 0 ? inputKg : null,
      })),
    }),
`;

const replacement2 = `
    (prisma as any).batchStage.createMany({
      data: stageDefinitions.map((def, i) => ({
        batchId: newBatchId,
        stageName: def.name,
        processStageId: def.processStageId || null,
        machineId: def.machineId || null,
        sequence: i + 1,
        inputKg: i === 0 ? inputKg : null,
      })),
    }),
`; // We keep it, but add snapshot creation below

const extraSnapshot = `
  if (loadedVersion) {
    const snapshotId = randomUUID();
    ops.push(
      prisma.batchWorkflowSnapshot.create({
        data: {
          id: snapshotId,
          productionBatchId: newBatchId,
          workflowVersionId: loadedVersion.id,
          workflowName: loadedVersion.workflow.name,
          versionNumber: loadedVersion.versionNumber,
          stages: {
            create: loadedVersion.stages.map((s: any, idx: number) => ({
              id: randomUUID(),
              sourceWorkflowStageId: s.id,
              processStageId: s.processStageId,
              machineId: s.machineId,
              stageName: s.processStage.name,
              sequence: idx + 1,
              isRequired: true,
              instructions: s.instructions,
              status: idx === 0 ? 'PENDING' : 'PENDING',
              inputs: {
                create: s.inputs.map((i: any) => ({
                  id: randomUUID(),
                  sourceConfigId: i.id,
                  productId: i.productId,
                  inputType: i.inputType,
                  quantityRuleType: i.quantityRuleType,
                  configuredQuantityValue: i.quantityValue,
                  unit: i.unit,
                  isRequired: i.isRequired,
                }))
              },
              outputs: {
                create: s.outputs.map((o: any) => ({
                  id: randomUUID(),
                  sourceConfigId: o.id,
                  productId: o.productId,
                  outputType: o.outputType,
                  quantityRuleType: o.quantityRuleType,
                  configuredQuantityValue: o.quantityValue,
                  unit: o.unit,
                  expectedQuantity: o.expectedQuantity,
                  minimumQuantity: o.minimumQuantity,
                  maximumQuantity: o.maximumQuantity,
                  tolerancePercent: o.tolerancePercent,
                  isRequired: o.isRequired,
                }))
              },
              qualityParameters: {
                create: s.qualityParameters.map((q: any) => ({
                  id: randomUUID(),
                  sourceConfigId: q.id,
                  parameterName: q.parameterName,
                  parameterCode: q.parameterCode,
                  dataType: q.dataType,
                  unit: q.unit,
                  minValue: q.minValue,
                  maxValue: q.maxValue,
                  targetValue: q.targetValue,
                  isRequired: q.isRequired,
                  isCritical: q.isCritical,
                  failureAction: q.failureAction,
                  instructions: q.instructions,
                }))
              }
            }))
          }
        }
      })
    );
  }
`;

content = content.replace(target2.trim(), target2.trim() + extraSnapshot);

fs.writeFileSync(filePath, content);
console.log('Done replacing content.');
