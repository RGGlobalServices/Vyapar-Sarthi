'use client';

import { useState } from 'react';
import QuickProductionForm from '@/components/mill/QuickProductionForm';
import useSWR from 'swr';
import {
  AlertTriangle, Search, RefreshCw, Loader2, ArrowLeft, ArrowRight,
  Recycle, Trash2, Eye, X, Undo2, Download, Truck, CheckCircle2,
  PackageCheck, FileSpreadsheet, FileText
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { cn } from '@/lib/utils';
import { generateRejectionReturnGatePassPdf } from '@/lib/pdf/rejectionReturnGatePass';
import { generateRejectionReportPdf } from '@/lib/pdf/rejectionReportPdf';
import { buildWorkbookBlob, type WorkbookSheet } from '@/lib/excelWorkbook';

type RejectionLot = {
  id: string;
  lotNumber: string;
  quantity: number;
  availableQuantity: number;
  disposedQuantity?: number;
  disposalReason?: string | null;
  unit: string;
  status: string;
  rejectionReason: string | null;
  qualityReference: string | null;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null; baseUnit: string | null };
  batch: {
    id: string;
    batchNumber: string;
    batchType?: string | null;
    currentStage: string | null;
    customer?: { id: string; name: string; phone?: string | null } | null;
    rawMaterialLot?: {
      id: string;
      farmerName?: string | null;
      supplier?: { id: string; name: string; mobile?: string | null } | null;
    } | null;
  };
  sourceBatchStage: { id: string; stageName: string } | null;
  godown: { id: string; name: string } | null;
};

