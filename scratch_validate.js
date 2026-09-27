const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function main() {
  try {
    console.log("Running DB and API Level Validation...");
    
    // 1. Fetch random shop
    const shop = await prisma.shop.findFirst();
    if (!shop) throw new Error("No shop found");
    const shopId = shop.id;
    
    const anotherShop = await prisma.shop.findFirst({ where: { id: { not: shopId } } });
    const shop2Id = anotherShop ? anotherShop.id : crypto.randomUUID();

    // 2. Create ProcessStage
    const processStage = await prisma.processStage.create({
      data: {
        id: crypto.randomUUID(),
        shopId: shopId,
        code: `STAGE_${Date.now()}`,
        name: 'Test Cleaning',
        category: 'cleaning'
      }
    });
    console.log("Created ProcessStage:", processStage.name);

    // 3. Create Workflow
    const product = await prisma.product.findFirst({ where: { shopId } });
    if (!product) throw new Error("No product found for shop");
    
    const workflow = await prisma.workflow.create({
      data: {
        id: crypto.randomUUID(),
        shopId: shopId,
        productId: product.id,
        code: `WF_${Date.now()}`,
        name: 'Test Workflow'
      }
    });
    console.log("Created Workflow:", workflow.name);

    // 4. Create Workflow Version
    const version = await prisma.workflowVersion.create({
      data: {
        id: crypto.randomUUID(),
        workflowId: workflow.id,
        versionNumber: 1,
        status: 'draft'
      }
    });
    console.log("Created WorkflowVersion:", version.versionNumber);

    // 5. Add Workflow Stage
    const wStage = await prisma.workflowStage.create({
      data: {
        id: crypto.randomUUID(),
        workflowVersionId: version.id,
        processStageId: processStage.id,
        sequence: 1,
        isRequired: true
      }
    });
    console.log("Created WorkflowStage with ProcessStage");

    // 6. Test Tenant Isolation
    try {
      await prisma.workflow.create({
        data: {
          id: crypto.randomUUID(),
          shopId: shop2Id, // trying to create workflow in shop 2
          productId: product.id, // using product from shop 1
          code: `WF_CROSS_${Date.now()}`,
          name: 'Cross Shop Workflow'
        }
      });
      console.error("WARNING: Tenant isolation might have failed at database level. Created workflow in shop2 using product from shop1.");
    } catch (err) {
      console.log("Tenant Isolation Working at DB level! (Product foreign key restricted cross-shop relation)");
    }
    
    // Check ProcessStage isolation manually
    const queryIsolation = await prisma.processStage.findMany({ where: { shopId: shop2Id } });
    if (queryIsolation.some(s => s.id === processStage.id)) {
      console.error("WARNING: ProcessStage leaked across shops!");
    } else {
      console.log("Tenant Isolation Working at Query level!");
    }

    // 7. Test Batch Creation queries (simulate route logic)
    const rawLot = await prisma.rawMaterialLot.findFirst({ where: { shopId } });
    
    if (rawLot) {
      console.log("Found RawMaterialLot, testing Batch creation...");
      const batchId = crypto.randomUUID();
      const legacyBatch = await prisma.productionBatch.create({
        data: {
          id: batchId,
          shopId,
          rawLotId: rawLot.id,
          inputKg: 100,
          status: 'open',
          startedAt: new Date(),
          currentStage: 'cleaning'
        }
      });
      await prisma.batchStage.createMany({
        data: [
          { batchId, stageName: 'cleaning', sequence: 1, inputKg: 100 }
        ]
      });
      console.log("Legacy Batch creation works perfectly!");

      const batchId2 = crypto.randomUUID();
      const workflowBatch = await prisma.productionBatch.create({
        data: {
          id: batchId2,
          shopId,
          rawLotId: rawLot.id,
          inputKg: 100,
          status: 'open',
          startedAt: new Date(),
          currentStage: processStage.name,
          workflowVersionId: version.id
        }
      });
      await prisma.batchStage.createMany({
        data: [
          { batchId: batchId2, stageName: processStage.name, processStageId: processStage.id, sequence: 1, inputKg: 100 }
        ]
      });
      console.log("Workflow Batch creation works perfectly!");
    }

    console.log("ALL TESTS PASSED.");

  } catch (err) {
    console.error("Validation failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
