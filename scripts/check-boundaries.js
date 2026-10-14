#!/usr/bin/env node
// Package boundary checker — runs independently of ESLint.
// Usage: node scripts/check-boundaries.js
// Add to CI or as a pre-push hook.

const { readdirSync, readFileSync } = require('fs');
const { join, relative } = require('path');

const ROOT = process.cwd();

const RULES = [
  { from: 'features/mill',      forbidden: ['features/dukan', 'features/vyapar', 'features/wholesale'] },
  { from: 'features/dukan',     forbidden: ['features/mill', 'features/vyapar', 'features/wholesale'] },
  { from: 'features/vyapar',    forbidden: ['features/mill', 'features/dukan', 'features/wholesale'] },
  { from: 'features/wholesale', forbidden: ['features/mill', 'features/dukan', 'features/vyapar'] },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;
let errors = 0;

for (const rule of RULES) {
  const fromDir = join(ROOT, rule.from);
  let files;
  try { files = walk(fromDir); } catch { continue; }

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const imp = match[1];
      for (const forbidden of rule.forbidden) {
        if (imp.includes(forbidden)) {
          const rel = relative(ROOT, file).replace(/\\/g, '/');
          console.error(`\x1b[31mBOUNDARY VIOLATION\x1b[0m  ${rel}`);
          console.error(`  imports \x1b[33m${imp}\x1b[0m`);
          console.error(`  \x1b[2m${rule.from} → ${forbidden} is not allowed\x1b[0m\n`);
          errors++;
        }
      }
    }
  }
}

if (errors === 0) {
  console.log('\x1b[32m✓ No package boundary violations found\x1b[0m');
  process.exit(0);
} else {
  console.error(`\x1b[31m✗ ${errors} boundary violation(s) found — fix before committing\x1b[0m`);
  process.exit(1);
}