type RejectionsApiResponse = {
  items: RejectionLot[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type RejectionReturnRecord = {
  id: string;
  gatePassNo: string;
  returnType: 'SUPPLIER_RETURN' | 'JOB_WORK_RETURN' | 'DEBIT_NOTE_RETURN';
  partyName: string;
  partyPhone?: string | null;
  returnQuantity: number;
  unit: string;
  reason?: string | null;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  remarks?: string | null;
  returnedAt: string;
  lotNumber: string;
  productName: string;
  batchNumber?: string | null;
};

const _DICTIONARY_REMOVED = {
  en: {
    title: 'Rejection Management (Rejection & Return Engine)',
    subtitle: 'Manage rejected raw materials and in-process quality failures — return to supplier/farmer (with Return Gate Pass), reprocess, or scrap.',
    refresh: 'Refresh',
    downloadExcel: 'Excel Report',
    downloadPdfReport: 'PDF Report',
    exporting: 'Exporting...',
    kpiTotalLots: 'Total Rejection Lots',
    kpiTotalLotsSub: 'Total Quality Failure Lots',
    kpiAvailableStock: 'Available Reject Stock',
    kpiAvailableStockSub: 'Holding in Mill Godowns',
    kpiReturned: 'Returned Material (Returns)',
    kpiReturnedSub: 'Supplier & Job Work Returns',
    kpiDisposed: 'Scrapped / Disposed',
    kpiDisposedSub: 'Disposed & Scrapped',
    tabLots: 'Rejection Lots & Stock (Active Lots)',
    tabReturns: 'Return History & Gate Passes',
    searchPlaceholder: 'Search lot no, product, batch no...',
    allStatuses: 'All Statuses',
    statusAvailable: 'AVAILABLE (Available Stock)',
    statusStored: 'STORED (In Godown)',
    statusPartiallyReprocessed: 'PARTIALLY REPROCESSED',
    statusFullyReprocessed: 'FULLY REPROCESSED',
    statusDisposed: 'DISPOSED / RETURNED',
    filterReasonPlaceholder: 'Filter by reason...',
    noLotsFound: 'No rejection lots available.',
    colLotNo: 'Lot Number',
    colProduct: 'Product / Item',
    colBatch: 'Batch / Source',
    colInitialQty: 'Initial Qty',
    colAvailable: 'Available',
    colDisposed: 'Disposed / Returned',
    colReason: 'Rejection Reason',
    colGodown: 'Godown',
    colStatus: 'Status',
    colActions: 'Actions',
    btnReturn: 'Return',
    btnReprocess: 'Reprocess',
    btnDispose: 'Dispose',
    tooltipReturn: 'Return to Supplier / Farmer',
    tooltipReprocess: 'Start Reprocessing Batch',
    tooltipDispose: 'Scrap / Dispose',
    tooltipTrace: 'View Traceability & Origin Batch',
    pageInfo: (p: number, totalP: number, total: number) => `Page ${p} of ${totalP} (${total} total records)`,
    returnHistoryTitle: 'Return History & Dispatched Gate Passes',
    noReturnsFound: 'No material returns recorded yet.',
    colGatePass: 'Gate Pass / Challan No',
    colDate: 'Date',
    colReturnType: 'Return Type',
    colParty: 'Party (Supplier / Farmer)',
    colProductLot: 'Product / Lot',
    colReturnQty: 'Return Qty',
    colTransport: 'Transport & Vehicle',
    colRemarks: 'Reason / Remarks',
    colGatePassPdf: 'Gate Pass PDF',
    typeSupplierReturn: 'Supplier Return',
    typeJobWorkReturn: 'Job Work Return',
    directTransport: 'Direct / Own',
    challansUnit: 'Challans',
    kgUnit: 'kg',

    // Return Modal
    modalReturnTitle: 'Return Rejected Material',
    modalReturnSubtitle: (lot: string, prod: string, qty: number, unit: string) => `Lot #${lot} — ${prod} (${qty} ${unit} available)`,
    gatePassSuccessTitle: 'Gate Pass Generated Successfully!',
    gatePassSuccessDesc: (gp: string, qty: number, unit: string, party: string) => `Gate Pass No: ${gp} • ${qty} ${unit} dispatched to ${party}.`,
    downloadPdf: 'Download Gate Pass PDF',
    close: 'Close',
    cancel: 'Cancel',
    returnTypeLabel: 'Return Type *',
    optSupplier: 'Supplier (Supplier Return)',
    optJobWork: 'Job Work Customer / Farmer (Job Work Return)',
    selectPartyLabel: (isSupplier: boolean) => isSupplier ? 'Select Supplier' : 'Select Customer / Farmer',
    selectPartyPlaceholder: '-- Select from list or enter name below --',
    partyNameLabel: 'Party Name *',
    partyNamePlaceholder: 'e.g. Ganesh Agro Traders',
    mobileLabel: 'Mobile Number',
    mobilePlaceholder: 'e.g. 9876543210',
    returnQtyLabel: (unit: string, max: number) => `Return Quantity (${unit}) * (Max: ${max})`,
    transportSectionTitle: 'Transporter & Vehicle Details',
    transporterNameLabel: 'Transporter Name',
    transporterPlaceholder: 'e.g. Siddheshwar Logistics',
    vehicleNoLabel: 'Vehicle / Truck Number',
    vehiclePlaceholder: 'e.g. MH 12 AB 1234',
    driverNameLabel: 'Driver Name',
    driverPlaceholder: 'e.g. Ramesh Shinde',
    driverMobileLabel: 'Driver Mobile',
    driverMobilePlaceholder: 'e.g. 9822001122',
    returnReasonLabel: 'Reason for Return',
    returnReasonPlaceholder: 'e.g. High moisture / Quality standard failed',
    remarksLabel: 'Remarks / Notes',
    remarksPlaceholder: 'Additional notes or instructions...',
    btnSubmitReturn: 'Generate Gate Pass & Return Material',

    // Reprocess Modal
    modalReprocessTitle: 'Reprocess Rejection Lot',
    availableStockLabel: 'Available Stock:',
    reprocessQtyLabel: (unit: string) => `Reprocessing Quantity (${unit})`,
    workflowLabel: 'Select Reprocessing Workflow (Optional)',
    defaultWorkflow: 'Default Workflow',
    reprocessNotesLabel: 'Remarks / Instructions',
    reprocessNotesPlaceholder: 'e.g. For re-grading and polishing',
    btnSubmitReprocess: 'Start Reprocessing Batch',

    // Dispose Modal
    modalDisposeTitle: 'Scrap / Dispose Rejection Lot',
    disposeQtyLabel: (unit: string) => `Disposal Quantity (${unit})`,
    disposeReasonLabel: 'Disposal Reason *',
    disposeReasonPlaceholder: 'e.g. Fully deteriorated / unrecoverable material',
    btnSubmitDispose: 'Record Disposal',

    // Trace Modal
    modalTraceTitle: 'Rejection History & Origin Batch (Traceability)',
    originSectionTitle: 'Origin Batch & Stage',
    originBatchLabel: 'Origin Batch:',
    originStageLabel: 'Stage:',
    originReasonLabel: 'Reason:',
    reprocessingBatchesTitle: (count: number) => `Reprocessing Batches (${count})`,
    noReprocessingBatches: 'No reprocessing batches have been created from this lot yet.',
    inputKg: 'Input:',
  },
  mr: {
    title: 'रिजेक्शन व्यवस्थापन (Rejection & Return Engine)',
    subtitle: 'क्वालिटी किंवा प्रोसेसमध्ये बाद झालेला माल व्यवस्थापित करा — पुरवठादाराला किंवा जॉब वर्क शेतकरी/ग्राहकाला माल परत पाठवा (Return Gate Pass सह), पुन्हा प्रोसेस करा किंवा स्क्रॅप करा.',
    refresh: 'रिफ्रेश',
    downloadExcel: 'एक्सेल रिपोर्ट (Excel)',
    downloadPdfReport: 'PDF रिपोर्ट',
    exporting: 'डाउनलोड होत आहे...',
    kpiTotalLots: 'एकूण रिजेक्शन लॉट्स',
    kpiTotalLotsSub: 'Total Quality Failure Lots',
    kpiAvailableStock: 'उपलब्ध रिजेक्ट साठा',
    kpiAvailableStockSub: 'Holding in Mill Godowns',
    kpiReturned: 'परत केलेला माल (Returns)',
    kpiReturnedSub: 'Supplier & Job Work Returns',
    kpiDisposed: 'स्क्रॅप / विल्हेवाट',
    kpiDisposedSub: 'Disposed & Scrapped',
    tabLots: 'रिजेक्शन लॉट्स व साठा (Active Lots)',
    tabReturns: 'परत केलेल्या मालाचा इतिहास व गेट पास (Return History)',
    searchPlaceholder: 'लॉट नं, उत्पादन, बॅच नंबर शोधा...',
    allStatuses: 'सर्व स्थिती (All Statuses)',
    statusAvailable: 'AVAILABLE (उपलब्ध साठा)',
    statusStored: 'STORED (गोदाम साठा)',
    statusPartiallyReprocessed: 'PARTIALLY REPROCESSED',
    statusFullyReprocessed: 'FULLY REPROCESSED',
    statusDisposed: 'DISPOSED / RETURNED',
    filterReasonPlaceholder: 'कारणाने फिल्टर करा...',
    noLotsFound: 'कोणताही रिजेक्शन लॉट उपलब्ध नाही.',
    colLotNo: 'लॉट नंबर',
    colProduct: 'उत्पादन / माल',
    colBatch: 'बॅच / सोर्स',
    colInitialQty: 'मूळ साठा',
    colAvailable: 'शिल्लक (Available)',
    colDisposed: 'निपटारा / परत',
    colReason: 'रिजेक्शनचे कारण',
    colGodown: 'गोदाम',
    colStatus: 'स्थिती',
    colActions: 'कृती (Actions)',
    btnReturn: 'माल परत',
    btnReprocess: 'Reprocess',
    btnDispose: 'Dispose',
    tooltipReturn: 'माल परत पाठवा (Return to Supplier / Farmer)',
    tooltipReprocess: 'पुन्हा प्रोसेस करा',
    tooltipDispose: 'स्क्रॅप करा',
    tooltipTrace: 'इतिहास व मूळ बॅच बघा',
    pageInfo: (p: number, totalP: number, total: number) => `पृष्ठ ${p} / ${totalP} (${total} एकूण नोंदी)`,
    returnHistoryTitle: 'परत केलेल्या मालाचा इतिहास व गेट पास (Return History & Dispatched Passes)',
    noReturnsFound: 'अद्याप कोणताही माल परत (Return) केलेला नाही.',
    colGatePass: 'गेट पास / चलन नं',
    colDate: 'तारीख',
    colReturnType: 'परतावा प्रकार (Type)',
    colParty: 'पार्टी (Supplier / Farmer)',
    colProductLot: 'उत्पादन / लॉट',
    colReturnQty: 'परत प्रमाण (Qty)',
    colTransport: 'ट्रान्सपोर्ट व वाहन',
    colRemarks: 'कारण / शेरा',
    colGatePassPdf: 'गेट पास PDF',
    typeSupplierReturn: 'पुरवठादार परतावा',
    typeJobWorkReturn: 'जॉब वर्क परतावा',
    directTransport: 'थेट / स्वतःचे',
    challansUnit: 'Challans',
    kgUnit: 'kg',

    // Return Modal
    modalReturnTitle: 'रिजेक्ट माल परत पाठवा (Return Material)',
    modalReturnSubtitle: (lot: string, prod: string, qty: number, unit: string) => `लॉट #${lot} — ${prod} (${qty} ${unit} शिल्लक)`,
    gatePassSuccessTitle: 'गेट पास यशस्वीपणे तयार झाला!',
    gatePassSuccessDesc: (gp: string, qty: number, unit: string, party: string) => `Gate Pass No: ${gp} • ${qty} ${unit} माल ${party} यांना पाठवला गेला आहे.`,
    downloadPdf: 'Gate Pass PDF डाउनलोड करा',
    close: 'बंद करा',
    cancel: 'रद्द करा',
    returnTypeLabel: 'परतावा प्रकार (Return Type) *',
    optSupplier: 'पुरवठादार (Supplier Return)',
    optJobWork: 'जॉब वर्क शेतकरी/ग्राहक (Job Work Return)',
    selectPartyLabel: (isSupplier: boolean) => isSupplier ? 'पुरवठादार निवडा' : 'ग्राहक / शेतकरी निवडा',
    selectPartyPlaceholder: '-- यादीतून निवडा किंवा खाली नाव टाका --',
    partyNameLabel: 'पार्टीचे नाव *',
    partyNamePlaceholder: 'उदा. गणेश ॲग्रो ट्रेडर्स',
    mobileLabel: 'मोबाईल नंबर',
    mobilePlaceholder: 'उदा. 9876543210',
    returnQtyLabel: (unit: string, max: number) => `परत करायचे प्रमाण (${unit}) * (Max: ${max})`,
    transportSectionTitle: 'वाहतूक तपशील (Transporter & Vehicle Details)',
    transporterNameLabel: 'ट्रान्सपोर्टरचे नाव',
    transporterPlaceholder: 'उदा. सिद्धेश्वर लॉजिस्टिक्स',
    vehicleNoLabel: 'गाडी / वाहन क्रमांक',
    vehiclePlaceholder: 'उदा. MH 12 AB 1234',
    driverNameLabel: 'ड्रायव्हरचे नाव',
    driverPlaceholder: 'उदा. रमेश शिंदे',
    driverMobileLabel: 'ड्रायव्हर मोबाईल',
    driverMobilePlaceholder: 'उदा. 9822001122',
    returnReasonLabel: 'परताव्याचे कारण (Reason for Return)',
    returnReasonPlaceholder: 'उदा. ओलावा जास्त / गुणवत्ता निकषात बसत नाही',
    remarksLabel: 'शेरा / Notes',
    remarksPlaceholder: 'अधिक माहिती / सूचना...',
    btnSubmitReturn: 'गेट पास तयार करून माल परत पाठवा',

    // Reprocess Modal
    modalReprocessTitle: 'रिजेक्ट लॉट पुन्हा प्रोसेस करा (Reprocess)',
    availableStockLabel: 'उपलब्ध साठा:',
    reprocessQtyLabel: (unit: string) => `Reprocessing प्रमाण (${unit})`,
    workflowLabel: 'Reprocessing वर्कफ्लो निवडा (ऐच्छिक)',
    defaultWorkflow: 'डिफॉल्ट वर्कफ्लो',
    reprocessNotesLabel: 'शेरा / सूचना',
    reprocessNotesPlaceholder: 'उदा. री-ग्रेडिंग आणि पॉलिशिंगसाठी',
    btnSubmitReprocess: 'रिप्रोसेसिंग बॅच सुरू करा',

    // Dispose Modal
    modalDisposeTitle: 'स्क्रॅप / विल्हेवाट लावा (Dispose)',
    disposeQtyLabel: (unit: string) => `विल्हेवाट प्रमाण (${unit})`,
    disposeReasonLabel: 'विल्हेवाटीचे कारण *',
    disposeReasonPlaceholder: 'उदा. पूर्णतः खराब झालेला माल',
    btnSubmitDispose: 'विल्हेवाट नोंदवा',

    // Trace Modal
    modalTraceTitle: 'रिजेक्शन इतिहास व मूळ बॅच (Traceability)',
    originSectionTitle: 'मूळ बॅच व स्टेज (Origin Batch & Stage)',
    originBatchLabel: 'मूळ बॅच:',
    originStageLabel: 'स्टेज:',
    originReasonLabel: 'कारण:',
    reprocessingBatchesTitle: (count: number) => `Reprocessing बॅचेस (${count})`,
    noReprocessingBatches: 'या लॉटमधून अद्याप कोणतीही रिप्रोसेसिंग बॅच सुरू केलेली नाही.',
    inputKg: 'Input:',
  },
  hi: {
    title: 'रिजेक्शन प्रबंधन (Rejection & Return Engine)',
    subtitle: 'गुणवत्ता या प्रक्रिया में खारिज सामग्री का प्रबंधन करें — आपूर्तिकर्ता या जॉब वर्क किसान/ग्राहक को माल वापस भेजें (Return Gate Pass सहित), पुन: प्रोसेस करें या स्क्रैप करें।',
    refresh: 'रिफ्रेश',
    downloadExcel: 'एक्सेल रिपोर्ट (Excel)',
    downloadPdfReport: 'PDF रिपोर्ट',
    exporting: 'डाउनलोड हो रहा है...',
    kpiTotalLots: 'कुल रिजेक्शन लॉट',
    kpiTotalLotsSub: 'Total Quality Failure Lots',
    kpiAvailableStock: 'उपलब्ध रिजेक्ट स्टॉक',
    kpiAvailableStockSub: 'Holding in Mill Godowns',
    kpiReturned: 'वापस किया गया माल (Returns)',
    kpiReturnedSub: 'Supplier & Job Work Returns',
    kpiDisposed: 'स्क्रैप / निपटान',
    kpiDisposedSub: 'Disposed & Scrapped',
    tabLots: 'रिजेक्शन लॉट व स्टॉक (Active Lots)',
    tabReturns: 'वापसी इतिहास व गेट पास (Return History)',
    searchPlaceholder: 'लॉट नं, उत्पाद, बैच नंबर खोजें...',
    allStatuses: 'सभी स्थितियां (All Statuses)',
    statusAvailable: 'AVAILABLE (उपलब्ध स्टॉक)',
    statusStored: 'STORED (गोदाम स्टॉक)',
    statusPartiallyReprocessed: 'PARTIALLY REPROCESSED',
    statusFullyReprocessed: 'FULLY REPROCESSED',
    statusDisposed: 'DISPOSED / RETURNED',
    filterReasonPlaceholder: 'कारण से फ़िल्टर करें...',
    noLotsFound: 'कोई रिजेक्शन लॉट उपलब्ध नहीं है।',
    colLotNo: 'लॉट नंबर',
    colProduct: 'उत्पाद / वस्तु',
    colBatch: 'बैच / स्रोत',
    colInitialQty: 'मूल स्टॉक',
    colAvailable: 'उपलब्ध (Available)',
    colDisposed: 'निपटान / वापसी',
    colReason: 'रिजेक्शन का कारण',
    colGodown: 'गोदाम',
    colStatus: 'स्थिति',
    colActions: 'कार्रवाई (Actions)',
    btnReturn: 'माल वापसी',
    btnReprocess: 'Reprocess',
    btnDispose: 'Dispose',
    tooltipReturn: 'आपूर्तिकर्ता/किसान को माल वापस भेजें',
    tooltipReprocess: 'पुन: प्रोसेस करें',
    tooltipDispose: 'स्क्रैप करें',
    tooltipTrace: 'इतिहास और मूल बैच देखें',
    pageInfo: (p: number, totalP: number, total: number) => `पृष्ठ ${p} / ${totalP} (${total} कुल रिकॉर्ड)`,
    returnHistoryTitle: 'वापसी का इतिहास और गेट पास (Return History & Dispatched Passes)',
    noReturnsFound: 'अभी तक कोई सामग्री वापसी दर्ज नहीं की गई है।',
    colGatePass: 'गेट पास / चालान नं',
    colDate: 'तारीख',
    colReturnType: 'वापसी प्रकार (Type)',
    colParty: 'पार्टी (Supplier / Farmer)',
    colProductLot: 'उत्पाद / लॉट',
    colReturnQty: 'वापसी मात्रा (Qty)',
    colTransport: 'परिवहन और वाहन',
    colRemarks: 'कारण / टिप्पणी',
    colGatePassPdf: 'गेट पास PDF',
    typeSupplierReturn: 'आपूर्तिकर्ता वापसी',
    typeJobWorkReturn: 'जॉब वर्क वापसी',
    directTransport: 'सीधे / स्वयं',
    challansUnit: 'Challans',
    kgUnit: 'kg',

    // Return Modal
    modalReturnTitle: 'रिजेक्ट सामग्री वापस भेजें (Return Material)',
    modalReturnSubtitle: (lot: string, prod: string, qty: number, unit: string) => `लॉट #${lot} — ${prod} (${qty} ${unit} उपलब्ध)`,
    gatePassSuccessTitle: 'गेट पास सफलतापूर्वक तैयार हो गया!',
    gatePassSuccessDesc: (gp: string, qty: number, unit: string, party: string) => `Gate Pass No: ${gp} • ${qty} ${unit} सामग्री ${party} को भेज दी गई है।`,
    downloadPdf: 'Gate Pass PDF डाउनलोड करें',
    close: 'बंद करें',
    cancel: 'रद्द करें',
    returnTypeLabel: 'वापसी प्रकार (Return Type) *',
    optSupplier: 'आपूर्तिकर्ता (Supplier Return)',
    optJobWork: 'जॉब वर्क किसान/ग्राहक (Job Work Return)',
    selectPartyLabel: (isSupplier: boolean) => isSupplier ? 'आपूर्तिकर्ता चुनें' : 'ग्राहक / किसान चुनें',
    selectPartyPlaceholder: '-- सूची से चुनें या नीचे नाम दर्ज करें --',
    partyNameLabel: 'पार्टी का नाम *',
    partyNamePlaceholder: 'उदा. गणेश एग्रो ट्रेडर्स',
    mobileLabel: 'मोबाइल नंबर',
    mobilePlaceholder: 'उदा. 9876543210',
    returnQtyLabel: (unit: string, max: number) => `वापसी मात्रा (${unit}) * (Max: ${max})`,
    transportSectionTitle: 'परिवहन और वाहन विवरण (Transporter & Vehicle Details)',
    transporterNameLabel: 'ट्रांसपोर्टर का नाम',
    transporterPlaceholder: 'उदा. सिद्धेश्वर लॉजिस्टिक्स',
    vehicleNoLabel: 'वाहन क्रमांक',
    vehiclePlaceholder: 'उदा. MH 12 AB 1234',
    driverNameLabel: 'ड्राइवर का नाम',
    driverPlaceholder: 'उदा. रमेश शिंदे',
    driverMobileLabel: 'ड्राइवर मोबाइल',
    driverMobilePlaceholder: 'उदा. 9822001122',
    returnReasonLabel: 'वापसी का कारण (Reason for Return)',
    returnReasonPlaceholder: 'उदा. नमी अधिक / गुणवत्ता मानकों के अनुरूप नहीं',
    remarksLabel: 'टिप्पणी / Notes',
    remarksPlaceholder: 'अतिरिक्त विवरण या निर्देश...',
    btnSubmitReturn: 'गेट पास बनाएं और माल वापस भेजें',

    // Reprocess Modal
    modalReprocessTitle: 'रिजेक्ट लॉट पुन: प्रोसेस करें (Reprocess)',
    availableStockLabel: 'उपलब्ध स्टॉक:',
    reprocessQtyLabel: (unit: string) => `पुन: प्रसंस्करण मात्रा (${unit})`,
    workflowLabel: 'पुन: प्रसंस्करण वर्कफ़्लो चुनें (वैकल्पिक)',
    defaultWorkflow: 'डिफ़ॉल्ट वर्कफ़्लो',
    reprocessNotesLabel: 'टिप्पणी / निर्देश',
    reprocessNotesPlaceholder: 'उदा. री-ग्रेडिंग और पॉलिशिंग के लिए',
    btnSubmitReprocess: 'पुन: प्रसंस्करण बैच शुरू करें',

    // Dispose Modal
    modalDisposeTitle: 'स्क्रैप / निपटान करें (Dispose)',
    disposeQtyLabel: (unit: string) => `निपटान मात्रा (${unit})`,
    disposeReasonLabel: 'निपटान का कारण *',
    disposeReasonPlaceholder: 'उदा. पूरी तरह से खराब सामग्री',
    btnSubmitDispose: 'निपटान दर्ज करें',

    // Trace Modal
    modalTraceTitle: 'रिजेक्शन इतिहास और मूल बैच (Traceability)',
    originSectionTitle: 'मूल बैच और स्टेज (Origin Batch & Stage)',
    originBatchLabel: 'मूल बैच:',
    originStageLabel: 'स्टेज:',
    originReasonLabel: 'कारण:',
    reprocessingBatchesTitle: (count: number) => `पुन: प्रसंस्करण बैच (${count})`,
    noReprocessingBatches: 'इस लॉट से अभी तक कोई पुन: प्रसंस्करण बैच शुरू नहीं किया गया है।',
    inputKg: 'Input:',
  },
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function RejectionsPage() {
  const t = useTranslations('Rejections');
  const activeShopId = useBusinessStore((s) => s.activeShopId);
  const profile = useBusinessStore((s) => s.profile);
  const currentLocale = useLocale() as 'en' | 'mr' | 'hi';

  const [activeTab, setActiveTab] = useState<'LOTS' | 'RETURNS'>('LOTS');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Modals state
  const [reprocessLot, setReprocessLot] = useState<RejectionLot | null>(null);
  const [quickLot, setQuickLot] = useState<RejectionLot | null>(null);
  const [cancellingBatch, setCancellingBatch] = useState<string | null>(null);
  const [disposeLot, setDisposeLot] = useState<RejectionLot | null>(null);
  const [returnLot, setReturnLot] = useState<RejectionLot | null>(null);
  const [traceLotId, setTraceLotId] = useState<string | null>(null);

  // Return form state
  const [returnType, setReturnType] = useState<'SUPPLIER_RETURN' | 'JOB_WORK_RETURN'>('SUPPLIER_RETURN');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [lastGeneratedGatePass, setLastGeneratedGatePass] = useState<any | null>(null);

  // Reprocess form state
  const [reprocessQty, setReprocessQty] = useState('');
  const [workflowVersionId, setWorkflowVersionId] = useState('');
  const [reprocessNotes, setReprocessNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Dispose form state
  const [disposeQty, setDisposeQty] = useState('');
  const [disposeReason, setDisposeReason] = useState('');
  const [disposeNotes, setDisposeNotes] = useState('');

  const queryKey = activeShopId
    ? `/mill/rejections?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}${
        statusFilter ? `&status=${statusFilter}` : ''
      }${reasonFilter ? `&rejectionReason=${encodeURIComponent(reasonFilter)}` : ''}`
    : null;

  const { data, isLoading, mutate } = useSWR<RejectionsApiResponse>(queryKey, fetcher);
  const { data: returnsData, mutate: mutateReturns, isLoading: isReturnsLoading } = useSWR<{ items: RejectionReturnRecord[] } | RejectionReturnRecord[]>(
    activeShopId ? `/mill/rejections/returns` : null,
    fetcher
  );

  const { data: workflowsData } = useSWR(activeShopId ? `/mill/workflows` : null, fetcher);
  const { data: suppliersData } = useSWR(activeShopId ? `/suppliers` : null, fetcher);
  const { data: customersData } = useSWR(activeShopId ? `/crm/customers` : null, fetcher);

  const { data: traceData, isLoading: isTraceLoading, mutate: mutateTrace } = useSWR(
    activeShopId && traceLotId ? `/mill/rejections/${traceLotId}?traceability=true` : null,
    fetcher
  );

  const lots: RejectionLot[] = (data && Array.isArray(data.items)) ? data.items : (Array.isArray(data) ? (data as unknown as RejectionLot[]) : []);
  const pagination = data?.pagination || { page: 1, limit: 50, total: lots.length, totalPages: 1 };
  const workflows = Array.isArray(workflowsData) ? workflowsData : workflowsData?.items || [];
  const suppliers = Array.isArray(suppliersData) ? suppliersData : suppliersData?.suppliers || [];
  const customers = Array.isArray(customersData) ? customersData : customersData?.customers || [];
  const returnHistory: RejectionReturnRecord[] = Array.isArray(returnsData)
    ? returnsData
    : Array.isArray((returnsData as any)?.items)
    ? (returnsData as any).items
    : [];

  // Summary Metrics
  const totalLots = pagination.total || lots.length;
  const availableKg = lots.reduce((acc, l) => acc + (Number(l.availableQuantity) || 0), 0);
  const disposedKg = lots.reduce((acc, l) => acc + (Number(l.disposedQuantity) || 0), 0);

  const handleDownloadExcelReport = async () => {
    try {
      setIsExportingExcel(true);

      // Fetch all rejection lots if more exist
      let exportLots: RejectionLot[] = lots;
      if (pagination.total > lots.length) {
        const fullRes = await api.get(`/mill/rejections?limit=1000`);
        if (Array.isArray(fullRes.data?.items)) {
          exportLots = fullRes.data.items;
        } else if (Array.isArray(fullRes.data)) {
          exportLots = fullRes.data;
        }
      }
      if (!Array.isArray(exportLots)) exportLots = [];

      // Fetch all returns if not loaded yet
      let exportReturns: RejectionReturnRecord[] = returnHistory;
      if (exportReturns.length === 0) {
        const retRes = await api.get(`/mill/rejections/returns`);
        if (Array.isArray(retRes.data?.items)) {
          exportReturns = retRes.data.items;
        } else if (Array.isArray(retRes.data)) {
          exportReturns = retRes.data;
        }
      }
      if (!Array.isArray(exportReturns)) exportReturns = [];

      const lotsSheet: WorkbookSheet = {
        name: 'Rejection Lots',
        columns: [
          { key: 'lotNumber', label: 'Lot Number', type: 'text' },
          { key: 'productName', label: 'Product Name', type: 'text' },
          { key: 'sku', label: 'SKU', type: 'text' },
          { key: 'batchNumber', label: 'Source Batch', type: 'text' },
          { key: 'partyName', label: 'Farmer / Customer / Supplier', type: 'text' },
          { key: 'quantity', label: 'Initial Qty', type: 'number' },
          { key: 'availableQuantity', label: 'Available Qty', type: 'number' },
          { key: 'disposedQuantity', label: 'Disposed / Returned Qty', type: 'number' },
          { key: 'unit', label: 'Unit', type: 'text' },
          { key: 'rejectionReason', label: 'Rejection Reason', type: 'text' },
          { key: 'godownName', label: 'Holding Godown', type: 'text' },
          { key: 'status', label: 'Status', type: 'text' },
          { key: 'createdAt', label: 'Created Date', type: 'date' },
        ],
        rows: exportLots.map((l) => ({
          lotNumber: l.lotNumber,
          productName: l.product?.name || '-',
          sku: l.product?.sku || '-',
          batchNumber: l.batch?.batchNumber || '-',
          partyName: l.batch?.customer?.name || l.batch?.rawMaterialLot?.supplier?.name || l.batch?.rawMaterialLot?.farmerName || '-',
          quantity: l.quantity,
          availableQuantity: l.availableQuantity,
          disposedQuantity: l.disposedQuantity || 0,
          unit: l.unit,
          rejectionReason: l.rejectionReason || 'Quality Failure',
          godownName: l.godown?.name || 'Rejection Holding',
          status: l.status,
          createdAt: l.createdAt,
        })),
      };

      const returnsSheet: WorkbookSheet = {
        name: 'Dispatched Returns',
        columns: [
          { key: 'gatePassNo', label: 'Gate Pass No', type: 'text' },
          { key: 'returnedAt', label: 'Return Date', type: 'date' },
          { key: 'returnType', label: 'Return Type', type: 'text' },
          { key: 'partyName', label: 'Party Name', type: 'text' },
          { key: 'partyPhone', label: 'Party Phone', type: 'text' },
          { key: 'productName', label: 'Product Name', type: 'text' },
          { key: 'lotNumber', label: 'Lot Number', type: 'text' },
          { key: 'returnQuantity', label: 'Return Qty', type: 'number' },
          { key: 'unit', label: 'Unit', type: 'text' },
          { key: 'transporterName', label: 'Transporter', type: 'text' },
          { key: 'vehicleNumber', label: 'Vehicle No', type: 'text' },
          { key: 'driverName', label: 'Driver Name', type: 'text' },
          { key: 'driverPhone', label: 'Driver Phone', type: 'text' },
          { key: 'reason', label: 'Reason', type: 'text' },
          { key: 'remarks', label: 'Remarks', type: 'text' },
        ],
        rows: exportReturns.map((r) => ({
          gatePassNo: r.gatePassNo,
          returnedAt: r.returnedAt,
          returnType: r.returnType === 'JOB_WORK_RETURN' ? 'Job Work Return' : 'Supplier Return',
          partyName: r.partyName,
          partyPhone: r.partyPhone || '-',
          productName: r.productName,
          lotNumber: r.lotNumber,
          returnQuantity: r.returnQuantity,
          unit: r.unit,
          transporterName: r.transporterName || 'Direct',
          vehicleNumber: r.vehicleNumber || '-',
          driverName: r.driverName || '-',
          driverPhone: r.driverPhone || '-',
          reason: r.reason || '-',
          remarks: r.remarks || '-',
        })),
      };

      const blob = await buildWorkbookBlob([lotsSheet, returnsSheet]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rejection_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
      alert('Error exporting Excel report');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadPdfReport = async () => {
    try {
      setIsExportingPdf(true);

      let exportLots: RejectionLot[] = lots;
      if (pagination.total > lots.length) {
        const fullRes = await api.get(`/mill/rejections?limit=1000`);
        if (Array.isArray(fullRes.data?.items)) {
          exportLots = fullRes.data.items;
        } else if (Array.isArray(fullRes.data)) {
          exportLots = fullRes.data;
        }
      }
      if (!Array.isArray(exportLots)) exportLots = [];

      let exportReturns: RejectionReturnRecord[] = returnHistory;
      if (exportReturns.length === 0) {
        const retRes = await api.get(`/mill/rejections/returns`);
        if (Array.isArray(retRes.data?.items)) {
          exportReturns = retRes.data.items;
        } else if (Array.isArray(retRes.data)) {
          exportReturns = retRes.data;
        }
      }
      if (!Array.isArray(exportReturns)) exportReturns = [];

      const shopHeader = {
        name: profile?.shopName || 'Bada Udyog Mill & Agro Processing',
        address: profile?.address || 'Industrial Area',
        mobile: profile?.mobile || '',
        gst: profile?.gst || '',
        pan: profile?.pan || '',
      };

      const { blob, filename } = await generateRejectionReportPdf({
        shop: shopHeader,
        lots: exportLots.map((l) => ({
          lotNumber: l.lotNumber,
          productName: l.product?.name || '-',
          batchNumber: l.batch?.batchNumber || null,
          batchType: l.batch?.batchType || null,
          partyName: l.batch?.customer?.name || l.batch?.rawMaterialLot?.supplier?.name || l.batch?.rawMaterialLot?.farmerName || null,
          quantity: l.quantity,
          availableQuantity: l.availableQuantity,
          disposedQuantity: l.disposedQuantity || 0,
          unit: l.unit,
          rejectionReason: l.rejectionReason,
          godownName: l.godown?.name || 'Rejection Holding',
          status: l.status,
          createdAt: l.createdAt,
        })),
        returns: exportReturns.map((r) => ({
          gatePassNo: r.gatePassNo,
          returnedAt: r.returnedAt,
          returnType: r.returnType,
          partyName: r.partyName,
          partyPhone: r.partyPhone,
          productName: r.productName,
          lotNumber: r.lotNumber,
          returnQuantity: r.returnQuantity,
          unit: r.unit,
          transporterName: r.transporterName,
          vehicleNumber: r.vehicleNumber,
          driverName: r.driverName,
          driverPhone: r.driverPhone,
          reason: r.reason,
          remarks: r.remarks,
        })),
        generatedAt: new Date(),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PDF report:', err);
      alert('Error generating PDF report');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleOpenReturn = (lot: RejectionLot) => {
    setReturnLot(lot);
    setReturnQty(String(lot.availableQuantity));
    setReturnReason(lot.rejectionReason || 'Quality Rejection / Substandard Grade');
    setReturnRemarks('');
    setTransporterName('');
    setVehicleNumber('');
    setDriverName('');
    setDriverPhone('');
    setErrorMsg('');
    setSuccessMsg('');
    setLastGeneratedGatePass(null);

    // Auto-detect Job Work customer or Supplier from Batch
    if (lot.batch?.batchType === 'JOB_WORK' || lot.batch?.customer) {
      setReturnType('JOB_WORK_RETURN');
      if (lot.batch?.customer) {
        setSelectedPartyId(lot.batch.customer.id);
        setPartyName(lot.batch.customer.name);
        setPartyPhone(lot.batch.customer.phone || '');
      } else {
        setSelectedPartyId('');
        setPartyName('');
        setPartyPhone('');
      }
    } else {
      setReturnType('SUPPLIER_RETURN');
      const supp = lot.batch?.rawMaterialLot?.supplier;
      if (supp) {
        setSelectedPartyId(supp.id);
        setPartyName(supp.name);
        setPartyPhone(supp.mobile || '');
      } else if (lot.batch?.rawMaterialLot?.farmerName) {
        setSelectedPartyId('');
        setPartyName(lot.batch.rawMaterialLot.farmerName);
        setPartyPhone('');
      } else {
        setSelectedPartyId('');
        setPartyName('');
        setPartyPhone('');
      }
    }
  };

  const handlePartySelect = (partyId: string) => {
    setSelectedPartyId(partyId);
    if (returnType === 'SUPPLIER_RETURN') {
      const s = suppliers.find((x: any) => x.id === partyId);
      if (s) {
        setPartyName(s.name);
        setPartyPhone(s.mobile || s.phone || '');
      }
    } else {
      const c = customers.find((x: any) => x.id === partyId);
      if (c) {
        setPartyName(c.name);
        setPartyPhone(c.mobile || c.phone || '');
      }
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnLot) return;
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.post(`/mill/rejections/${returnLot.id}/return`, {
        returnType,
        partyName: partyName.trim(),
        partyPhone: partyPhone.trim() || undefined,
        returnQuantity: Number(returnQty),
        unit: returnLot.unit,
        reason: returnReason.trim() || undefined,
        transporterName: transporterName.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        remarks: returnRemarks.trim() || undefined,
      });

      const gatePassData = res.data.returnRecord;
      setLastGeneratedGatePass(gatePassData);
      setSuccessMsg(`Gate Pass #${gatePassData.gatePassNo} generated successfully!`);
      mutate();
      if (activeTab === 'RETURNS') mutateReturns();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to process material return');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadGatePassPdf = async (record: any) => {
    try {
      const shopHeader = {
        name: profile?.shopName || 'Bada Udyog Mill & Agro Processing',
        address: profile?.address || 'Industrial Area',
        mobile: profile?.mobile || '',
        gst: profile?.gst || '',
        pan: profile?.pan || '',
      };

      const { blob, filename } = await generateRejectionReturnGatePassPdf({
        shop: shopHeader,
        gatePassNo: record.gatePassNo,
        returnType: record.returnType,
        partyName: record.partyName,
        partyPhone: record.partyPhone,
        date: record.returnedAt || new Date(),
        lotNumber: record.lotNumber,
        productName: record.productName,
        returnQuantity: Number(record.returnQuantity),
        unit: record.unit || 'Kg',
        reason: record.reason,
        transporterName: record.transporterName,
        vehicleNumber: record.vehicleNumber,
        driverName: record.driverName,
        driverPhone: record.driverPhone,
        remarks: record.remarks,
        batchNumber: record.batchNumber,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Error generating Gate Pass PDF');
    }
  };

  const handleOpenReprocess = (lot: RejectionLot) => {
    // Reprocessing is booked in ONE step (what went in, what came out) — the same form as Milling -> Reprocess. The old flow only opened a
    // batch to be worked stage by stage, which left the material "in progress" with nowhere to finish it.
    setQuickLot(lot);
    return;
    // eslint-disable-next-line no-unreachable
    setReprocessLot(lot);
    setReprocessQty(String(lot.availableQuantity));
    setWorkflowVersionId('');
    setReprocessNotes('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleOpenDispose = (lot: RejectionLot) => {
    setDisposeLot(lot);
    setDisposeQty(String(lot.availableQuantity));
    setDisposeReason('');
    setDisposeNotes('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleReprocessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reprocessLot) return;
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.post(`/mill/rejections/${reprocessLot.id}/reprocess`, {
        quantity: Number(reprocessQty),
        unit: reprocessLot.unit,
        workflowVersionId: workflowVersionId || undefined,
        notes: reprocessNotes,
      });

      setSuccessMsg(`Successfully created Reprocessing Batch #${res.data.batch.batchNumber}`);
      setTimeout(() => {
        setReprocessLot(null);
        mutate();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Reprocessing failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposeLot) return;
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await api.post(`/mill/rejections/${disposeLot.id}/dispose`, {
        quantity: Number(disposeQty),
        reason: disposeReason,
        notes: disposeNotes,
      });

      setSuccessMsg(`Disposal recorded successfully`);
      setTimeout(() => {
        setDisposeLot(null);
        mutate();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Disposal failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle size={24} className="text-red-500" /> {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-4xl">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Download Excel Report */}
          <button
            onClick={handleDownloadExcelReport}
            disabled={isExportingExcel}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            {isExportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />}
            {t('downloadExcel')}
          </button>

          {/* Download PDF Report */}
          <button
            onClick={handleDownloadPdfReport}
            disabled={isExportingPdf}
            className="bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/40 dark:hover:bg-red-900/60 dark:text-red-300 border border-red-200 dark:border-red-800/50 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            {isExportingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} className="text-red-600 dark:text-red-400" />}
            {t('downloadPdfReport')}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => {
              mutate();
              if (activeTab === 'RETURNS') mutateReturns();
            }}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={16} /> {t('refresh')}
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">{t('kpiTotalLots')}</span>
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1.5 font-mono">{totalLots}</p>
          <span className="text-[11px] text-slate-400">{t('kpiTotalLotsSub')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">{t('kpiAvailableStock')}</span>
            <PackageCheck size={18} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1.5 font-mono">
            {availableKg.toLocaleString('en-IN')} <span className="text-xs">{t('kgUnit')}</span>
          </p>
          <span className="text-[11px] text-slate-400">{t('kpiAvailableStockSub')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">{t('kpiReturned')}</span>
            <Undo2 size={18} className="text-blue-500" />
          </div>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1.5 font-mono">
            {returnHistory.length} <span className="text-xs">{t('challansUnit')}</span>
          </p>
          <span className="text-[11px] text-slate-400">{t('kpiReturnedSub')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">{t('kpiDisposed')}</span>
            <Trash2 size={18} className="text-slate-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-700 dark:text-slate-300 mt-1.5 font-mono">
            {disposedKg.toLocaleString('en-IN')} <span className="text-xs">{t('kgUnit')}</span>
          </p>
          <span className="text-[11px] text-slate-400">{t('kpiDisposedSub')}</span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('LOTS')}
          className={cn(
            'px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'LOTS'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          )}
        >
          <AlertTriangle size={16} /> {t('tabLots')}
        </button>
        <button
          onClick={() => setActiveTab('RETURNS')}
          className={cn(
            'px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'RETURNS'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          )}
        >
          <Undo2 size={16} /> {t('tabReturns')}
          {returnHistory.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold">
              {returnHistory.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'LOTS' ? (
        <>
          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium"
            >
              <option value="">{t('allStatuses')}</option>
              <option value="AVAILABLE">{t('statusAvailable')}</option>
              <option value="STORED">{t('statusStored')}</option>
              <option value="PARTIALLY_REPROCESSED">{t('statusPartiallyReprocessed')}</option>
              <option value="FULLY_REPROCESSED">{t('statusFullyReprocessed')}</option>
              <option value="DISPOSED">{t('statusDisposed')}</option>
            </select>

            <input
              type="text"
              placeholder={t('filterReasonPlaceholder')}
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm"
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : lots.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
              <AlertTriangle size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
              <p className="mt-3 text-sm text-slate-500">{t('noLotsFound')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-bold">{t('colLotNo')}</th>
                    <th className="px-3 py-3 font-bold">{t('colProduct')}</th>
                    <th className="px-3 py-3 font-bold">{t('colBatch')}</th>
                    <th className="px-3 py-3 font-bold text-right">{t('colInitialQty')}</th>
                    <th className="px-3 py-3 font-bold text-right">{t('colAvailable')}</th>
                    <th className="px-3 py-3 font-bold text-right">{t('colDisposed')}</th>
                    <th className="px-3 py-3 font-bold">{t('colReason')}</th>
                    <th className="px-3 py-3 font-bold">{t('colGodown')}</th>
                    <th className="px-3 py-3 font-bold">{t('colStatus')}</th>
                    <th className="px-4 py-3 font-bold text-right">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lots.map((lot) => {
                    const isActionable =
                      ['AVAILABLE', 'STORED', 'PARTIALLY_REPROCESSED'].includes(lot.status) && lot.availableQuantity > 0;

                    const isJobWork = lot.batch?.batchType === 'JOB_WORK' || !!lot.batch?.customer;

                    return (
                      <tr key={lot.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono font-bold text-red-600 dark:text-red-400">{lot.lotNumber}</td>
                        <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">
                          {lot.product.name}
                          {isJobWork && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 rounded font-bold">
                              Job Work
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">
                          {lot.batch.batchNumber}
                          {lot.batch?.customer && (
                            <div className="text-[11px] text-purple-600 dark:text-purple-400 font-sans">
                              {lot.batch.customer.name}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {lot.quantity} {lot.unit}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {lot.availableQuantity} {lot.unit}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-400">
                          {lot.disposedQuantity || 0} {lot.unit}
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{lot.rejectionReason || t('qualityFailure')}</td>
                        <td className="px-3 py-3 text-slate-500">{lot.godown?.name || t('rejectionHolding')}</td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase',
                              lot.status === 'AVAILABLE' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
                              lot.status === 'PARTIALLY_REPROCESSED' && 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
                              lot.status === 'FULLY_REPROCESSED' && 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
                              lot.status === 'DISPOSED' && 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
                              lot.status === 'BLOCKED' && 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                            )}
                          >
                            {lot.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isActionable && (
                              <button
                                onClick={() => handleOpenReturn(lot)}
                                title={t('tooltipReturn')}
                                className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-300 transition-colors text-xs font-bold flex items-center gap-1"
                              >
                                <Undo2 size={14} /> {t('btnReturn')}
                              </button>
                            )}
                            {isActionable && (
                              <button
                                onClick={() => handleOpenReprocess(lot)}
                                title={t('tooltipReprocess')}
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 transition-colors text-xs font-bold flex items-center gap-1"
                              >
                                <Recycle size={14} /> {t('btnReprocess')}
                              </button>
                            )}
                            {isActionable && (
                              <button
                                onClick={() => handleOpenDispose(lot)}
                                title={t('tooltipDispose')}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors text-xs font-medium flex items-center gap-1"
                              >
                                <Trash2 size={14} /> {t('btnDispose')}
                              </button>
                            )}
                            <button
                              onClick={() => setTraceLotId(lot.id)}
                              title={t('tooltipTrace')}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                {t('pageInfo', { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Return History Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              {t('returnHistoryTitle')}
            </h3>
          </div>

          {isReturnsLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : returnHistory.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
              <Undo2 size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
              <p className="mt-3 text-sm text-slate-500">{t('noReturnsFound')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-bold">{t('colGatePass')}</th>
                    <th className="px-3 py-3 font-bold">{t('colDate')}</th>
                    <th className="px-3 py-3 font-bold">{t('colReturnType')}</th>
                    <th className="px-3 py-3 font-bold">{t('colParty')}</th>
                    <th className="px-3 py-3 font-bold">{t('colProductLot')}</th>
                    <th className="px-3 py-3 font-bold text-right">{t('colReturnQty')}</th>
                    <th className="px-3 py-3 font-bold">{t('colTransport')}</th>
                    <th className="px-3 py-3 font-bold">{t('colRemarks')}</th>
                    <th className="px-4 py-3 font-bold text-right">{t('colGatePassPdf')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {returnHistory.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {ret.gatePassNo}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {new Date(ret.returnedAt).toLocaleDateString(currentLocale === 'mr' ? 'mr-IN' : currentLocale === 'hi' ? 'hi-IN' : 'en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase',
                            ret.returnType === 'JOB_WORK_RETURN'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                          )}
                        >
                          {ret.returnType === 'JOB_WORK_RETURN' ? t('typeJobWorkReturn') : t('typeSupplierReturn')}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">
                        {ret.partyName}
                        {ret.partyPhone && <div className="text-[11px] text-slate-400">{ret.partyPhone}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{ret.productName}</div>
                        <div className="text-xs font-mono text-slate-400">{t('lotLabel', { lotNumber: ret.lotNumber })}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {ret.returnQuantity} {ret.unit}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                        <div className="font-semibold">{ret.transporterName || t('directTransport')}</div>
                        {ret.vehicleNumber && <div className="font-mono text-slate-400">{ret.vehicleNumber}</div>}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 max-w-xs truncate">
                        {ret.reason || ret.remarks || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDownloadGatePassPdf(ret)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-300 rounded-lg text-xs font-bold flex items-center gap-1.5 ml-auto transition-colors shadow-sm"
                        >
                          <Download size={13} /> {t('colGatePassPdf')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Return to Supplier / Farmer Modal */}
      {returnLot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setReturnLot(null);
                setLastGeneratedGatePass(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Undo2 className="text-blue-600" size={20} /> {t('modalReturnTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              {t('modalReturnSubtitle', { lot: returnLot.lotNumber, prod: returnLot.product.name, qty: returnLot.availableQuantity, unit: returnLot.unit })}
            </p>

            {lastGeneratedGatePass ? (
              <div className="mt-4 p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-center space-y-3">
                <CheckCircle2 size={36} className="text-emerald-600 dark:text-emerald-400 mx-auto" />
                <h3 className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                  {t('gatePassSuccessTitle')}
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {t('gatePassSuccessDesc', { gp: lastGeneratedGatePass.gatePassNo, qty: lastGeneratedGatePass.returnQuantity, unit: lastGeneratedGatePass.unit, party: lastGeneratedGatePass.partyName })}
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    onClick={() => handleDownloadGatePassPdf(lastGeneratedGatePass)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md"
                  >
                    <Download size={15} /> {t('downloadPdf')}
                  </button>
                  <button
                    onClick={() => {
                      setReturnLot(null);
                      setLastGeneratedGatePass(null);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-bold"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReturnSubmit} className="mt-4 space-y-3.5 text-xs">
                {/* Return Type Selector */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('returnTypeLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReturnType('SUPPLIER_RETURN');
                        setSelectedPartyId('');
                      }}
                      className={cn(
                        'p-2.5 rounded-xl border text-xs font-bold text-center transition-all',
                        returnType === 'SUPPLIER_RETURN'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {t('optSupplier')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReturnType('JOB_WORK_RETURN');
                        setSelectedPartyId('');
                      }}
                      className={cn(
                        'p-2.5 rounded-xl border text-xs font-bold text-center transition-all',
                        returnType === 'JOB_WORK_RETURN'
                          ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {t('optJobWork')}
                    </button>
                  </div>
                </div>

                {/* Party Selection / Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {returnType === 'SUPPLIER_RETURN' ? t('selectPartyLabelSupplier') : t('selectPartyLabelCustomer')}
                    </label>
                    <select
                      value={selectedPartyId}
                      onChange={(e) => handlePartySelect(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium"
                    >
                      <option value="">{t('selectPartyPlaceholder')}</option>
                      {returnType === 'SUPPLIER_RETURN'
                        ? suppliers.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.mobile ? `(${s.mobile})` : ''}
                            </option>
                          ))
                        : customers.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.mobile ? `(${c.mobile})` : ''}
                            </option>
                          ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('partyNameLabel')}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={t('partyNamePlaceholder')}
                      value={partyName}
                      onChange={(e) => setPartyName(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('mobileLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('mobilePlaceholder')}
                      value={partyPhone}
                      onChange={(e) => setPartyPhone(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('returnQtyLabel', { unit: returnLot.unit, max: returnLot.availableQuantity })}
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      max={returnLot.availableQuantity}
                      required
                      value={returnQty}
                      onChange={(e) => setReturnQty(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Transport & Vehicle Details */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                    <Truck size={14} className="text-amber-500" /> {t('transportSectionTitle')}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">{t('transporterNameLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('transporterPlaceholder')}
                        value={transporterName}
                        onChange={(e) => setTransporterName(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">{t('vehicleNoLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('vehiclePlaceholder')}
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">{t('driverNameLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('driverPlaceholder')}
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">{t('driverMobileLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('driverMobilePlaceholder')}
                        value={driverPhone}
                        onChange={(e) => setDriverPhone(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Reason & Remarks */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('returnReasonLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('returnReasonPlaceholder')}
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">{t('remarksLabel')}</label>
                  <input
                    type="text"
                    placeholder={t('remarksPlaceholder')}
                    value={returnRemarks}
                    onChange={(e) => setReturnRemarks(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                  />
                </div>

                {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setReturnLot(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2 shadow-md"
                  >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} {t('btnSubmitReturn')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reprocess Modal */}
      {reprocessLot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setReprocessLot(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Recycle className="text-emerald-500" size={20} /> {t('modalReprocessTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">{t('reprocessLotSubtitle', { lot: reprocessLot.lotNumber, product: reprocessLot.product.name })}</p>

            <form onSubmit={handleReprocessSubmit} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex justify-between text-xs font-mono">
                <span>{t('availableStockLabel')}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {reprocessLot.availableQuantity} {reprocessLot.unit}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('reprocessQtyLabel', { unit: reprocessLot.unit })}
                </label>
                <input
                  type="number"
                  step="0.001"
                  max={reprocessLot.availableQuantity}
                  required
                  value={reprocessQty}
                  onChange={(e) => setReprocessQty(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {workflows.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('workflowLabel')}
                  </label>
                  <select
                    value={workflowVersionId}
                    onChange={(e) => setWorkflowVersionId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm font-medium"
                  >
                    <option value="">{t('defaultWorkflow')}</option>
                    {workflows.map((w: any) => (
                      <option key={w.id} value={w.activeVersionId || w.versions?.[0]?.id || ''}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('reprocessNotesLabel')}</label>
                <input
                  type="text"
                  placeholder={t('reprocessNotesPlaceholder')}
                  value={reprocessNotes}
                  onChange={(e) => setReprocessNotes(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}
              {successMsg && <p className="text-xs text-emerald-500 font-bold">{successMsg}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReprocessLot(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Recycle size={14} />} {t('btnSubmitReprocess')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispose Modal */}
      {disposeLot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setDisposeLot(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="text-red-500" size={20} /> {t('modalDisposeTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">{t('disposeLotSubtitle', { lot: disposeLot.lotNumber })}</p>

            <form onSubmit={handleDisposeSubmit} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex justify-between text-xs font-mono">
                <span>{t('availableStockLabel')}</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {disposeLot.availableQuantity} {disposeLot.unit}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('disposeQtyLabel', { unit: disposeLot.unit })}
                </label>
                <input
                  type="number"
                  step="0.001"
                  max={disposeLot.availableQuantity}
                  required
                  value={disposeQty}
                  onChange={(e) => setDisposeQty(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('disposeReasonLabel')}</label>
                <input
                  type="text"
                  placeholder={t('disposeReasonPlaceholder')}
                  required
                  value={disposeReason}
                  onChange={(e) => setDisposeReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}
              {successMsg && <p className="text-xs text-emerald-500 font-bold">{successMsg}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisposeLot(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t('btnSubmitDispose')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Traceability Modal */}
      {quickLot && (
        <QuickProductionForm initialSource={{ type: 'rejection', id: quickLot.id }} onClose={() => setQuickLot(null)} onSaved={() => { mutate(); }} />
      )}

      {traceLotId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setTraceLotId(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Eye className="text-blue-500" size={20} /> {t('modalTraceTitle')}
            </h2>

            {isTraceLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="animate-spin mx-auto text-slate-400" size={24} />
              </div>
            ) : traceData ? (
              <div className="mt-4 space-y-4 text-xs">
                {/* Origin Details */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <h3 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                    {t('originSectionTitle')}
                  </h3>
                  <p>{t('originBatchLabel')} <span className="font-mono font-bold text-slate-900 dark:text-white">{traceData.origin?.batchNumber}</span></p>
                  <p>{t('originStageLabel')} <span className="font-semibold">{traceData.origin?.sourceStageName}</span></p>
                  <p>{t('originReasonLabel')} <span className="text-red-600 dark:text-red-400 font-semibold">{traceData.rejectionLot?.rejectionReason}</span></p>
                </div>

                {/* Reprocessing Batches History */}
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                    {t('reprocessingBatchesTitle', { count: traceData.reprocessingBatches?.length || 0 })}
                  </h3>
                  {traceData.reprocessingBatches && traceData.reprocessingBatches.length > 0 ? (
                    <div className="space-y-2">
                      {traceData.reprocessingBatches.map((b: any) => (
                        <div key={b.id} className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
                          <div className="flex justify-between font-bold">
                            <span className="font-mono text-emerald-700 dark:text-emerald-300">{t('reprocessingBatchNo', { batchNumber: b.batchNumber })}</span>
                            <span>{t('inputKg')} {b.inputKg} kg</span>
                          </div>
                          <p className="text-slate-500 mt-1">{t('batchStatus')} <span className="uppercase text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">{b.status}</span></p>
                          {(b.status === 'in_progress' || b.status === 'open') && (
                            <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                              <p className="text-[11px] text-amber-800 dark:text-amber-300">{t('reprocessInProgressWarning', { inputKg: b.inputKg })}</p>
                              <button type="button" disabled={cancellingBatch === b.id}
                                onClick={async () => {
                                  setCancellingBatch(b.id);
                                  try { await api.delete(`/mill/batches/${b.id}`); await mutate(); await mutateTrace(); }
                                  catch (e: any) { alert(e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Could not cancel'); }
                                  finally { setCancellingBatch(null); }
                                }}
                                className="mt-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50">
                                {cancellingBatch === b.id ? t('cancellingBatch') : t('cancelBatch')}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">{t('noReprocessingBatches')}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

