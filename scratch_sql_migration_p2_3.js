const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log("Starting additive SQL migration for Phase 2.3...");

    const queries = [
      `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS "batch_workflow_snapshots" (
            "id" UUID NOT NULL,
            "production_batch_id" UUID NOT NULL,
            "workflow_version_id" UUID,
            "workflow_name" VARCHAR NOT NULL,
            "version_number" INTEGER NOT NULL,
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "batch_workflow_snapshots_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "batch_workflow_snapshots_production_batch_id_key" UNIQUE ("production_batch_id"),
            CONSTRAINT "batch_workflow_snapshots_production_batch_id_fkey" FOREIGN KEY ("production_batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "batch_workflow_snapshots_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      EXCEPTION
        WHEN duplicate_table THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS "batch_stage_snapshots" (
            "id" UUID NOT NULL,
            "batch_workflow_snapshot_id" UUID NOT NULL,
            "source_workflow_stage_id" UUID,
            "process_stage_id" UUID,
            "machine_id" UUID,
            "stage_name" VARCHAR NOT NULL,
            "sequence" INTEGER NOT NULL DEFAULT 1,
            "is_required" BOOLEAN NOT NULL DEFAULT true,
            "instructions" VARCHAR,
            "status" VARCHAR NOT NULL DEFAULT 'PENDING',
            "started_at" TIMESTAMPTZ(6),
            "completed_at" TIMESTAMPTZ(6),
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "batch_stage_snapshots_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "batch_stage_snapshots_batch_workflow_snapshot_id_fkey" FOREIGN KEY ("batch_workflow_snapshot_id") REFERENCES "batch_workflow_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_snapshots_source_workflow_stage_id_fkey" FOREIGN KEY ("source_workflow_stage_id") REFERENCES "workflow_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_snapshots_process_stage_id_fkey" FOREIGN KEY ("process_stage_id") REFERENCES "process_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_snapshots_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      EXCEPTION
        WHEN duplicate_table THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "batch_stage_snapshots_batch_workflow_snapshot_id_idx" ON "batch_stage_snapshots"("batch_workflow_snapshot_id");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS "batch_stage_inputs" (
            "id" UUID NOT NULL,
            "batch_stage_snapshot_id" UUID NOT NULL,
            "source_config_id" UUID,
            "product_id" UUID NOT NULL,
            "input_type" VARCHAR NOT NULL,
            "quantity_rule_type" VARCHAR NOT NULL,
            "configured_quantity_value" DECIMAL(10,3),
            "unit" VARCHAR NOT NULL,
            "is_required" BOOLEAN NOT NULL DEFAULT true,
            "actual_quantity" DECIMAL(10,3),
            "actual_unit" VARCHAR,
            "source_lot_id" UUID,
            "notes" VARCHAR,
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "batch_stage_inputs_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "batch_stage_inputs_batch_stage_snapshot_id_fkey" FOREIGN KEY ("batch_stage_snapshot_id") REFERENCES "batch_stage_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_inputs_source_config_id_fkey" FOREIGN KEY ("source_config_id") REFERENCES "stage_input_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_inputs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_inputs_source_lot_id_fkey" FOREIGN KEY ("source_lot_id") REFERENCES "raw_material_lots"("id") ON DELETE NO ACTION ON UPDATE CASCADE
        );
      EXCEPTION
        WHEN duplicate_table THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "batch_stage_inputs_batch_stage_snapshot_id_idx" ON "batch_stage_inputs"("batch_stage_snapshot_id");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "batch_stage_inputs_product_id_idx" ON "batch_stage_inputs"("product_id");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS "batch_stage_outputs" (
            "id" UUID NOT NULL,
            "batch_stage_snapshot_id" UUID NOT NULL,
            "source_config_id" UUID,
            "product_id" UUID NOT NULL,
            "output_type" VARCHAR NOT NULL,
            "quantity_rule_type" VARCHAR NOT NULL,
            "configured_quantity_value" DECIMAL(10,3),
            "unit" VARCHAR NOT NULL,
            "expected_quantity" DECIMAL(10,3),
            "minimum_quantity" DECIMAL(10,3),
            "maximum_quantity" DECIMAL(10,3),
            "tolerance_percent" DECIMAL(5,2),
            "is_required" BOOLEAN NOT NULL DEFAULT true,
            "actual_quantity" DECIMAL(10,3),
            "actual_unit" VARCHAR,
            "notes" VARCHAR,
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "batch_stage_outputs_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "batch_stage_outputs_batch_stage_snapshot_id_fkey" FOREIGN KEY ("batch_stage_snapshot_id") REFERENCES "batch_stage_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_outputs_source_config_id_fkey" FOREIGN KEY ("source_config_id") REFERENCES "stage_output_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_outputs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE CASCADE
        );
      EXCEPTION
        WHEN duplicate_table THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "batch_stage_outputs_batch_stage_snapshot_id_idx" ON "batch_stage_outputs"("batch_stage_snapshot_id");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "batch_stage_outputs_product_id_idx" ON "batch_stage_outputs"("product_id");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS "batch_stage_quality_parameters" (
            "id" UUID NOT NULL,
            "batch_stage_snapshot_id" UUID NOT NULL,
            "source_config_id" UUID,
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
            "actual_value" VARCHAR,
            "result" VARCHAR,
            "remarks" VARCHAR,
            "checked_by" UUID,
            "checked_at" TIMESTAMPTZ(6),
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "batch_stage_quality_parameters_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "batch_stage_quality_parameters_batch_stage_snapshot_id_fkey" FOREIGN KEY ("batch_stage_snapshot_id") REFERENCES "batch_stage_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "batch_stage_quality_parameters_source_config_id_fkey" FOREIGN KEY ("source_config_id") REFERENCES "stage_quality_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      EXCEPTION
        WHEN duplicate_table THEN NULL;
      END $$;
      `,
      `
      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS "batch_stage_quality_parameters_batch_stage_snapshot_id_idx" ON "batch_stage_quality_parameters"("batch_stage_snapshot_id");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
      `
    ];

    for (const q of queries) {
      await prisma.$executeRawUnsafe(q);
      console.log("Executed query successfully.");
    }
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
