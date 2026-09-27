const fs = require('fs');
let s = fs.readFileSync('prisma/schema.prisma', 'utf8');
s += `
model StageInputConfig {
  id               String   @id @default(uuid()) @db.Uuid
  workflowStageId  String   @map("workflow_stage_id") @db.Uuid
  productId        String   @map("product_id") @db.Uuid
  inputType        String   @map("input_type") @db.VarChar
  quantityRuleType String   @map("quantity_rule_type") @db.VarChar
  quantityValue    Decimal? @map("quantity_value") @db.Decimal(10, 3)
  unit             String   @db.VarChar
  isRequired       Boolean  @default(true) @map("is_required")
  sequence         Int      @default(1)
  notes            String?  @db.VarChar
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  workflowStage WorkflowStage @relation(fields: [workflowStageId], references: [id], onDelete: Cascade)
  product       Product       @relation(fields: [productId], references: [id], onDelete: NoAction)

  @@index([workflowStageId])
  @@index([productId])
  @@map("stage_input_configs")
}

model StageOutputConfig {
  id               String   @id @default(uuid()) @db.Uuid
  workflowStageId  String   @map("workflow_stage_id") @db.Uuid
  productId        String   @map("product_id") @db.Uuid
  outputType       String   @map("output_type") @db.VarChar
  quantityRuleType String   @map("quantity_rule_type") @db.VarChar
  quantityValue    Decimal? @map("quantity_value") @db.Decimal(10, 3)
  unit             String   @db.VarChar
  expectedQuantity Decimal? @map("expected_quantity") @db.Decimal(10, 3)
  minimumQuantity  Decimal? @map("minimum_quantity") @db.Decimal(10, 3)
  maximumQuantity  Decimal? @map("maximum_quantity") @db.Decimal(10, 3)
  tolerancePercent Decimal? @map("tolerance_percent") @db.Decimal(5, 2)
  isRequired       Boolean  @default(true) @map("is_required")
  sequence         Int      @default(1)
  notes            String?  @db.VarChar
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  workflowStage WorkflowStage @relation(fields: [workflowStageId], references: [id], onDelete: Cascade)
  product       Product       @relation(fields: [productId], references: [id], onDelete: NoAction)

  @@index([workflowStageId])
  @@index([productId])
  @@map("stage_output_configs")
}

model StageQualityConfig {
  id               String   @id @default(uuid()) @db.Uuid
  workflowStageId  String   @map("workflow_stage_id") @db.Uuid
  parameterName    String   @map("parameter_name") @db.VarChar
  parameterCode    String?  @map("parameter_code") @db.VarChar
  dataType         String   @map("data_type") @db.VarChar
  unit             String?  @db.VarChar
  minValue         Decimal? @map("min_value") @db.Decimal(10, 3)
  maxValue         Decimal? @map("max_value") @db.Decimal(10, 3)
  targetValue      String?  @map("target_value") @db.VarChar
  isRequired       Boolean  @default(true) @map("is_required")
  isCritical       Boolean  @default(false) @map("is_critical")
  failureAction    String   @default("WARNING") @map("failure_action") @db.VarChar
  instructions     String?  @db.VarChar
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  workflowStage WorkflowStage @relation(fields: [workflowStageId], references: [id], onDelete: Cascade)

  @@index([workflowStageId])
  @@map("stage_quality_configs")
}
`;
fs.writeFileSync('prisma/schema.prisma', s);
