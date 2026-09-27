const fs = require('fs');
const glob = require('glob');

const files = [
  'app/api/v1/mill/batches/[id]/stages/[stageId]/start/route.ts',
  'app/api/v1/mill/batches/[id]/stages/[stageId]/inputs/[inputId]/route.ts',
  'app/api/v1/mill/batches/[id]/stages/[stageId]/outputs/[outputId]/route.ts',
  'app/api/v1/mill/batches/[id]/stages/[stageId]/quality/[parameterId]/route.ts',
  'app/api/v1/mill/batches/[id]/stages/[stageId]/complete/route.ts'
];

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/handle\(async \(req, \{ params \}\) => \{/g, "handle(async (req, ctx: any) => {\n  const params = await ctx.params;");
  fs.writeFileSync(f, content);
}
console.log('Fixed types');
