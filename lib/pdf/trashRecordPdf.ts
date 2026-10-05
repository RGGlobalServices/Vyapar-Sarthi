import { PDF_LAYOUT, renderProfessionalHeader, renderProfessionalFooter, renderSectionTitle, embedDevanagariFont, ensureRoom, type ShopHeader } from './professionalTemplate';

/**
 * Recycle Bin -> Download: a deleted record as a plain-language PDF for the shopkeeper, in the
 * language the app is set to (en / hi / mr). Shows the item's own details with readable labels
 * (no internal ids, no technical field names), skips empty fields, and puts each list inside the
 * record (batches, bills, ...) in its own table.
 */

export type TrashPdfLocale = 'en' | 'hi' | 'mr';

type Row = [string, string];
type Table = { title: string; records: Record<string, unknown>[] };

// Fields a shopkeeper never needs on a printed record.
const HIDE_KEY = /^(id|shopId|shop_id|entityType|entity_type|entityId|entity_id|restoredAt|restored_at|restoredBy|.*Id|.*_id)$/;

type Dict = {
  itemDetails: string;
  noDetails: string;
  deletedOn: string;
  footer: string;
  yes: string;
  no: string;
  fields: Record<string, string>;
};

const DICT: Record<TrashPdfLocale, Dict> = {
  en: {
    itemDetails: 'Item Details',
    noDetails: 'No details saved',
    deletedOn: 'Deleted On',
    footer: 'This record was deleted from the app and kept in the Recycle Bin.',
    yes: 'Yes',
    no: 'No',
    fields: {
      name: 'Name', label: 'Name', mrp: 'MRP', hsnCode: 'HSN code', gst: 'GST', gstin: 'GSTIN', pan: 'PAN',
      sku: 'SKU code', barcode: 'Barcode', sellingPrice: 'Selling price', purchasePrice: 'Purchase price',
      costPrice: 'Cost price', currentStock: 'Current stock', baseUnit: 'Unit', unit: 'Unit', mobile: 'Mobile',
      address: 'Address', deletedAt: 'Deleted on', deletedBy: 'Deleted by', createdAt: 'Created on',
      updatedAt: 'Last updated on', creditLimit: 'Credit limit', creditDays: 'Credit days',
      openingBalance: 'Opening balance', totalAmount: 'Total amount', amountPaid: 'Amount paid',
      invoiceNumber: 'Invoice no.', invoiceDate: 'Invoice date', supplierName: 'Supplier',
      customerName: 'Customer', notes: 'Notes', category: 'Category', description: 'Description',
      email: 'Email', status: 'Status',
      archived: 'Archived', isLoose: 'Loose item', productType: 'Product type', isActive: 'Active',
    },
  },
  hi: {
    itemDetails: 'आइटम का विवरण',
    noDetails: 'कोई विवरण सहेजा नहीं गया',
    deletedOn: 'हटाने की तिथि',
    footer: 'यह रिकॉर्ड ऐप से हटाया गया था और रीसायकल बिन में सुरक्षित है।',
    yes: 'हाँ',
    no: 'नहीं',
    fields: {
      name: 'नाम', label: 'नाम', mrp: 'MRP', hsnCode: 'HSN कोड', gst: 'GST', gstin: 'GSTIN', pan: 'PAN',
      sku: 'SKU कोड', barcode: 'बारकोड', sellingPrice: 'बिक्री मूल्य', purchasePrice: 'खरीद मूल्य',
      costPrice: 'लागत मूल्य', currentStock: 'वर्तमान स्टॉक', baseUnit: 'इकाई', unit: 'इकाई', mobile: 'मोबाइल',
      address: 'पता', deletedAt: 'हटाने की तिथि', deletedBy: 'हटाने वाला', createdAt: 'बनाने की तिथि',
      updatedAt: 'अंतिम अपडेट', creditLimit: 'क्रेडिट सीमा', creditDays: 'क्रेडिट दिन',
      openingBalance: 'प्रारंभिक शेष', totalAmount: 'कुल राशि', amountPaid: 'भुगतान राशि',
      invoiceNumber: 'बिल नंबर', invoiceDate: 'बिल तिथि', supplierName: 'आपूर्तिकर्ता',
      customerName: 'ग्राहक', notes: 'नोट्स', category: 'श्रेणी', description: 'विवरण',
      email: 'ईमेल', status: 'स्थिति',
      archived: 'संग्रहीत', isLoose: 'खुला माल (Loose)', productType: 'उत्पाद प्रकार', isActive: 'सक्रिय',
    },
  },
  mr: {
    itemDetails: 'वस्तूचा तपशील',
    noDetails: 'कोणताही तपशील जतन केलेला नाही',
    deletedOn: 'हटवल्याची तारीख',
    footer: 'हा रेकॉर्ड अॅपमधून हटवला गेला असून रीसायकल बिनमध्ये जतन आहे.',
    yes: 'होय',
    no: 'नाही',
    fields: {
      name: 'नाव', label: 'नाव', mrp: 'MRP', hsnCode: 'HSN कोड', gst: 'GST', gstin: 'GSTIN', pan: 'PAN',
      sku: 'SKU कोड', barcode: 'बारकोड', sellingPrice: 'विक्री किंमत', purchasePrice: 'खरेदी किंमत',
      costPrice: 'खर्च किंमत', currentStock: 'सध्याचा साठा', baseUnit: 'एकक', unit: 'एकक', mobile: 'मोबाईल',
      address: 'पत्ता', deletedAt: 'हटवल्याची तारीख', deletedBy: 'हटवणारा', createdAt: 'तयार केल्याची तारीख',
      updatedAt: 'शेवटचे अपडेट', creditLimit: 'उधारी मर्यादा', creditDays: 'उधारीचे दिवस',
      openingBalance: 'सुरुवातीची शिल्लक', totalAmount: 'एकूण रक्कम', amountPaid: 'दिलेली रक्कम',
      invoiceNumber: 'बिल क्रमांक', invoiceDate: 'बिल तारीख', supplierName: 'पुरवठादार',
      customerName: 'ग्राहक', notes: 'नोंदी', category: 'वर्ग', description: 'वर्णन',
      email: 'ईमेल', status: 'स्थिती',
      archived: 'संग्रहित', isLoose: 'सुटा माल (Loose)', productType: 'उत्पादन प्रकार', isActive: 'सक्रिय',
    },
  },
};

