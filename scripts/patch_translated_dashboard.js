const fs = require('fs');

const mrDashboard = {
  'title': 'डॅशबोर्ड',
  'businessHealth': 'व्यवसायाचे आरोग्य एका दृष्टीक्षेपात',
  'today': 'आज',
  'last7Days': 'मागील ७ दिवस',
  'weekly': 'साप्ताहिक',
  'monthly': 'मासिक',
  'custom': 'कस्टम',
  'hideProfit': 'नफा लपवा',
  'showProfit': 'नफा दाखवा',
  'todaysSales': 'आजची विक्री',
  'todaysProfit': 'आजचा नफा',
  'totalUdhar': 'एकूण उधार',
  'todaysReturns': 'आजचा परतावा',
  'lowStockAlerts': 'कमी स्टॉक',
  'topProducts': 'टॉप उत्पादने',
  'all': 'सर्व',
  'units': 'नग',
  'stockAlerts': 'स्टॉक अलर्ट',
  'stockHealthy': 'स्टॉक पातळी योग्य आहे',
  'recentInvoices': 'अलीकडील पावत्या',
  'fastMovingItems': 'जलद विक्री होणाऱ्या वस्तू',
  'topByVolume': 'वॉल्यूमनुसार टॉप',
  'slowMovingItems': 'संथ विक्री होणाऱ्या वस्तू',
  'needAttention': 'लक्ष देणे आवश्यक',
  'unitsSold': 'विकले गेलेले नग',
  'inStock': 'स्टॉकमध्ये',
  'materialReturns': 'माल परत (आजचे)',
  'manageReturns': 'रिटर्न्स व्यवस्थापित करा',
  'noReturns': 'आज कोणतेही रिटर्न्स नाहीत'
};

const hiDashboard = {
  'title': 'डैशबोर्ड',
  'businessHealth': 'एक नज़र में व्यवसाय का स्वास्थ्य',
  'today': 'आज',
  'last7Days': 'पिछले 7 दिन',
  'weekly': 'साप्ताहिक',
  'monthly': 'मासिक',
  'custom': 'कस्टम',
  'hideProfit': 'मुनाफा छिपाएं',
  'showProfit': 'मुनाफा दिखाएं',
  'todaysSales': 'आज की बिक्री',
  'todaysProfit': 'आज का मुनाफा',
  'totalUdhar': 'कुल उधार',
  'todaysReturns': 'आज का रिटर्न',
  'lowStockAlerts': 'कम स्टॉक',
  'topProducts': 'टॉप उत्पाद',
  'all': 'सभी',
  'units': 'इकाइयां',
  'stockAlerts': 'स्टॉक अलर्ट',
  'stockHealthy': 'स्टॉक का स्तर सही है',
  'recentInvoices': 'हाल के चालान',
  'fastMovingItems': 'तेजी से बिकने वाले आइटम',
  'topByVolume': 'वॉल्यूम के अनुसार टॉप',
  'slowMovingItems': 'धीमी गति से बिकने वाले आइटम',
  'needAttention': 'ध्यान देने की आवश्यकता',
  'unitsSold': 'बिकी हुई इकाइयां',
  'inStock': 'स्टॉक में',
  'materialReturns': 'माल वापसी (आज का)',
  'manageReturns': 'रिटर्न प्रबंधित करें',
  'noReturns': 'आज कोई रिटर्न दर्ज नहीं किया गया'
};

function patchFile(file, data) {
  const path = `messages/${file}`;
  let content = JSON.parse(fs.readFileSync(path, 'utf8'));
  content.Dashboard = { ...content.Dashboard, ...data };
  fs.writeFileSync(path, JSON.stringify(content, null, 2));
}

patchFile('mr.json', mrDashboard);
patchFile('hi.json', hiDashboard);
