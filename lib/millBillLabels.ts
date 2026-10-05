export type MillBillLabels = {
  taxInvoice: string;
  billOfSupply: string;
  invoiceNo: string;
  dated: string;
  placeOfSupply: string;
  reverseCharge: string;
  salesmanName: string;
  grRrNo: string;
  transport: string;
  vehicleNo: string;
  station: string;
  eWayBillNo: string;
  billedTo: string;
  shippedTo: string;
  sn: string;
  descriptionOfGoods: string;
  hsnSacCode: string;
  qty: string;
  unit: string;
  price: string;
  amount: string;
  goodsSubtotal: string;
  lessDiscount: string;
  taxableAmount: string;
  addCgst: string;
  addSgst: string;
  addIgst: string;
  grandTotal: string;
  roundOff: string;
  freight: string;
  hamali: string;
  loading: string;
  unloading: string;
  otherCharges: string;
  commercialCharges: string;
  taxRate: string;
  taxableAmt: string;
  igstAmt: string;
  cgstAmt: string;
  sgstAmt: string;
  totalTax: string;
  payment: string;
  received: string;
  balanceDue: string;
  amountReceived: string;
  balanceUdhar: string;
  declaration: string;
  declarationText: string;
  bankDetails: string;
  termsAndConditions: string;
  eAndOE: string;
  receiversSignature: string;
  authorisedSignatory: string;
  rateExclGst: string;
  invoiceLabel: string;
  date: string;
  paymentMode: string;
  billTo: string;
  product: string;
  rateExclGstCol: string;
  batch: string;
  paymentDetails: string;
  totalGst: string;
  originalCopy: string;
  duplicateCopy: string;
  triplicateCopy: string;
};

const EN: MillBillLabels = {
  taxInvoice: 'TAX INVOICE',
  billOfSupply: 'BILL OF SUPPLY',
  invoiceNo: 'Invoice No.',
  dated: 'Dated',
  placeOfSupply: 'Place of Supply',
  reverseCharge: 'Reverse Charge',
  salesmanName: 'Salesman Name',
  grRrNo: 'GR/RR No.',
  transport: 'Transport',
  vehicleNo: 'Vehicle No.',
  station: 'Station',
  eWayBillNo: 'E-Way Bill No.',
  billedTo: 'Billed to :',
  shippedTo: 'Shipped to :',
  sn: 'S.N.',
  descriptionOfGoods: 'Description of Goods',
  hsnSacCode: 'HSN/ SAC Code',
  qty: 'Qty.',
  unit: 'Unit',
  price: 'Price',
  amount: 'Amount(₹)',
  goodsSubtotal: 'Goods Subtotal',
  lessDiscount: 'Less : Discount',
  taxableAmount: 'Taxable Amount',
  addCgst: 'Add : CGST',
  addSgst: 'Add : SGST',
  addIgst: 'Add : IGST',
  grandTotal: 'Grand Total',
  roundOff: 'Less : Rounded Off',
  freight: 'Freight',
  hamali: 'Hamali',
  loading: 'Loading',
  unloading: 'Unloading',
  otherCharges: 'Other Charges',
  commercialCharges: 'Commercial Charges (not goods)',
  taxRate: 'Tax Rate',
  taxableAmt: 'Taxable Amt.',
  igstAmt: 'IGST Amt.',
  cgstAmt: 'CGST Amt.',
  sgstAmt: 'SGST Amt.',
  totalTax: 'Total Tax',
  payment: 'Payment',
  received: 'Received',
  balanceDue: 'Balance due',
  amountReceived: 'Amount Received',
  balanceUdhar: 'Balance / Udhar',
  declaration: 'Declaration',
  declarationText: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  bankDetails: 'Bank Details',
  termsAndConditions: 'Terms & Conditions',
  eAndOE: 'E. & O.E.',
  receiversSignature: "Receiver's Signature :",
  authorisedSignatory: 'Authorised Signatory',
  rateExclGst: 'Rate is exclusive of GST.',
  invoiceLabel: 'INVOICE',
  date: 'Date',
  paymentMode: 'Payment Mode',
  billTo: 'Bill To',
  product: 'Product',
  rateExclGstCol: 'Rate (Excl. GST)',
  batch: 'Batch',
  paymentDetails: 'Payment Details',
  totalGst: 'Total GST',
  originalCopy: 'Original Copy',
  duplicateCopy: 'Duplicate Copy',
  triplicateCopy: 'Triplicate Copy',
};

