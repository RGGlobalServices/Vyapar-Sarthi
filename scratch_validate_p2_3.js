const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getOrCreateProduct(shopId, name, sku, isRawMaterial = false) {
  const p = await prisma.product.findFirst({ where: { shopId, sku } });
  if (p) return p;
  return prisma.product.create({ data: { shop: { connect: { id: shopId } }, name, sku, isRawMaterial }});
}

async function getOrCreateStage(shopId, code, name) {
  const s = await prisma.processStage.findFirst({ where: { shopId, code } });
  if (s) return s;
  return prisma.processStage.create({ data: { shop: { connect: { id: shopId } }, code, name }});
}

async function getOrCreateWorkflow(shopId, productId, code, name) {
  const wf = await prisma.workflow.findFirst({ where: { shopId, code } });
  if (wf) return wf;
  return prisma.workflow.create({ data: { shop: { connect: { id: shopId } }, product: { connect: { id: productId } }, code, name }});
}

async function runTests() {
  console.log("=== PHASE 2.3 INTEGRATION TEST ===");
  let shop1, p1, p2, ps1, wf, activeVersion, lot1, batch;

  try {
    console.log("1. Setting up tenant shops, products, workflow...");
    shop1 = await prisma.shop.upsert({ where: { shopCode: 'SHOP-TEST-23-1' }, update: {}, create: { name: 'Shop 1', shopCode: 'SHOP-TEST-23-1' }});
    
    p1 = await getOrCreateProduct(shop1.id, 'Paddy', 'P23-PDY', true);
    p2 = await getOrCreateProduct(shop1.id, 'Rice', 'P23-RCE', false);

    ps1 = await getOrCreateStage(shop1.id, 'PS-M1', 'Milling');
    wf = await getOrCreateWorkflow(shop1.id, p2.id, 'WF-M1', 'Milling Workflow');
    
    activeVersion = await prisma.workflowVersion.create({
      data: {
        workflow: { connect: { id: wf.id } },
        versionNumber: 1,
        status: 'ACTIVE',
        stages: {
          create: [{
            processStage: { connect: { id: ps1.id } },
            sequence: 1,
            inputConfigs: { create: [{ product: { connect: { id: p1.id } }, inputType: 'RAW_MATERIAL', quantityRuleType: 'FIXED', quantityValue: 100, unit: 'kg' }] },
            outputConfigs: { create: [{ product: { connect: { id: p2.id } }, outputType: 'FINISHED_GOOD', quantityRuleType: 'PERCENTAGE_OF_INPUT', expectedQuantity: 65, unit: 'kg' }] },
            qualityParameters: { create: [{ parameterName: 'Moisture', dataType: 'NUMBER', minValue: 10, maxValue: 14, isRequired: true, failureAction: 'HOLD', isCritical: true }] }
          }]
        }
      }
    });

    lot1 = await prisma.rawMaterialLot.create({
      data: { shop: { connect: { id: shop1.id } }, product: { connect: { id: p1.id } }, lotNumber: 'L23-1', quantity: 500, remainingQuantity: 500, receivedDate: new Date() }
    });

    console.log("2. Creating batch with snapshot...");
    
    const newBatchId = 'd05ca482-ebc5-4309-8d4e-123456789abc';
    await prisma.productionBatch.deleteMany({ where: { id: newBatchId }});
    
    await prisma.$transaction([
      prisma.productionBatch.create({
        data: {
          id: newBatchId,
          shopId: shop1.id,
          batchNumber: 'B-23-TEST-1',
          rawLotId: lot1.id,
          inputKg: 100,
          status: 'open',
          currentStage: 'Milling',
          workflowVersionId: activeVersion.id
        }
      }),
      prisma.batchWorkflowSnapshot.create({
        data: {
          productionBatchId: newBatchId,
          workflowVersionId: activeVersion.id,
          workflowName: wf.name,
          versionNumber: activeVersion.versionNumber,
          stages: {
            create: [{
              sourceWorkflowStageId: activeVersion.id, 
              processStageId: ps1.id,
              stageName: 'Milling',
              sequence: 1,
              inputs: { create: [{ productId: p1.id, inputType: 'RAW_MATERIAL', quantityRuleType: 'FIXED', configuredQuantityValue: 100, unit: 'kg' }] },
              outputs: { create: [{ productId: p2.id, outputType: 'FINISHED_GOOD', quantityRuleType: 'PERCENTAGE_OF_INPUT', expectedQuantity: 65, unit: 'kg' }] },
              qualityParameters: { create: [{ parameterName: 'Moisture', dataType: 'NUMBER', minValue: 10, maxValue: 14, isRequired: true, isCritical: true, failureAction: 'HOLD' }] }
            }]
          }
        }
      })
    ]);

    batch = await prisma.productionBatch.findUnique({ where: { id: newBatchId }, include: { batchWorkflowSnapshot: { include: { stages: { include: { inputs: true, outputs: true, qualityParameters: true } } } } } });
    if (!batch.batchWorkflowSnapshot) throw new Error("Snapshot not created!");

    console.log("3. Executing Stage...");
    const stage = batch.batchWorkflowSnapshot.stages[0];
    
    await prisma.batchStageSnapshot.update({ where: { id: stage.id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    await prisma.batchStageInput.update({ where: { id: stage.inputs[0].id }, data: { actualQuantity: 100, actualUnit: 'kg', sourceLotId: lot1.id } });
    await prisma.batchStageOutput.update({ where: { id: stage.outputs[0].id }, data: { actualQuantity: 65, actualUnit: 'kg' } });
    await prisma.batchStageQualityParameter.update({ where: { id: stage.qualityParameters[0].id }, data: { actualValue: "12", result: "PASS" } });
    
    console.log("Integration test steps executed successfully!");

  } catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
  } finally {
    console.log("Cleaning up...");
    if (batch) await prisma.productionBatch.delete({ where: { id: batch.id } }).catch(() => {});
    if (lot1) await prisma.rawMaterialLot.delete({ where: { id: lot1.id } }).catch(() => {});
    if (activeVersion) await prisma.workflowVersion.delete({ where: { id: activeVersion.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runTests();
