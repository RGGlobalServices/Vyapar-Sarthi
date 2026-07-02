const fs = require('fs');

const files = {
  en: 'messages/en.json',
  hi: 'messages/hi.json',
  mr: 'messages/mr.json'
};

const additions = {
  en: {
    selectWarehouse: "Select Warehouse",
    adjustmentDifference: "Adjustment Difference *",
    adjustmentHint: "Use negative numbers to reduce stock, positive to increase.",
    reasonRequired: "Reason *",
    notesOptional: "Notes (Optional)",
    notesPlaceholder: "Detailed explanation...",
    confirmAdjustment: "Confirm Adjustment",
    fromWarehouse: "From Warehouse *",
    selectSource: "Select Source",
    toWarehouse: "To Warehouse *",
    selectDestination: "Select Destination",
    transferQuantity: "Transfer Quantity *",
    reasonOptional: "Reason (Optional)",
    transferReasonHint: "e.g. Rebalancing stock",
    confirmTransfer: "Confirm Transfer",
    selectSupplier: "Select Supplier",
    quantityRequired: "Quantity *",
    unitCostRequired: "Unit Cost (₹) *",
    dateRequired: "Date",
    batchLot: "Batch / Lot #",
    optionalHint: "Optional",
    expiryDateTitle: "Expiry Date",
    physicalCount: "Physical Count",
    damaged: "Damaged",
    expired: "Expired",
    theft: "Theft",
    lost: "Lost",
    openingBalance: "Opening Balance"
  },
  hi: {
    selectWarehouse: "गोदाम चुनें",
    adjustmentDifference: "समायोजन अंतर *",
    adjustmentHint: "स्टॉक कम करने के लिए नकारात्मक संख्या का उपयोग करें, बढ़ाने के लिए सकारात्मक।",
    reasonRequired: "कारण *",
    notesOptional: "नोट्स (वैकल्पिक)",
    notesPlaceholder: "विस्तृत विवरण...",
    confirmAdjustment: "समायोजन की पुष्टि करें",
    fromWarehouse: "स्रोत गोदाम से *",
    selectSource: "स्रोत चुनें",
    toWarehouse: "गंतव्य गोदाम तक *",
    selectDestination: "गंतव्य चुनें",
    transferQuantity: "ट्रांसफर मात्रा *",
    reasonOptional: "कारण (वैकल्पिक)",
    transferReasonHint: "उदा. स्टॉक संतुलित करना",
    confirmTransfer: "ट्रांसफर की पुष्टि करें",
    selectSupplier: "आपूर्तिकर्ता चुनें",
    quantityRequired: "मात्रा *",
    unitCostRequired: "यूनिट लागत (₹) *",
    dateRequired: "दिनांक",
    batchLot: "बैच / लॉट #",
    optionalHint: "वैकल्पिक",
    expiryDateTitle: "समाप्ति तिथि",
    physicalCount: "भौतिक गणना",
    damaged: "क्षतिग्रस्त",
    expired: "समाप्त",
    theft: "चोरी",
    lost: "खोया हुआ",
    openingBalance: "प्रारंभिक शेष"
  },
  mr: {
    selectWarehouse: "गोदाम निवडा",
    adjustmentDifference: "समायोजन फरक *",
    adjustmentHint: "स्टॉक कमी करण्यासाठी नकारात्मक संख्या वापरा, वाढवण्यासाठी सकारात्मक.",
    reasonRequired: "कारण *",
    notesOptional: "नोंदी (पर्यायी)",
    notesPlaceholder: "सविस्तर स्पष्टीकरण...",
    confirmAdjustment: "समायोजनाची पुष्टी करा",
    fromWarehouse: "या गोदामातून *",
    selectSource: "स्रोत निवडा",
    toWarehouse: "या गोदामात *",
    selectDestination: "गंतव्य निवडा",
    transferQuantity: "ट्रान्सफर प्रमाण *",
    reasonOptional: "कारण (पर्यायी)",
    transferReasonHint: "उदा. स्टॉक संतुलित करणे",
    confirmTransfer: "ट्रान्सफरची पुष्टी करा",
    selectSupplier: "पुरवठादार निवडा",
    quantityRequired: "प्रमाण *",
    unitCostRequired: "युनिट किंमत (₹) *",
    dateRequired: "तारीख",
    batchLot: "बॅच / लॉट #",
    optionalHint: "पर्यायी",
    expiryDateTitle: "कालबाह्यता तारीख",
    physicalCount: "भौतिक गणना",
    damaged: "खराब झालेले",
    expired: "कालबाह्य",
    theft: "चोरी",
    lost: "हरवलेले",
    openingBalance: "सुरुवातीची शिल्लक"
  }
};

for (const [lang, file] of Object.entries(files)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  
  if (!data.Stock) data.Stock = {};
  data.Stock = { ...data.Stock, ...additions[lang] };
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

console.log('Stock drawer translations added.');
