const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) { 
      results.push(file);
    }
  });
  return results;
}

const files = walk('c:/current working project/kirana-manager-main/app/[locale]/(main)/billing');
const keys = new Set();
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  // Match t('key') or t("key") or safeT('key'
  const regex = /(?:t|safeT)\(['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    keys.add(match[1]);
  }
});

const enPath = 'c:/current working project/kirana-manager-main/messages/en.json';
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Flatten enData to get all available keys
function flattenKeys(obj, prefix = '') {
  let res = {};
  for (const k in obj) {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(res, flattenKeys(obj[k], pre + k));
    } else {
      res[pre + k] = obj[k];
    }
  }
  return res;
}

const availableKeys = flattenKeys(enData);
const availableKeyNames = new Set(Object.keys(availableKeys).map(k => k.split('.').pop()));

const missing = [];
keys.forEach(k => {
  if (!availableKeyNames.has(k) && !availableKeys[k]) {
    missing.push(k);
  }
});

console.log('Missing keys in en.json:');
console.log(missing.join(', '));
