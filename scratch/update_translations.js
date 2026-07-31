const fs = require('fs');
const path = require('path');

const locales = ['en', 'hi', 'mr'];
const messagesDir = path.join(__dirname, '../messages');

const newTranslations = {
  Staff: {
    // page.tsx
    title: "Staff Management",
    desc: "Manage your manpower, attendance, and salaries.",
    addStaff: "Add Staff",
    attendance: "Attendance",
    totalStaff: "Total Staff",
    searchPlaceholder: "Search staff by name or mobile...",
    noStaffFound: "No staff found",
    clickAddStaff: "Click \"Add Staff\" to create a new profile.",
    perDay: "Per Day",
    perMonth: "Per Month",
    other: "Other",

    // new/page.tsx
    uploadFailed: "Upload failed.",
    confirmRemoveDocument: "Are you sure you want to remove this document?",
    removeDocumentTitle: "Remove Document",
    addNewEmployee: "Add New Employee",
    enterDetails: "Enter details and upload documents",
    personalDetails: "Personal Details",
    fullName: "Full Name *",
    namePlaceholder: "e.g. Ramesh Kumar",
    mobileNumber: "Mobile Number *",
    mobilePlaceholder: "10 digit number",
    emergencyContact: "Emergency Contact",
    optionalPlaceholder: "Optional",
    role: "Role",
    joiningDate: "Joining Date",
    salaryBankDetails: "Salary & Bank Details",
    salaryType: "Salary Type",
    monthly: "Monthly",
    daily: "Daily",
    amount: "Amount (₹) *",
    bankAccountNo: "Bank Account No.",
    ifscCode: "IFSC Code",
    upiId: "UPI ID",
    upiPlaceholder: "e.g. number@upi",
    documentsOptional: "Documents (Optional)",
    passportPhoto: "Passport Size Photo",
    aadhaarFront: "Aadhaar Card (Front)",
    aadhaarBack: "Aadhaar Card (Back)",
    panCard: "PAN Card",
    addressProof: "Address Proof",
    saveEmployeeProfile: "Save Employee Profile",
    uploaded: "Uploaded",
    pending: "Pending",
    change: "Change",
    upload: "Upload",
    view: "View"
  }
};

const hindiTranslations = {
  Staff: {
    // page.tsx
    title: "कर्मचारी प्रबंधन (Staff Management)",
    desc: "अपनी मैनपावर, उपस्थिति और वेतन प्रबंधित करें।",
    addStaff: "कर्मचारी जोड़ें",
    attendance: "उपस्थिति",
    totalStaff: "कुल कर्मचारी",
    searchPlaceholder: "नाम या मोबाइल से कर्मचारी खोजें...",
    noStaffFound: "कोई कर्मचारी नहीं मिला",
    clickAddStaff: "नया प्रोफाइल बनाने के लिए \"कर्मचारी जोड़ें\" पर क्लिक करें।",
    perDay: "प्रति दिन",
    perMonth: "प्रति माह",
    other: "अन्य",

    // new/page.tsx
    uploadFailed: "अपलोड विफल रहा।",
    confirmRemoveDocument: "क्या आप वाकई इस दस्तावेज़ को हटाना चाहते हैं?",
    removeDocumentTitle: "दस्तावेज़ हटाएँ",
    addNewEmployee: "नया कर्मचारी जोड़ें",
    enterDetails: "विवरण दर्ज करें और दस्तावेज़ अपलोड करें",
    personalDetails: "व्यक्तिगत विवरण",
    fullName: "पूरा नाम *",
    namePlaceholder: "उदा. रमेश कुमार",
    mobileNumber: "मोबाइल नंबर *",
    mobilePlaceholder: "10 अंकों का नंबर",
    emergencyContact: "आपातकालीन संपर्क",
    optionalPlaceholder: "वैकल्पिक",
    role: "भूमिका",
    joiningDate: "शामिल होने की तिथि",
    salaryBankDetails: "वेतन और बैंक विवरण",
    salaryType: "वेतन का प्रकार",
    monthly: "मासिक",
    daily: "दैनिक",
    amount: "राशि (₹) *",
    bankAccountNo: "बैंक खाता संख्या",
    ifscCode: "IFSC कोड",
    upiId: "UPI आईडी",
    upiPlaceholder: "उदा. number@upi",
    documentsOptional: "दस्तावेज़ (वैकल्पिक)",
    passportPhoto: "पासपोर्ट आकार का फोटो",
    aadhaarFront: "आधार कार्ड (सामने)",
    aadhaarBack: "आधार कार्ड (पीछे)",
    panCard: "पैन कार्ड",
    addressProof: "पता प्रमाण",
    saveEmployeeProfile: "कर्मचारी प्रोफ़ाइल सहेजें",
    uploaded: "अपलोड किया गया",
    pending: "लंबित",
    change: "बदलें",
    upload: "अपलोड करें",
    view: "देखें"
  }
};