const humanizeEn = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const fmtDateTime = (v: string | Date | null | undefined): string => {
  if (!v) return '-';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function makeFormatters(dict: Dict) {
  const humanize = (key: string) => dict.fields[key] ?? humanizeEn(key);

  function fmtValue(v: unknown): string {
    if (isEmpty(v)) return '-';
    if (typeof v === 'boolean') return v ? dict.yes : dict.no;
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? fmtDateTime(v) : v;
    if (Array.isArray(v)) return v.map(fmtValue).join(', ');
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .filter(([k, x]) => !HIDE_KEY.test(k) && !isEmpty(x))
        .map(([k, x]) => `${humanize(k)}: ${fmtValue(x)}`)
        .join(', ');
    }
    return String(v);
  }

  return { humanize, fmtValue };
}

/**
 * Splits the record into plain rows (empty fields skipped) and lists of records (tables).
 * The app wraps the saved item in a `data` object, so its fields are read as the item's own.
 */
function collect(obj: Record<string, unknown>, prefix: string, rows: Row[], tables: Table[], humanize: (k: string) => string, fmtValue: (v: unknown) => string) {
  for (const [key, val] of Object.entries(obj)) {
    if (HIDE_KEY.test(key) || isEmpty(val)) continue;
    // `label` is the same record name as `name` - show it once.
    if (key === 'label' && !isEmpty(obj.name)) continue;
    if (key === 'data' && val && typeof val === 'object' && !Array.isArray(val) && !prefix) {
      collect(val as Record<string, unknown>, '', rows, tables, humanize, fmtValue);
      continue;
    }
    const label = prefix ? `${prefix} - ${humanize(key)}` : humanize(key);
    if (Array.isArray(val) && val.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      tables.push({ title: label, records: val as Record<string, unknown>[] });
    } else if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      collect(val as Record<string, unknown>, label, rows, tables, humanize, fmtValue);
    } else {
      rows.push([label, fmtValue(val)]);
    }
  }
}

function columnsOf(records: Record<string, unknown>[]): string[] {
  const seen: string[] = [];
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (HIDE_KEY.test(k) || seen.includes(k) || isEmpty(v)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) continue;
      seen.push(k);
    }
  }
  return seen.slice(0, 8);
}

export async function generateTrashRecordPDF({
  shop,
  title,
  deletedAt,
  data,
  filename,
  locale = 'en',
}: {
  shop: ShopHeader;
  title: string;
  deletedAt: string;
  data: unknown;
  filename: string;
  locale?: TrashPdfLocale;
}) {
  const [{ default: jsPDF }, { default: autoTable }, { saveOrShareBlob }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/lib/nativeSave'),
  ]);

  const dict = DICT[locale] ?? DICT.en;
  const { humanize, fmtValue } = makeFormatters(dict);

  const doc = new jsPDF({ orientation: 'portrait' }) as any;
  await embedDevanagariFont(doc);

  let y = renderProfessionalHeader(doc, shop, title, fmtDateTime(deletedAt), { periodLabel: dict.deletedOn });

  const rows: Row[] = [];
  const tables: Table[] = [];
  collect((data && typeof data === 'object' ? data : {}) as Record<string, unknown>, '', rows, tables, humanize, fmtValue);

  const tableStyles = {
    font: 'NotoDevanagari',
    fontSize: 9,
    cellPadding: 2.5,
    textColor: PDF_LAYOUT.ink as any,
    lineColor: PDF_LAYOUT.divider as any,
    lineWidth: 0.15,
  };
  const headStyles = { fillColor: PDF_LAYOUT.accent as any, textColor: [255, 255, 255] as any, fontStyle: 'bold' as const, fontSize: 9 };
  const margin = { left: PDF_LAYOUT.marginX, right: PDF_LAYOUT.marginX };

  y = ensureRoom(doc, y, 20);
  y = renderSectionTitle(doc, y, dict.itemDetails);
  autoTable(doc, {
    startY: y,
    head: [[dict.itemDetails, '']],
    body: rows.length ? rows : [['-', dict.noDetails]],
    theme: 'grid',
    styles: tableStyles,
    headStyles,
    columnStyles: { 0: { cellWidth: 65, fontStyle: 'bold' as const } },
    margin,
    rowPageBreak: 'avoid',
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  for (const t of tables) {
    const cols = columnsOf(t.records);
    if (cols.length === 0) continue;
    y = ensureRoom(doc, y, 20);
    y = renderSectionTitle(doc, y, `${t.title} (${t.records.length})`);
    autoTable(doc, {
      startY: y,
      head: [cols.map(humanize)],
      body: t.records.map((r) => cols.map((c) => fmtValue(r[c]))),
      theme: 'grid',
      styles: tableStyles,
      headStyles,
      margin,
      rowPageBreak: 'avoid',
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  renderProfessionalFooter(doc, dict.footer);

  const name = `${filename}.pdf`;
  const blob: Blob = doc.output('blob');
  if (await saveOrShareBlob(blob, name)) return;
  doc.save(name);
}
