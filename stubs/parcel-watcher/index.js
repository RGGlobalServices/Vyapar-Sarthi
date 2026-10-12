async function subscribe() { return { unsubscribe: async () => {} }; }
async function unsubscribe() {}
async function getEventsSince() { return []; }
async function writeSnapshot() { return ''; }
module.exports = { subscribe, unsubscribe, getEventsSince, writeSnapshot };