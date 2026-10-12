// Patches next-intl/plugin and stubs @parcel/watcher so native bindings
// are never required on Linux build servers (Hostinger, Render, etc.)
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const nodeModules = path.join(rootDir, 'node_modules');

// 1. Stub all @parcel/watcher installations
const stubIndex = [
  "async function subscribe() { return { unsubscribe: async () => {} }; }",
  "async function unsubscribe() {}",
  "async function getEventsSince() { return []; }",
  "async function writeSnapshot() { return ''; }",
  "module.exports = { subscribe, unsubscribe, getEventsSince, writeSnapshot };",
].join('\n');
const stubPkg = JSON.stringify({ name: "@parcel/watcher", version: "2.5.6", main: "index.js" });

let stubCount = 0;
function walkAndStub(dir, depth) {
  if (depth > 6) return;
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const item of items) {
    if (!item.isDirectory()) continue;
    if (item.name === '@parcel') {
      const watcherDir = path.join(dir, '@parcel', 'watcher');
      if (fs.existsSync(watcherDir)) {
        try {
          fs.writeFileSync(path.join(watcherDir, 'index.js'), stubIndex);
          fs.writeFileSync(path.join(watcherDir, 'package.json'), stubPkg);
          stubCount++;
          console.log(`  stubbed @parcel/watcher: ${watcherDir}`);
        } catch (e) { console.warn(`  failed to stub: ${watcherDir} — ${e.message}`); }
      }
    } else {
      // Recurse into each package's own node_modules
      const nestedNM = path.join(dir, item.name, 'node_modules');
      if (fs.existsSync(nestedNM)) walkAndStub(nestedNM, depth + 1);
    }
  }
}

console.log('Stubbing @parcel/watcher...');
walkAndStub(nodeModules, 0);
console.log(`  done — stubbed in ${stubCount} location(s)`);

// 2. Patch next-intl/dist/cjs/development/plugin.cjs
// This file has bare top-level requires for @parcel/watcher and @swc/core
// that crash on Linux build servers where native bindings are unavailable.
// We wrap them in try-catch so the plugin loads gracefully without them.
const pluginPath = path.join(nodeModules, 'next-intl', 'dist', 'cjs', 'development', 'plugin.cjs');
if (fs.existsSync(pluginPath)) {
  let content = fs.readFileSync(pluginPath, 'utf8');
  let patched = false;

  const replacements = [
    { from: "require('@parcel/watcher');", to: "try { require('@parcel/watcher'); } catch {}" },
    { from: 'require("@parcel/watcher");', to: 'try { require("@parcel/watcher"); } catch {}' },
    { from: "require('@swc/core');",        to: "try { require('@swc/core'); } catch {}" },
    { from: 'require("@swc/core");',        to: 'try { require("@swc/core"); } catch {}' },
  ];

  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      console.log(`  patched next-intl plugin: ${from} → try/catch`);
      patched = true;
    }
  }

  if (patched) {
    fs.writeFileSync(pluginPath, content);
    console.log('  next-intl/plugin.cjs patched successfully');
  } else {
    console.log('  next-intl/plugin.cjs — nothing to patch (already safe or format changed)');
  }
} else {
  console.log('  next-intl/plugin.cjs not found — skipping patch');
}

console.log('Build environment setup complete.');
