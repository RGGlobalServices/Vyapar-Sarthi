const fs = require('fs');

const filePath = 'app/api/v1/mill/batches/route.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target2 = `    (prisma as any).batchStage.createMany({
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

if (content.includes(target2)) {
    content = content.replace(target2, target2 + extraSnapshot);
    fs.writeFileSync(filePath, content);
    console.log("Successfully patched snapshot creation!");
} else {
    console.log("FAILED to find target2 string to patch snapshot creation.");
}
