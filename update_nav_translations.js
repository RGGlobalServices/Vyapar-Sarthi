const fs = require('fs');
const path = require('path');

const enPath = path.join('messages', 'en.json');
const hiPath = path.join('messages', 'hi.json');
const mrPath = path.join('messages', 'mr.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));
const mr = JSON.parse(fs.readFileSync(mrPath, 'utf8'));

const navEn = {
  theme: "Theme",
  language: "Language",
  accessRole: "Access Role",
  logout: "Logout"
};

const navHi = {
  theme: "थीम",
  language: "भाषा",
  accessRole: "एक्सेस रोल",
  logout: "लॉगआउट"
};

const navMr = {
  theme: "थीम",
  language: "भाषा",
  accessRole: "अॅक्सेस रोल",
  logout: "लॉगआउट"
};

en.Nav = { ...en.Nav, ...navEn };
hi.Nav = { ...hi.Nav, ...navHi };
mr.Nav = { ...mr.Nav, ...navMr };

fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
fs.writeFileSync(hiPath, JSON.stringify(hi, null, 2));
fs.writeFileSync(mrPath, JSON.stringify(mr, null, 2));

console.log("Nav Translations updated successfully!");
