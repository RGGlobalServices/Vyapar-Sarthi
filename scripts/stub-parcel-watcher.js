// Stubs all @parcel/watcher installations with a no-op JS implementation.
// Native binding interception is handled in next.config.js via Module._cache.
const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, '..', 'node_modules');

const stubIndex = [
  "async function subscribe() { return { unsubscribe: async () => {} }; }",
  "async function unsubscribe() {}",
  "async function getEventsSince() { return []; }",
  "async function writeSnapshot() { return ''; }",
  "module.exports = { subscribe, unsubscribe, getEventsSince, writeSnapshot };",
].join('\n');
const stubPkg = JSON.stringify({ name: "@parcel/watcher", version: "2.5.6", main: "index.js" });

let count = 0;
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
          count++;
          console.log('  stubbed @parcel/watcher:', watcherDir);
        } catch (e) { console.warn('  failed:', watcherDir, e.message); }
      }
    } else {
      const nested = path.join(dir, item.name, 'node_modules');
      if (fs.existsSync(nested)) walkAndStub(nested, depth + 1);
    }
  }
}

console.log('Stubbing @parcel/watcher...');
walkAndStub(nodeModules, 0);
console.log('Done —', count, 'location(s) stubbed.');
