const fs = require('fs');
const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8'));
if (en.Dashboard) {
  console.log('Dashboard keys:', Object.keys(en.Dashboard));
} else {
  console.log('Dashboard key not found in en.json');
}