const HI: MillBillLabels = {
  taxInvoice: 'टैक्स इनवॉइस',
  billOfSupply: 'आपूर्ति का बिल',
  invoiceNo: 'इनवॉइस नं.',
  dated: 'दिनांक',
  placeOfSupply: 'आपूर्ति का स्थान',
  reverseCharge: 'रिवर्स चार्ज',
  salesmanName: 'विक्रेता का नाम',
  grRrNo: 'GR/RR नं.',
  transport: 'परिवहन',
  vehicleNo: 'वाहन नं.',
  station: 'स्टेशन',
  eWayBillNo: 'ई-वे बिल नं.',
  billedTo: 'बिल प्राप्तकर्ता :',
  shippedTo: 'भेजा गया :',
  sn: 'क्र.नं.',
  descriptionOfGoods: 'माल का विवरण',
  hsnSacCode: 'HSN/ SAC कोड',
  qty: 'मात्रा',
  unit: 'इकाई',
  price: 'दर',
  amount: 'राशि (₹)',
  goodsSubtotal: 'माल का उप-योग',
  lessDiscount: 'कम : छूट',
  taxableAmount: 'कर योग्य राशि',
  addCgst: 'जोड़ें : CGST',
  addSgst: 'जोड़ें : SGST',
  addIgst: 'जोड़ें : IGST',
  grandTotal: 'कुल योग',
  roundOff: 'कम : राउंड ऑफ',
  freight: 'भाड़ा',
  hamali: 'हमाली',
  loading: 'लोडिंग',
  unloading: 'अनलोडिंग',
  otherCharges: 'अन्य शुल्क',
  commercialCharges: 'व्यावसायिक शुल्क (माल नहीं)',
  taxRate: 'कर दर',
  taxableAmt: 'कर योग्य रा.',
  igstAmt: 'IGST रा.',
  cgstAmt: 'CGST रा.',
  sgstAmt: 'SGST रा.',
  totalTax: 'कुल कर',
  payment: 'भुगतान',
  received: 'जमा',
  balanceDue: 'शेष बकाया',
  amountReceived: 'प्राप्त राशि',
  balanceUdhar: 'शेष / उधार',
  declaration: 'घोषणा',
  declarationText: 'हम घोषणा करते हैं कि इस इनवॉइस में वर्णित माल की वास्तविक कीमत दर्शाई गई है और सभी विवरण सही और सत्य हैं।',
  bankDetails: 'बैंक विवरण',
  termsAndConditions: 'नियम एवं शर्तें',
  eAndOE: 'त्रु. एवं अप.',
  receiversSignature: 'प्राप्तकर्ता के हस्ताक्षर :',
  authorisedSignatory: 'अधिकृत हस्ताक्षरकर्ता',
  rateExclGst: 'दर GST के बिना है।',
  invoiceLabel: 'इनवॉइस',
  date: 'दिनांक',
  paymentMode: 'भुगतान विधि',
  billTo: 'बिल प्राप्तकर्ता',
  product: 'उत्पाद',
  rateExclGstCol: 'दर (GST बिना)',
  batch: 'बैच',
  paymentDetails: 'भुगतान विवरण',
  totalGst: 'कुल GST',
  originalCopy: 'मूल प्रति',
  duplicateCopy: 'द्वितीय प्रति',
  triplicateCopy: 'तृतीय प्रति',
};

const MR: MillBillLabels = {
  taxInvoice: 'कर बीजक',
  billOfSupply: 'पुरवठा बीजक',
  invoiceNo: 'बीजक क्र.',
  dated: 'दिनांक',
  placeOfSupply: 'पुरवठ्याचे ठिकाण',
  reverseCharge: 'रिव्हर्स चार्ज',
  salesmanName: 'विक्रेत्याचे नाव',
  grRrNo: 'GR/RR क्र.',
  transport: 'वाहतूक',
  vehicleNo: 'वाहन क्र.',
  station: 'स्टेशन',
  eWayBillNo: 'ई-वे बिल क्र.',
  billedTo: 'बीजक प्राप्तकर्ता :',
  shippedTo: 'पाठवलेले :',
  sn: 'अ.क्र.',
  descriptionOfGoods: 'मालाचे वर्णन',
  hsnSacCode: 'HSN/ SAC कोड',
  qty: 'प्रमाण',
  unit: 'एकक',
  price: 'दर',
  amount: 'रक्कम (₹)',
  goodsSubtotal: 'मालाची एकूण',
  lessDiscount: 'वजा : सवलत',
  taxableAmount: 'करपात्र रक्कम',
  addCgst: 'जोडा : CGST',
  addSgst: 'जोडा : SGST',
  addIgst: 'जोडा : IGST',
  grandTotal: 'एकूण बेरीज',
  roundOff: 'वजा : राउंड ऑफ',
  freight: 'भाडे',
  hamali: 'हमाली',
  loading: 'लोडिंग',
  unloading: 'अनलोडिंग',
  otherCharges: 'इतर शुल्क',
  commercialCharges: 'व्यावसायिक शुल्क (माल नाही)',
  taxRate: 'कर दर',
  taxableAmt: 'करपात्र र.',
  igstAmt: 'IGST र.',
  cgstAmt: 'CGST र.',
  sgstAmt: 'SGST र.',
  totalTax: 'एकूण कर',
  payment: 'देयक',
  received: 'जमा',
  balanceDue: 'शिल्लक देय',
  amountReceived: 'मिळालेली रक्कम',
  balanceUdhar: 'शिल्लक / उधार',
  declaration: 'घोषणा',
  declarationText: 'आम्ही घोषित करतो की या बीजकात वर्णन केलेल्या मालाची खरी किंमत दर्शवली आहे आणि सर्व तपशील खरे व अचूक आहेत.',
  bankDetails: 'बँक तपशील',
  termsAndConditions: 'अटी व शर्ती',
  eAndOE: 'चू. व गा. माफ.',
  receiversSignature: 'प्राप्तकर्त्याची स्वाक्षरी :',
  authorisedSignatory: 'अधिकृत स्वाक्षरी',
  rateExclGst: 'दर GST वगळून आहे.',
  invoiceLabel: 'बीजक',
  date: 'दिनांक',
  paymentMode: 'देयक पद्धत',
  billTo: 'बीजक प्राप्तकर्ता',
  product: 'उत्पाद',
  rateExclGstCol: 'दर (GST वगळून)',
  batch: 'बॅच',
  paymentDetails: 'देयक तपशील',
  totalGst: 'एकूण GST',
  originalCopy: 'मूळ प्रत',
  duplicateCopy: 'द्वितीय प्रत',
  triplicateCopy: 'तृतीय प्रत',
};

const MAP: Record<string, MillBillLabels> = { en: EN, hi: HI, mr: MR };

export function getMillBillLabels(locale: string): MillBillLabels {
  return MAP[locale] ?? EN;
}
