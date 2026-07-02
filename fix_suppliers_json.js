const fs = require('fs');

const files = {
  hi: 'messages/hi.json',
  mr: 'messages/mr.json'
};

const updates = {
  hi: {
    title: 'आपूर्तिकर्ता',
    addSupplier: 'आपूर्तिकर्ता जोड़ें',
    editSupplier: 'आपूर्तिकर्ता संपादित करें',
    save: 'परिवर्तन सहेजें',
    cancel: 'रद्द करें',
    colActions: 'कार्रवाइयां',
    deleteSupplier: 'आपूर्तिकर्ता हटाएं',
    deleteConfirm: 'क्या आप वाकई इस आपूर्तिकर्ता को हटाना चाहते हैं?',
    totalSuppliers: 'कुल आपूर्तिकर्ता',
    totalOutstanding: 'कुल बकाया',
    paidThisMonth: 'इस महीने भुगतान किया गया',
    newSupplier: 'नया आपूर्तिकर्ता',
    nameLabel: 'आपूर्तिकर्ता का नाम *',
    mobileLabel: 'मोबाइल नंबर',
    gstLabel: 'जीएसटी नंबर',
    addressLabel: 'पता',
    colName: 'नाम',
    colContact: 'संपर्क',
    colPending: 'लंबित देय',
    viewDetails: 'विवरण देखें',
    recordPayment: 'भुगतान दर्ज करें',
    paymentAmount: 'भुगतान राशि',
    paymentNote: 'नोट (वैकल्पिक)',
    submitPayment: 'भुगतान जमा करें'
  },
  mr: {
    title: 'पुरवठादार',
    addSupplier: 'पुरवठादार जोडा',
    editSupplier: 'पुरवठादार संपादित करा',
    save: 'बदल जतन करा',
    cancel: 'रद्द करा',
    colActions: 'कृती',
    deleteSupplier: 'पुरवठादार हटवा',
    deleteConfirm: 'तुम्हाला खात्री आहे की तुम्ही हा पुरवठादार हटवू इच्छिता?',
    totalSuppliers: 'एकूण पुरवठादार',
    totalOutstanding: 'एकूण थकीत',
    paidThisMonth: 'या महिन्यात भरलेले',
    newSupplier: 'नवीन पुरवठादार',
    nameLabel: 'पुरवठादाराचे नाव *',
    mobileLabel: 'मोबाईल नंबर',
    gstLabel: 'जीएसटी नंबर',
    addressLabel: 'पत्ता',
    colName: 'नाव',
    colContact: 'संपर्क',
    colPending: 'प्रलंबित बाकी',
    viewDetails: 'तपशील पहा',
    recordPayment: 'पेमेंट नोंदवा',
    paymentAmount: 'पेमेंट रक्कम',
    paymentNote: 'टीप (पर्यायी)',
    submitPayment: 'पेमेंट सबमिट करा'
  }
};

for (const [lang, file] of Object.entries(files)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  
  if (data.Suppliers) {
    data.Suppliers = { ...data.Suppliers, ...updates[lang] };
  }
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Ensure the code uses {t('colActions')}
let uiFile = 'app/[locale]/(main)/suppliers/SuppliersUI.tsx';
let ui = fs.readFileSync(uiFile, 'utf8');

// In case it's using t('actions') from my previous script but I just updated colActions:
ui = ui.replace(/>{t\('actions'\)}</g, ">{t('colActions')}<");

fs.writeFileSync(uiFile, ui);
console.log('Supplier translation fully patched.');
