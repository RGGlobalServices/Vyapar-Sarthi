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
import { mapColumns, refineWithArithmetic, inferRateByArithmetic, ValueProfile } from './importFieldMapper';

export interface ImportColumn {
  label: string;      // canonical header shown in the preview and sent to the server
  aliases: string[];  // other header spellings to pull the value from
  numeric?: boolean;
  /**
   * What this column's DATA should look like. Aliases can only recognise
   * headers we thought of; the profile lets the mapper identify a column from
   * its values, which is what makes an unfamiliar supplier's bill work — and
   * what stops a "GST" column holding the tax amount from being read as a rate.
   */
  profile?: ValueProfile;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function productColumns(businessType?: string): ImportColumn[] {
  const cfg = getBusinessConfig((businessType || 'general') as BusinessType);
  const cols: ImportColumn[] = [
    { label: 'Product Name', aliases: ['name', 'description', 'item', 'productname', 'itemname', 'particulars', 'goods'], profile: 'name' },
    { label: 'Barcode', aliases: ['companybarcode', 'itembarcode', 'ean', 'upc'], profile: 'barcode' },
    { label: 'SKU', aliases: ['skucode', 'itemcode', 'stockcode', 'code', 'articleno', 'articlecode'], profile: 'text' },
    { label: 'Carton Barcode', aliases: ['cartoncode', 'cartonbarcode', 'boxbarcode', 'outerbarcode', 'casebarcode'], profile: 'barcode' },
    { label: 'Category', aliases: ['group', 'type'], profile: 'text' },
    { label: 'Unit', aliases: ['uom', 'packing'], profile: 'unit' },
    { label: 'Quantity', aliases: ['stock', 'qty', 'openingstock', 'nos', 'pcs', 'units'], numeric: true, profile: 'quantity' },
    { label: 'MRP', aliases: ['maxretailprice', 'listprice'], numeric: true, profile: 'price' },
    { label: 'Selling Price', aliases: ['price', 'rate', 'sellingprice', 'sellprice', 'saleprice', 'priceperunit', 'unitprice'], numeric: true, profile: 'price' },
    { label: 'Cost Price', aliases: ['wholesalecost', 'cost', 'purchaseprice', 'costprice', 'unitcost', 'purchaserate', 'buyingprice'], numeric: true, profile: 'price' },
    { label: 'Min Stock', aliases: ['minlevel', 'minstock', 'reorderlevel'], numeric: true, profile: 'quantity' },
    { label: 'HSN Code', aliases: ['hsn', 'sac', 'hsncode', 'hsnsac'], profile: 'hsn' },
    { label: 'GST %', aliases: ['gstpercent', 'gstpercentage', 'gstrate', 'taxrate', 'gstpct', 'taxpercent', 'gst'], numeric: true, profile: 'gstRate' },
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
        { label: 'Product Name', aliases: ['name', 'description', 'item', 'productname', 'itemname', 'particulars', 'goods'], profile: 'name' },
        { label: 'Barcode', aliases: ['companybarcode', 'itembarcode', 'ean', 'upc'], profile: 'barcode' },
        { label: 'SKU', aliases: ['skucode', 'itemcode', 'stockcode', 'code', 'articleno', 'articlecode'], profile: 'text' },
        { label: 'Carton Barcode', aliases: ['cartoncode', 'cartonbarcode', 'boxbarcode', 'outerbarcode', 'casebarcode'], profile: 'barcode' },
        { label: 'Category', aliases: ['group', 'type'], profile: 'text' },
        { label: 'Unit', aliases: ['uom', 'packing'], profile: 'unit' },
        { label: 'Quantity', aliases: ['qty', 'stock', 'nos', 'pcs', 'units'], numeric: true, profile: 'quantity' },
        { label: 'Unit Cost', aliases: ['cost', 'wholesalecost', 'price', 'rate', 'unitcost', 'priceperunit', 'unitprice', 'purchaserate'], numeric: true, profile: 'price' },
        { label: 'HSN Code', aliases: ['hsn', 'sac', 'hsncode', 'hsnsac'], profile: 'hsn' },
        { label: 'GST %', aliases: ['gstpercent', 'gstpercentage', 'gstrate', 'taxrate', 'gstpct', 'taxpercent', 'gst'], numeric: true, profile: 'gstRate' },
        { label: 'Supplier', aliases: ['vendor', 'vendorname', 'suppliername'], profile: 'name' },
        { label: 'Invoice Number', aliases: ['billnumber', 'invoice', 'invoiceno'], profile: 'text' },
        { label: 'Date', aliases: ['billdate', 'invoicedate'], profile: 'date' },
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
  // Score every (field, column) pair on header name AND data shape, then take
  // the best consistent assignment. This is what lets an unfamiliar supplier's
  // bill map correctly without us having pre-registered its header spellings.
  let { assignment } = mapColumns(template, fileHeaders, rawRows);

  // Quantity is the field a mis-map corrupts silently, so verify it against the
  // line arithmetic (amount ≈ quantity × rate) and swap in a better column when
  // the numbers disagree.
  const qtyLabel = template.find(c => c.label === 'Quantity')?.label;
  const rateLabel = template.find(c => c.label === 'Unit Cost' || c.label === 'Selling Price')?.label;

  // A rate column with an unfamiliar name ("Dar", "Bhav") is invisible to both
  // the alias list and the value profile — three fields all look like money.
  // The line arithmetic identifies it regardless of its header.
  if (qtyLabel && rateLabel) {
    assignment = inferRateByArithmetic(assignment, fileHeaders, rawRows, qtyLabel, rateLabel);
  }

  if (qtyLabel && rateLabel) {
    const amountHeader = fileHeaders.find(h =>
      ['amount', 'total', 'lineamount', 'netamount', 'value'].includes(norm(h)),
    );
    if (amountHeader) {
      assignment = refineWithArithmetic(
        { ...assignment, __amount: amountHeader },
        fileHeaders,
        rawRows,
        { quantity: qtyLabel, rate: rateLabel, amount: '__amount' },
      );
      delete (assignment as any).__amount;
    }
  }

  const sources = template.map(col => ({ col, src: assignment[col.label] ?? null }));
  const consumed = new Set<string>(sources.map(s => s.src).filter(Boolean) as string[]);

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
