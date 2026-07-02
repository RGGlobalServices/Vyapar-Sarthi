const fs = require('fs');
const files = ['messages/en.json', 'messages/hi.json', 'messages/mr.json'];

const additions = {
  en: {
    manageDesc: "Manage your suppliers, contact info, and outstanding balances.",
    companyNameLabel: "Company Name *",
    contactPersonLabel: "Contact Person",
    mobileLabel: "Mobile Number",
    gstinLabel: "GSTIN",
    openingBalanceLabel: "Opening Balance",
    emailAddressLabel: "Email Address",
    fullAddressLabel: "Full Address",
    supplierDetails: "Supplier Details",
    contactInfo: "Contact Info",
    outstanding: "Outstanding (₹)",
    actions: "Actions",
    noSuppliersFound: "No suppliers recorded yet.",
    searchPlaceholder: "Search by name, GST..."
  },
  hi: {
    manageDesc: "अपने आपूर्तिकर्ताओं, संपर्क जानकारी और बकाया शेष का प्रबंधन करें।",
    companyNameLabel: "कंपनी का नाम *",
    contactPersonLabel: "संपर्क व्यक्ति",
    mobileLabel: "मोबाइल नंबर",
    gstinLabel: "GSTIN",
    openingBalanceLabel: "प्रारंभिक शेष",
    emailAddressLabel: "ईमेल पता",
    fullAddressLabel: "पूरा पता",
    supplierDetails: "आपूर्तिकर्ता विवरण",
    contactInfo: "संपर्क जानकारी",
    outstanding: "बकाया (₹)",
    actions: "कार्रवाइयां",
    noSuppliersFound: "अभी तक कोई आपूर्तिकर्ता दर्ज नहीं किया गया है।",
    searchPlaceholder: "नाम, जीएसटी से खोजें..."
  },
  mr: {
    manageDesc: "तुमचे पुरवठादार, संपर्क माहिती आणि थकीत शिल्लक व्यवस्थापित करा.",
    companyNameLabel: "कंपनीचे नाव *",
    contactPersonLabel: "संपर्क व्यक्ती",
    mobileLabel: "मोबाईल नंबर",
    gstinLabel: "GSTIN",
    openingBalanceLabel: "सुरुवातीची शिल्लक",
    emailAddressLabel: "ईमेल पत्ता",
    fullAddressLabel: "संपूर्ण पत्ता",
    supplierDetails: "पुरवठादार तपशील",
    contactInfo: "संपर्क माहिती",
    outstanding: "थकीत (₹)",
    actions: "कृती",
    noSuppliersFound: "अद्याप कोणत्याही पुरवठादाराची नोंद नाही.",
    searchPlaceholder: "नाव, जीएसटी द्वारे शोधा..."
  }
};

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lang = file.includes('en') ? 'en' : file.includes('hi') ? 'hi' : 'mr';
  
  if (!data.Suppliers) data.Suppliers = {};
  data.Suppliers = { ...data.Suppliers, ...additions[lang] };
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let uiFile = 'app/[locale]/(main)/suppliers/SuppliersUI.tsx';
let ui = fs.readFileSync(uiFile, 'utf8');

ui = ui.replace(/>Manage your suppliers, contact info, and outstanding balances\.</g, ">{t('manageDesc')}<");
ui = ui.replace(/>Search by name, GST\.\.\./g, ">{t('searchPlaceholder')}<"); // This is a placeholder actually
ui = ui.replace(/placeholder="Search by name, GST\.\.\."/g, "placeholder={t('searchPlaceholder')}");
ui = ui.replace(/>Company Name \*/g, ">{t('companyNameLabel')}<");
ui = ui.replace(/>Contact Person</g, ">{t('contactPersonLabel')}<");
ui = ui.replace(/>Mobile Number</g, ">{t('mobileLabel')}<");
ui = ui.replace(/>GSTIN</g, ">{t('gstinLabel')}<");
ui = ui.replace(/>Opening Balance</g, ">{t('openingBalanceLabel')}<");
ui = ui.replace(/>Email Address</g, ">{t('emailAddressLabel')}<");
ui = ui.replace(/>Full Address</g, ">{t('fullAddressLabel')}<");
ui = ui.replace(/>SUPPLIER DETAILS</g, ">{t('supplierDetails')}<");
ui = ui.replace(/>CONTACT INFO</g, ">{t('contactInfo')}<");
ui = ui.replace(/>OUTSTANDING \(₹\)</g, ">{t('outstanding')}<");
ui = ui.replace(/>ACTIONS</g, ">{t('actions')}<");

fs.writeFileSync(uiFile, ui);
console.log('Supplier translation done.');
