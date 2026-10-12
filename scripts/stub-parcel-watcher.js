// Replaces all @parcel/watcher installations with a no-op stub.
// Needed because next-intl/plugin has a top-level require('@parcel/watcher')
// that fails on Linux build servers without native binary support.
const fs = require('fs');
const path = require('path');

const stubIndex = [
  "async function subscribe() { return { unsubscribe: async () => {} }; }",
  "async function unsubscribe() {}",
  "async function getEventsSince() { return []; }",
  "async function writeSnapshot() { return ''; }",
  "module.exports = { subscribe, unsubscribe, getEventsSince, writeSnapshot };",
].join('\n');

const stubPkg = JSON.stringify({ name: "@parcel/watcher", version: "2.5.6", main: "index.js" });

let count = 0;

function walk(dir, depth) {
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
          count++;
          console.log(`  stubbed: ${watcherDir}`);
        } catch (e) { console.warn(`  failed: ${watcherDir} — ${e.message}`); }
      }
    } else if (item.name === 'node_modules') {
      walk(path.join(dir, item.name), depth + 1);
    }
  }
}

console.log('Stubbing @parcel/watcher...');
walk(path.join(__dirname, '..', 'node_modules'), 0);
console.log(`Done — stubbed in ${count} location(s)`);
