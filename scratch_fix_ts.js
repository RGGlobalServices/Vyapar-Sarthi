const fs = require('fs');
const path = require('path');

const files = [
  'app/api/v1/master-data/process-stages/[id]/route.ts',
  'app/api/v1/mill/workflows/[id]/route.ts',
  'app/api/v1/mill/workflows/[id]/versions/route.ts',
  'app/api/v1/mill/workflows/[id]/versions/[versionId]/route.ts',
  'app/api/v1/mill/workflows/[id]/versions/[versionId]/stages/route.ts',
  'app/api/v1/mill/workflows/[id]/versions/[versionId]/stages/[stageId]/route.ts'
];

for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Replace handle arguments
  content = content.replace(/handle\(async\s*\(\s*req\s*,\s*\{\s*params\s*\}\s*\)\s*=>/g, 'handle(async (req, ctx: any) =>');
  
  // Replace params destructuring
  content = content.replace(/await\s+params\s*;/g, 'await ctx.params;');

  fs.writeFileSync(fullPath, content);
  console.log(`Updated ${file}`);
}
