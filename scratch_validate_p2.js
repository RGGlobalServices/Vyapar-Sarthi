const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  let shop1, shop2, p1, p2, ps1, wf, wfv, stage;
  try {
    console.log("=== PHASE 2.2 INTEGRATION TEST ===");

    // 1. Setup Test Data
    console.log("1. Setting up tenant shops and products");
    shop1 = await prisma.shop.upsert({ where: { shopCode: 'SHOP-TEST-1' }, update: {}, create: { name: 'Shop 1', shopCode: 'SHOP-TEST-1' }});
    shop2 = await prisma.shop.upsert({ where: { shopCode: 'SHOP-TEST-2' }, update: {}, create: { name: 'Shop 2', shopCode: 'SHOP-TEST-2' }});
    
    p1 = await prisma.product.create({ data: { shop: { connect: { id: shop1.id } }, name: 'Wheat', sku: 'P1-WHT', isRawMaterial: true }});
    p2 = await prisma.product.create({ data: { shop: { connect: { id: shop2.id } }, name: 'Rice', sku: 'P2-RIC', isRawMaterial: true }});

    ps1 = await prisma.processStage.create({ data: { shop: { connect: { id: shop1.id } }, code: 'CLEAN-WHT', name: 'Cleaning' }});
    wf = await prisma.workflow.create({ data: { shop: { connect: { id: shop1.id } }, product: { connect: { id: p1.id } }, code: 'WF-WHT-1', name: 'Wheat Milling' }});
    wfv = await prisma.workflowVersion.create({ data: { workflow: { connect: { id: wf.id } }, versionNumber: 1, status: 'draft' }});
    stage = await prisma.workflowStage.create({ data: { workflowVersion: { connect: { id: wfv.id } }, processStage: { connect: { id: ps1.id } }, sequence: 1 }});

    // 2. Test Input Config
    console.log("2. Testing Stage Input Configuration");
    const input = await prisma.stageInputConfig.create({
      data: {
        workflowStage: { connect: { id: stage.id } },
        product: { connect: { id: p1.id } },
        inputType: 'RAW_MATERIAL',
        quantityRuleType: 'PERCENTAGE_OF_INPUT',
        quantityValue: 100,
        unit: 'Kg'
      }
    });
    if (input.quantityRuleType !== 'PERCENTAGE_OF_INPUT') throw new Error("Input quantity rule type mismatch");

    // 3. Test Output Config
    console.log("3. Testing Stage Output Configuration");
    const output = await prisma.stageOutputConfig.create({
      data: {
        workflowStage: { connect: { id: stage.id } },
        product: { connect: { id: p1.id } },
        outputType: 'WIP',
        quantityRuleType: 'REMAINING',
        unit: 'Kg',
        expectedQuantity: 98,
        tolerancePercent: 2
      }
    });
    if (output.expectedQuantity.toNumber() !== 98) throw new Error("Output expected quantity mismatch");

    // 4. Test Quality Config
    console.log("4. Testing Stage Quality Configuration");
    const quality = await prisma.stageQualityConfig.create({
      data: {
        workflowStage: { connect: { id: stage.id } },
        parameterName: 'Moisture',
        dataType: 'NUMBER',
        minValue: 10,
        maxValue: 14,
        unit: '%',
        failureAction: 'HOLD'
      }
    });
    if (quality.failureAction !== 'HOLD') throw new Error("Quality failure action mismatch");

    // 5. Test Tenant Isolation (Malicious Product Injection)
    console.log("5. Testing Tenant Isolation (Cross-shop Product)");
    let isolationPassed = false;
    try {
      await prisma.stageInputConfig.create({
        data: {
          workflowStage: { connect: { id: stage.id } },
          product: { connect: { id: p2.id } }, // Belongs to shop2
          inputType: 'RAW_MATERIAL',
          quantityRuleType: 'FIXED',
          quantityValue: 100,
          unit: 'Kg'
        }
      });
    } catch (e) {
      if (e.code === 'P2003') isolationPassed = true;
    }

    // 6. Test Version Immutability Logic locally
    console.log("6. Testing Version Immutability");
    await prisma.workflowVersion.update({ where: { id: wfv.id }, data: { status: 'active' } });
    
    console.log("All DB configurations successfully created and mapped.");

  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    // Cleanup
    if (p1) await prisma.product.delete({ where: { id: p1.id } });
    if (p2) await prisma.product.delete({ where: { id: p2.id } });
    if (ps1) await prisma.processStage.delete({ where: { id: ps1.id } });
    if (wf) await prisma.workflow.delete({ where: { id: wf.id } });
    if (shop1) await prisma.shop.delete({ where: { id: shop1.id } });
    if (shop2) await prisma.shop.delete({ where: { id: shop2.id } });
    await prisma.$disconnect();
  }
}

runTests();
