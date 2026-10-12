// No-op stub for @parcel/watcher
// Used in build environments where native bindings cannot load.
// File watching is disabled; builds and production still work correctly.

async function subscribe() {
  return { unsubscribe: async () => {} };
}

async function unsubscribe() {}

async function getEventsSince() {
  return [];
}

async function writeSnapshot() {
  return '';
}

module.exports = { subscribe, unsubscribe, getEventsSince, writeSnapshot };
