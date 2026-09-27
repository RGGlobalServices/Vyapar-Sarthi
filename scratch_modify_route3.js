const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/api/v1/mill/batches/route.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the AST manually by locating the exact block
const findString = `  if (workflowVersionId) {
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
  }`;

const replaceString = `  let loadedVersion: any = null;
  if (workflowVersionId) {
    loadedVersion = await prisma.workflowVersion.findFirst({
      where: { id: workflowVersionId, workflow: { shopId: shop.id } },
      include: {
        workflow: true,
        stages: {
          orderBy: { sequence: 'asc' },
          include: { 
            processStage: true,
            stageInputConfigs: true,
            stageOutputConfigs: true,
            stageQualityConfigs: true
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
  }`;

if (content.indexOf(findString) !== -1) {
  content = content.replace(findString, replaceString);
  console.log("Replaced version find/validate logic");
} else {
  console.log("Could not find the version logic block!");
}

const findString2 = `    (prisma as any).batchStage.createMany({
      data: stageDefinitions.map((def, i) => ({
        batchId: newBatchId,
        stageName: def.name,
        processStageId: def.processStageId || null,
        machineId: def.machineId || null,
        sequence: i + 1,
        inputKg: i === 0 ? inputKg : null,
      })),
    }),`;

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
                create: (s.stageInputConfigs || []).map((i: any) => ({
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
                create: (s.stageOutputConfigs || []).map((o: any) => ({
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
                create: (s.stageQualityConfigs || []).map((q: any) => ({
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

if (content.indexOf(findString2) !== -1) {
  content = content.replace(findString2, findString2 + extraSnapshot);
  console.log("Replaced snapshot creation block");
} else {
  console.log("Could not find snapshot creation block!");
}

fs.writeFileSync(filePath, content);
