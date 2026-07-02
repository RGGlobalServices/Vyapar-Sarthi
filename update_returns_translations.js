const fs = require('fs');
const path = require('path');

const enPath = path.join('messages', 'en.json');
const hiPath = path.join('messages', 'hi.json');
const mrPath = path.join('messages', 'mr.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));
const mr = JSON.parse(fs.readFileSync(mrPath, 'utf8'));

const returnsEn = {
  title: 'Returns & Refunds',
  subtitle: 'Process product returns and manage refunds',
  findInvoice: 'Find Invoice',
  enterInvoiceId: 'Enter Invoice ID to start return',
  searchInvoice: 'Search Invoice',
  searching: 'Searching...',
  invoiceSummary: 'Invoice Summary',
  customer: 'Customer',
  guest: 'Guest',
  date: 'Date',
  totalPaid: 'Total Paid',
  payment: 'Payment',
  returnItems: 'Return Items',
  selectItemsToReturn: 'Select items and quantity to return',
  readyForReturn: 'Ready for Return',
  searchInvoicePrompt: 'Search for an invoice to start processing a return',
  price: 'Price',
  purchased: 'Purchased',
  reason: 'Reason',
  returnVal: 'Return Val',
  totalRefundAmount: 'Total Refund Amount',
  processing: 'Processing...',
  completeReturn: 'Complete Return',
  returnWarning: 'Processing a return will automatically adjust your inventory levels and record a refund transaction in your ledger.',
  returnHistory: 'Return History',
  today: 'Today',
  last7Days: 'Last 7 Days',
  last30Days: 'Last 30 Days',
  thisYear: 'This Year',
  custom: 'Custom',
  itemName: 'Item Name',
  qty: 'Qty',
  value: 'Value (₹)',
  noReturns: 'No returns recorded for'
};

const returnsHi = {
  title: 'रिटर्न्स और रिफंड्स',
  subtitle: 'उत्पाद रिटर्न प्रोसेस करें और रिफंड प्रबंधित करें',
  findInvoice: 'इनवॉइस खोजें',
  enterInvoiceId: 'रिटर्न शुरू करने के लिए इनवॉइस आईडी दर्ज करें',
  searchInvoice: 'इनवॉइस खोजें',
  searching: 'खोज रहा है...',
  invoiceSummary: 'इनवॉइस सारांश',
  customer: 'ग्राहक',
  guest: 'अतिथि',
  date: 'दिनांक',
  totalPaid: 'कुल भुगतान',
  payment: 'भुगतान',
  returnItems: 'रिटर्न आइटम',
  selectItemsToReturn: 'लौटाने के लिए आइटम और मात्रा चुनें',
  readyForReturn: 'रिटर्न के लिए तैयार',
  searchInvoicePrompt: 'रिटर्न प्रोसेस शुरू करने के लिए इनवॉइस खोजें',
  price: 'मूल्य',
  purchased: 'खरीदा गया',
  reason: 'कारण',
  returnVal: 'रिटर्न मूल्य',
  totalRefundAmount: 'कुल रिफंड राशि',
  processing: 'प्रोसेस हो रहा है...',
  completeReturn: 'रिटर्न पूरा करें',
  returnWarning: 'रिटर्न प्रोसेस करने से आपकी इन्वेंट्री स्वतः एडजस्ट हो जाएगी और आपके लेजर में रिफंड ट्रांजेक्शन दर्ज हो जाएगा।',
  returnHistory: 'रिटर्न इतिहास',
  today: 'आज',
  last7Days: 'पिछले 7 दिन',
  last30Days: 'पिछले 30 दिन',
  thisYear: 'इस साल',
  custom: 'कस्टम',
  itemName: 'आइटम का नाम',
  qty: 'मात्रा',
  value: 'मूल्य (₹)',
  noReturns: 'इसके लिए कोई रिटर्न दर्ज नहीं है:'
};

const returnsMr = {
  title: 'परतावा आणि परतावा',
  subtitle: 'उत्पादन परतावा प्रक्रिया करा आणि परतावा व्यवस्थापित करा',
  findInvoice: 'इनव्हॉइस शोधा',
  enterInvoiceId: 'परतावा सुरू करण्यासाठी इनव्हॉइस आयडी प्रविष्ट करा',
  searchInvoice: 'इनव्हॉइस शोधा',
  searching: 'शोधत आहे...',
  invoiceSummary: 'इनव्हॉइस सारांश',
  customer: 'ग्राहक',
  guest: 'अतिथी',
  date: 'दिनांक',
  totalPaid: 'एकूण पेमेंट',
  payment: 'पेमेंट',
  returnItems: 'परतावा आयटम',
  selectItemsToReturn: 'परत करण्यासाठी आयटम आणि प्रमाण निवडा',
  readyForReturn: 'परताव्यासाठी तयार',
  searchInvoicePrompt: 'परतावा प्रक्रिया सुरू करण्यासाठी इनव्हॉइस शोधा',
  price: 'किंमत',
  purchased: 'खरेदी केले',
  reason: 'कारण',
  returnVal: 'परतावा मूल्य',
  totalRefundAmount: 'एकूण परतावा रक्कम',
  processing: 'प्रक्रिया होत आहे...',
  completeReturn: 'परतावा पूर्ण करा',
  returnWarning: 'परतावा प्रक्रिया केल्यास तुमची इन्व्हेंटरी स्वयंचलितपणे अद्यतनित होईल आणि लेजरमध्ये परतावा व्यवहार नोंदवला जाईल.',
  returnHistory: 'परतावा इतिहास',
  today: 'आज',
  last7Days: 'मागील ७ दिवस',
  last30Days: 'मागील ३० दिवस',
  thisYear: 'या वर्षी',
  custom: 'सानुकूल',
  itemName: 'आयटमचे नाव',
  qty: 'प्रमाण',
  value: 'मूल्य (₹)',
  noReturns: 'यासाठी कोणताही परतावा नोंदवला नाही:'
};

en.Returns = { ...en.Returns, ...returnsEn };
hi.Returns = { ...hi.Returns, ...returnsHi };
mr.Returns = { ...mr.Returns, ...returnsMr };

fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
fs.writeFileSync(hiPath, JSON.stringify(hi, null, 2));
fs.writeFileSync(mrPath, JSON.stringify(mr, null, 2));

console.log("Translations updated successfully!");
