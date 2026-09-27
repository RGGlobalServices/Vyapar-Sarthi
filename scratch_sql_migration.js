const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const queries = [
`CREATE TABLE IF NOT EXISTS "process_stages" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "code" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "description" VARCHAR,
  "category" VARCHAR,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "process_stages_pkey" PRIMARY KEY ("id")
)`,
`CREATE TABLE IF NOT EXISTS "workflows" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "code" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "description" VARCHAR,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
)`,
`CREATE TABLE IF NOT EXISTS "workflow_versions" (
  "id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
)`,
`CREATE TABLE IF NOT EXISTS "workflow_stages" (
  "id" UUID NOT NULL,
  "workflow_version_id" UUID NOT NULL,
  "process_stage_id" UUID NOT NULL,
  "machine_id" UUID,
  "sequence" INTEGER NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "instructions" VARCHAR,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_stages_pkey" PRIMARY KEY ("id")
)`,
`DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_batches' AND column_name = 'workflow_version_id') THEN
    ALTER TABLE "production_batches" ADD COLUMN "workflow_version_id" UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_stages' AND column_name = 'process_stage_id') THEN
    ALTER TABLE "batch_stages" ADD COLUMN "process_stage_id" UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_stages' AND column_name = 'machine_id') THEN
    ALTER TABLE "batch_stages" ADD COLUMN "machine_id" UUID;
  END IF;
END $$`,
`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'process_stages_shop_id_code_key') THEN
    CREATE UNIQUE INDEX "process_stages_shop_id_code_key" ON "process_stages"("shop_id", "code");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'process_stages_shop_id_idx') THEN
    CREATE INDEX "process_stages_shop_id_idx" ON "process_stages"("shop_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflows_shop_id_code_key') THEN
    CREATE UNIQUE INDEX "workflows_shop_id_code_key" ON "workflows"("shop_id", "code");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflows_shop_id_idx') THEN
    CREATE INDEX "workflows_shop_id_idx" ON "workflows"("shop_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflows_product_id_idx') THEN
    CREATE INDEX "workflows_product_id_idx" ON "workflows"("product_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflow_versions_workflow_id_version_number_key') THEN
    CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_number_key" ON "workflow_versions"("workflow_id", "version_number");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflow_versions_workflow_id_idx') THEN
    CREATE INDEX "workflow_versions_workflow_id_idx" ON "workflow_versions"("workflow_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflow_stages_workflow_version_id_sequence_key') THEN
    CREATE UNIQUE INDEX "workflow_stages_workflow_version_id_sequence_key" ON "workflow_stages"("workflow_version_id", "sequence");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflow_stages_workflow_version_id_idx') THEN
    CREATE INDEX "workflow_stages_workflow_version_id_idx" ON "workflow_stages"("workflow_version_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflow_stages_process_stage_id_idx') THEN
    CREATE INDEX "workflow_stages_process_stage_id_idx" ON "workflow_stages"("process_stage_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workflow_stages_machine_id_idx') THEN
    CREATE INDEX "workflow_stages_machine_id_idx" ON "workflow_stages"("machine_id");
  END IF;
END $$`,
`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'process_stages_shop_id_fkey') THEN
    ALTER TABLE "process_stages" ADD CONSTRAINT "process_stages_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflows_shop_id_fkey') THEN
    ALTER TABLE "workflows" ADD CONSTRAINT "workflows_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflows_product_id_fkey') THEN
    ALTER TABLE "workflows" ADD CONSTRAINT "workflows_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_versions_workflow_id_fkey') THEN
    ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_stages_workflow_version_id_fkey') THEN
    ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_stages_process_stage_id_fkey') THEN
    ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_process_stage_id_fkey" FOREIGN KEY ("process_stage_id") REFERENCES "process_stages"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_stages_machine_id_fkey') THEN
    ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batches_workflow_version_id_fkey') THEN
    ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_stages_process_stage_id_fkey') THEN
    ALTER TABLE "batch_stages" ADD CONSTRAINT "batch_stages_process_stage_id_fkey" FOREIGN KEY ("process_stage_id") REFERENCES "process_stages"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_stages_machine_id_fkey') THEN
    ALTER TABLE "batch_stages" ADD CONSTRAINT "batch_stages_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$`
];

async function main() {
  try {
    console.log("Applying SQL migration safely...");
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