const marathiTranslations = {
  Staff: {
    // page.tsx
    title: "कर्मचारी व्यवस्थापन (Staff Management)",
    desc: "तुमची मनुष्यबळ, उपस्थिती आणि पगार व्यवस्थापित करा.",
    addStaff: "कर्मचारी जोडा",
    attendance: "हजेरी",
    totalStaff: "एकूण कर्मचारी",
    searchPlaceholder: "नाव किंवा मोबाईलवरून कर्मचारी शोधा...",
    noStaffFound: "कोणताही कर्मचारी सापडला नाही",
    clickAddStaff: "नवीन प्रोफाइल तयार करण्यासाठी \"कर्मचारी जोडा\" वर क्लिक करा.",
    perDay: "प्रति दिन",
    perMonth: "प्रति महिना",
    other: "इतर",

    // new/page.tsx
    uploadFailed: "अपलोड अयशस्वी.",
    confirmRemoveDocument: "तुम्हाला खात्री आहे की तुम्हाला हे दस्तऐवज काढायचे आहे?",
    removeDocumentTitle: "दस्तऐवज काढा",
    addNewEmployee: "नवीन कर्मचारी जोडा",
    enterDetails: "तपशील प्रविष्ट करा आणि दस्तऐवज अपलोड करा",
    personalDetails: "वैयक्तिक तपशील",
    fullName: "पूर्ण नाव *",
    namePlaceholder: "उदा. रमेश कुमार",
    mobileNumber: "मोबाईल नंबर *",
    mobilePlaceholder: "10 अंकी क्रमांक",
    emergencyContact: "आणीबाणी संपर्क",
    optionalPlaceholder: "ऐच्छिक",
    role: "भूमिका",
    joiningDate: "रुजू होण्याची तारीख",
    salaryBankDetails: "पगार आणि बँक तपशील",
    salaryType: "पगाराचा प्रकार",
    monthly: "मासिक",
    daily: "दैनिक",
    amount: "रक्कम (₹) *",
    bankAccountNo: "बँक खाते क्रमांक",
    ifscCode: "IFSC कोड",
    upiId: "UPI आयडी",
    upiPlaceholder: "उदा. number@upi",
    documentsOptional: "दस्तऐवज (ऐच्छिक)",
    passportPhoto: "पासपोर्ट आकाराचा फोटो",
    aadhaarFront: "आधार कार्ड (समोर)",
    aadhaarBack: "आधार कार्ड (मागे)",
    panCard: "पॅन कार्ड",
    addressProof: "पत्ता पुरावा",
    saveEmployeeProfile: "कर्मचारी प्रोफाइल जतन करा",
    uploaded: "अपलोड केले",
    pending: "प्रलंबित",
    change: "बदला",
    upload: "अपलोड करा",
    view: "पहा"
  }
};

locales.forEach(locale => {
  const file = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  
  if (locale === 'en') {
    data.Staff = { ...data.Staff, ...newTranslations.Staff };
  } else if (locale === 'hi') {
    data.Staff = { ...data.Staff, ...hindiTranslations.Staff };
  } else if (locale === 'mr') {
    data.Staff = { ...data.Staff, ...marathiTranslations.Staff };
  }
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Updated Staff in ${locale}.json`);
});
