const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const queries = [
`CREATE TABLE IF NOT EXISTS "stage_input_configs" (
  "id" UUID NOT NULL,
  "workflow_stage_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "input_type" VARCHAR NOT NULL,
  "quantity_rule_type" VARCHAR NOT NULL,
  "quantity_value" DECIMAL(10,3),
  "unit" VARCHAR NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "notes" VARCHAR,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_input_configs_pkey" PRIMARY KEY ("id")
)`,
`CREATE TABLE IF NOT EXISTS "stage_output_configs" (
  "id" UUID NOT NULL,
  "workflow_stage_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "output_type" VARCHAR NOT NULL,
  "quantity_rule_type" VARCHAR NOT NULL,
  "quantity_value" DECIMAL(10,3),
  "unit" VARCHAR NOT NULL,
  "expected_quantity" DECIMAL(10,3),
  "minimum_quantity" DECIMAL(10,3),
  "maximum_quantity" DECIMAL(10,3),
  "tolerance_percent" DECIMAL(5,2),
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "notes" VARCHAR,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_output_configs_pkey" PRIMARY KEY ("id")
)`,
`CREATE TABLE IF NOT EXISTS "stage_quality_configs" (
  "id" UUID NOT NULL,
  "workflow_stage_id" UUID NOT NULL,
  "parameter_name" VARCHAR NOT NULL,
  "parameter_code" VARCHAR,
  "data_type" VARCHAR NOT NULL,
  "unit" VARCHAR,
  "min_value" DECIMAL(10,3),
  "max_value" DECIMAL(10,3),
  "target_value" VARCHAR,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "is_critical" BOOLEAN NOT NULL DEFAULT false,
  "failure_action" VARCHAR NOT NULL DEFAULT 'WARNING',
  "instructions" VARCHAR,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_quality_configs_pkey" PRIMARY KEY ("id")
)`,
`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stage_input_configs_workflow_stage_id_idx') THEN
    CREATE INDEX "stage_input_configs_workflow_stage_id_idx" ON "stage_input_configs"("workflow_stage_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stage_input_configs_product_id_idx') THEN
    CREATE INDEX "stage_input_configs_product_id_idx" ON "stage_input_configs"("product_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stage_output_configs_workflow_stage_id_idx') THEN
    CREATE INDEX "stage_output_configs_workflow_stage_id_idx" ON "stage_output_configs"("workflow_stage_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stage_output_configs_product_id_idx') THEN
    CREATE INDEX "stage_output_configs_product_id_idx" ON "stage_output_configs"("product_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stage_quality_configs_workflow_stage_id_idx') THEN
    CREATE INDEX "stage_quality_configs_workflow_stage_id_idx" ON "stage_quality_configs"("workflow_stage_id");
  END IF;
END $$`,
`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_input_configs_workflow_stage_id_fkey') THEN
    ALTER TABLE "stage_input_configs" ADD CONSTRAINT "stage_input_configs_workflow_stage_id_fkey" FOREIGN KEY ("workflow_stage_id") REFERENCES "workflow_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_input_configs_product_id_fkey') THEN
    ALTER TABLE "stage_input_configs" ADD CONSTRAINT "stage_input_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_output_configs_workflow_stage_id_fkey') THEN
    ALTER TABLE "stage_output_configs" ADD CONSTRAINT "stage_output_configs_workflow_stage_id_fkey" FOREIGN KEY ("workflow_stage_id") REFERENCES "workflow_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_output_configs_product_id_fkey') THEN
    ALTER TABLE "stage_output_configs" ADD CONSTRAINT "stage_output_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_quality_configs_workflow_stage_id_fkey') THEN
    ALTER TABLE "stage_quality_configs" ADD CONSTRAINT "stage_quality_configs_workflow_stage_id_fkey" FOREIGN KEY ("workflow_stage_id") REFERENCES "workflow_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$`
];

async function main() {
  try {
    console.log("Applying Phase 2.2 SQL migration safely...");
    for (const q of queries) {
      console.log("Executing:", q.substring(0, 50) + "...");
      await prisma.$executeRawUnsafe(q);
    }
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
