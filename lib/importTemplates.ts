// Canonical column templates for the Import wizard.
//
// The point: when a shopkeeper uploads a file that only has (say) a Name
// column, the preview should still show empty, editable Quantity / Price /
// Category / … columns so they can fill in what's missing before importing —
// instead of silently importing name-only rows. Each column's `label` is chosen
// so the execute route's alias-based lookup recognises it, and `aliases` lets us
// pull an existing file column (e.g. "Rate") into the canonical column
// ("Selling Price") rather than showing two competing columns.

import { getBusinessConfig, BusinessType } from './businessConfig';

export interface ImportColumn {
  label: string;      // canonical header shown in the preview and sent to the server
  aliases: string[];  // other header spellings to pull the value from
  numeric?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function productColumns(businessType?: string): ImportColumn[] {
  const cfg = getBusinessConfig((businessType || 'general') as BusinessType);
  const cols: ImportColumn[] = [
    { label: 'Product Name', aliases: ['name', 'description', 'item', 'productname'] },
    { label: 'Barcode', aliases: ['sku'] },
    { label: 'Category', aliases: [] },
    { label: 'Unit', aliases: [] },
    { label: 'Quantity', aliases: ['stock', 'qty', 'openingstock'], numeric: true },
    { label: 'MRP', aliases: [], numeric: true },
    { label: 'Selling Price', aliases: ['price', 'rate'], numeric: true },
    { label: 'Cost Price', aliases: ['wholesalecost', 'cost', 'purchaseprice'], numeric: true },
    { label: 'Min Stock', aliases: ['minlevel', 'minstock'], numeric: true },
    { label: 'HSN Code', aliases: ['hsn', 'sac'] },
    { label: 'GST %', aliases: ['gstpercent', 'gstrate', 'taxrate'], numeric: true },
  ];
  // Business-type extras — only the ones that shop actually captures.
  if (cfg.hasExpiry) cols.push({ label: 'Expiry Date', aliases: ['expiry'] });
  if (cfg.hasBatch) cols.push({ label: 'Batch Number', aliases: ['batch'] });
  if (cfg.hasDrugSchedule) cols.push({ label: 'Drug Schedule', aliases: ['schedule'] });
  if (cfg.hasModel) cols.push({ label: 'Model Number', aliases: ['model'] });
  if (cfg.hasWarranty) cols.push({ label: 'Warranty Months', aliases: ['warranty'], numeric: true });
  if (cfg.hasGender) cols.push({ label: 'Gender', aliases: [] });
  if (cfg.hasShades) cols.push({ label: 'Shade', aliases: ['color', 'colour'] });
  return cols;
}

export function getImportTemplate(importType: string, businessType?: string): ImportColumn[] {
  switch (importType) {
    case 'product':
    case 'stock':
      return productColumns(businessType);
    case 'purchase':
      return [
        { label: 'Product Name', aliases: ['name', 'description', 'item', 'productname'] },
        { label: 'Barcode', aliases: ['sku'] },
        { label: 'Category', aliases: [] },
        { label: 'Unit', aliases: [] },
        { label: 'Quantity', aliases: ['qty', 'stock'], numeric: true },
        { label: 'Unit Cost', aliases: ['cost', 'wholesalecost', 'price', 'rate'], numeric: true },
        { label: 'GST %', aliases: ['gst', 'gstpercent', 'taxrate'], numeric: true },
        { label: 'Supplier', aliases: ['vendor', 'vendorname', 'suppliername'] },
        { label: 'Invoice Number', aliases: ['billnumber', 'invoice'] },
        { label: 'Date', aliases: ['billdate', 'invoicedate'] },
      ];
    case 'customers':
      return [
        { label: 'Customer Name', aliases: ['name', 'customer', 'client', 'partyname', 'party'] },
        { label: 'Mobile', aliases: ['phone'] },
        { label: 'Email', aliases: [] },
        { label: 'Opening Balance', aliases: ['balance', 'openingudhar', 'udhar'], numeric: true },
        { label: 'GST', aliases: ['gstin', 'gstnumber'] },
        { label: 'Address', aliases: [] },
        { label: 'Credit Limit', aliases: [], numeric: true },
        { label: 'Credit Days', aliases: [], numeric: true },
        { label: 'Notes', aliases: [] },
      ];
    case 'ledger':
      return [
        { label: 'Party Name', aliases: ['name', 'customername', 'suppliername', 'party'] },
        { label: 'Type', aliases: ['partytype'] },
        { label: 'Mobile', aliases: ['phone'] },
        { label: 'Opening Balance', aliases: ['balance', 'amount'], numeric: true },
      ];
    case 'suppliers':
      return [
        { label: 'Supplier Name', aliases: ['name', 'supplier', 'vendor', 'partyname', 'party'] },
        { label: 'Mobile', aliases: ['phone'] },
        { label: 'Contact', aliases: [] },
        { label: 'GST', aliases: [] },
        { label: 'Opening Balance', aliases: ['balance'], numeric: true },
      ];
    case 'sales':
      return [
        { label: 'Product Name', aliases: ['name', 'description', 'item', 'productname', 'product'] },
        { label: 'Barcode', aliases: ['sku'] },
        { label: 'Quantity', aliases: ['qty'], numeric: true },
        { label: 'Selling Price', aliases: ['price', 'rate', 'unitprice'], numeric: true },
        { label: 'Customer Name', aliases: ['customer', 'partyname', 'party'] },
        { label: 'Mobile', aliases: ['phone', 'customermobile'] },
        { label: 'Invoice Number', aliases: ['billnumber', 'invoice', 'invoicenumber', 'invoiceno', 'inv', 'number'] },
        { label: 'Date', aliases: ['billdate', 'saledate', 'date'] },
        { label: 'Payment Type', aliases: ['paymentmode', 'mode', 'payment', 'paymenttype'] },
      ];
    default:
      return [];
  }
}

/**
 * Reshape raw parsed rows into the canonical template: each template column is
 * filled from the file (by label or alias), extra file columns are preserved,
 * and template columns the file didn't have appear as empty (fillable) cells.
 * Returns the reshaped rows and the ordered header list for the preview.
 */
export function applyTemplate(
  rawRows: any[],
  fileHeaders: string[],
  template: ImportColumn[],
): { rows: any[]; headers: string[] } {
  if (template.length === 0) return { rows: rawRows, headers: fileHeaders };

  // Which file headers get consumed by a template column (so we don't also show
  // them again as "extra" columns).
  const consumed = new Set<string>();
  const colSourceFor = (col: ImportColumn): string | null => {
    const wanted = [norm(col.label), ...col.aliases.map(norm)];
    for (const h of fileHeaders) {
      if (wanted.includes(norm(h))) return h;
    }
    return null;
  };
  const sources = template.map(col => ({ col, src: colSourceFor(col) }));
  sources.forEach(s => { if (s.src) consumed.add(s.src); });

  const extraHeaders = fileHeaders.filter(h => !consumed.has(h));
  const headers = [...template.map(c => c.label), ...extraHeaders];

  const rows = rawRows.map(raw => {
    const out: any = {};
    for (const { col, src } of sources) {
      out[col.label] = src != null && raw[src] != null ? raw[src] : '';
    }
    for (const h of extraHeaders) out[h] = raw[h] ?? '';
    return out;
  });

  return { rows, headers };
}
