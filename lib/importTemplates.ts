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
    { label: 'Other Code', aliases: ['othercode', 'refcode', 'referencecode', 'altcode', 'alternatecode'], profile: 'text' },
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
  // Variant columns — footwear/apparel supplier bills routinely have Colour
  // and Size columns; without these template entries the review UI drops
  // them into "extra headers" and the processor never sees them, so per-
  // variant stock never gets created. The Size field also accepts range
  // shorthand like "6*8" — the processor expands it into per-size rows.
  if (cfg.hasColors) cols.push({ label: 'Colour', aliases: ['color', 'colour', 'shade'], profile: 'text' });
  if (cfg.hasSizes) cols.push({ label: 'Size', aliases: ['size', 'sz', 'sizes', 'sizerange', 'no', 'number'], profile: 'text' });
  // Liquor's variant dimension — a wholesaler's bill carries Volume (90ml,
  // 650ml, …) and Bottle Type (Bottle/Can/Pint) per line instead of
  // Colour/Size. Without these template entries the AI-extracted volume/
  // bottleType fields (see wholesale-import/analyze's liquor prompt) fall
  // into "extra headers" in the review table — visible nowhere, and the
  // execute route's resolveRowVariant() fallback then has nothing to show
  // the shopkeeper before they confirm the import.
  if (cfg.hasLiquorSpecs) cols.push({ label: 'Volume (ML)', aliases: ['volume', 'volumeml', 'ml'], profile: 'text' });
  if (cfg.hasLiquorSpecs) cols.push({ label: 'Bottle Type', aliases: ['bottletype', 'packaging', 'container', 'pack'], profile: 'text' });
  return cols;
}

// Extra Product-catalogue fields that exist on the real Product record but
// aren't part of the default review columns above (they'd clutter every
// import for shops that never use them). Offered instead via the review
// table's "+ Column" picker, so a shopkeeper whose sheet actually needs
// Brand / Location / mill grading / etc. can add just that column.
// Bill-level charges offered as review columns for mill purchases; totals become the bill's charges (never products/stock).
export const CHARGE_COLUMNS = ['Hamali', 'Freight', 'Loading', 'Unloading', 'Weighment', 'Driver Charges', 'Other Charges'];
// Bill-level weight capture (kanta chitthi) — not a charge, so kept out of CHARGE_COLUMNS; stored directly on the purchase invoice.
export const WEIGHT_COLUMNS = ['Tare Weight', 'Gross Weight'];

export function getAddableColumns(importType: string, isMill = false): ImportColumn[] {
  if (!['product', 'stock', 'purchase'].includes(importType)) return [];
  const chargeCols: ImportColumn[] = isMill && importType === 'purchase' ? CHARGE_COLUMNS.map(label => ({ label, aliases: [label.toLowerCase().replace(/\s+/g, '')], numeric: true, profile: 'price' } as ImportColumn)) : [];
  const weightCols: ImportColumn[] = isMill && importType === 'purchase' ? WEIGHT_COLUMNS.map(label => ({ label, aliases: [label.toLowerCase().replace(/\s+/g, '')], numeric: true, profile: 'quantity' } as ImportColumn)) : [];
  return [
    ...chargeCols,
    ...weightCols,
    // Bada Udyog (mill): classifies the product so purchases of raw material flow into Raw Material lots.
    ...(isMill ? [{ label: 'Mill Category', aliases: ['millcategory', 'millclass', 'materialtype', 'itemclass'], profile: 'text' } as ImportColumn] : []),
    { label: 'Brand', aliases: ['brand', 'make'], profile: 'text' },
    { label: 'Location', aliases: ['location', 'rack', 'shelf', 'bin'], profile: 'text' },
    { label: 'Grade', aliases: ['grade'], profile: 'text' },
    { label: 'Variety', aliases: ['variety'], profile: 'text' },
    { label: 'Subcategory', aliases: ['subcategory', 'subcat'], profile: 'text' },
    { label: 'Pack Size', aliases: ['packsize'], numeric: true, profile: 'quantity' },
    { label: 'Pack Unit', aliases: ['packunit'], profile: 'unit' },
    { label: 'Reorder Level', aliases: ['reorderlevel'], numeric: true, profile: 'quantity' },
  ];
}

export function getImportTemplate(importType: string, businessType?: string): ImportColumn[] {
  switch (importType) {
    case 'product':
    case 'stock':
      return productColumns(businessType);
    case 'purchase': {
      // Purchase-invoice review needs the same variant awareness the
      // stock/product template already has — a footwear supplier bill has
      // Colour and Size columns per row, and without them the review UI
      // drops them into "extra" and the imported PurchaseItems land with
      // no variant, so per-variant stock never gets created. Business-type
      // gate keeps the review compact for shops that don't need it.
      const cfg = getBusinessConfig((businessType || 'general') as BusinessType);
      const cols: ImportColumn[] = [
        { label: 'Product Name', aliases: ['name', 'description', 'item', 'productname', 'itemname', 'particulars', 'goods'], profile: 'name' },
        { label: 'Barcode', aliases: ['companybarcode', 'itembarcode', 'ean', 'upc'], profile: 'barcode' },
        { label: 'SKU', aliases: ['skucode', 'itemcode', 'stockcode', 'code', 'articleno', 'articlecode'], profile: 'text' },
        // Same printable-reference slot as the Products form's Other Code field
        // — the purchase review needs its own column so a supplier bill can carry
        // this identifier through to Products (previously only the product/stock
        // template exposed it, so purchase-invoice imports silently dropped it).
        { label: 'Other Code', aliases: ['othercode', 'refcode', 'referencecode', 'altcode', 'alternatecode'], profile: 'text' },
        { label: 'Carton Barcode', aliases: ['cartoncode', 'cartonbarcode', 'boxbarcode', 'outerbarcode', 'casebarcode'], profile: 'barcode' },
        { label: 'Category', aliases: ['group', 'type'], profile: 'text' },
        { label: 'Unit', aliases: ['uom', 'packing'], profile: 'unit' },
        { label: 'Quantity', aliases: ['qty', 'stock', 'nos', 'pcs', 'units'], numeric: true, profile: 'quantity' },
        { label: 'Unit Cost', aliases: ['cost', 'wholesalecost', 'price', 'rate', 'unitcost', 'priceperunit', 'unitprice', 'purchaserate'], numeric: true, profile: 'price' },
        { label: 'MRP', aliases: ['mrp'], numeric: true, profile: 'price' },
        // Deliberately narrower aliases than productColumns()'s Selling Price —
        // on a purchase bill an unqualified "Price"/"Rate" column means the
        // COST the supplier charged, not the retail price, so those generic
        // words stay claimed by Unit Cost above; only explicit selling-price
        // spellings map here.
        { label: 'Selling Price', aliases: ['sellingprice', 'sellprice', 'saleprice', 'retailprice'], numeric: true, profile: 'price' },
        { label: 'HSN Code', aliases: ['hsn', 'sac', 'hsncode', 'hsnsac'], profile: 'hsn' },
        { label: 'GST %', aliases: ['gstpercent', 'gstpercentage', 'gstrate', 'taxrate', 'gstpct', 'taxpercent', 'gst'], numeric: true, profile: 'gstRate' },
        { label: 'Supplier', aliases: ['vendor', 'vendorname', 'suppliername'], profile: 'name' },
        { label: 'Invoice Number', aliases: ['billnumber', 'invoice', 'invoiceno'], profile: 'text' },
        { label: 'Date', aliases: ['billdate', 'invoicedate'], profile: 'date' },
      ];
      if (cfg.hasColors) cols.push({ label: 'Colour', aliases: ['color', 'colour', 'shade'], profile: 'text' });
      if (cfg.hasSizes) cols.push({ label: 'Size', aliases: ['size', 'sz', 'sizes', 'sizerange', 'no', 'number'], profile: 'text' });
      // Same liquor Volume × Bottle Type fallback as productColumns() above.
      if (cfg.hasLiquorSpecs) cols.push({ label: 'Volume (ML)', aliases: ['volume', 'volumeml', 'ml'], profile: 'text' });
      if (cfg.hasLiquorSpecs) cols.push({ label: 'Bottle Type', aliases: ['bottletype', 'packaging', 'container', 'pack'], profile: 'text' });
      return cols;
    }
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

  const mappedRows = rawRows.map(raw => {
    const out: any = {};
    for (const { col, src } of sources) {
      out[col.label] = src != null && raw[src] != null ? raw[src] : '';
    }
    for (const h of extraHeaders) out[h] = raw[h] ?? '';
    return out;
  });

  // Expand rows that carry size_variants as a multi-key object (e.g. from AI
  // parsing "32X36" into {"32":1,"34":1,"36":1}) — the template doesn't have a
  // size_variants column so it would be silently dropped. Instead expand each
  // size into its own row so the review table shows them and the execute route
  // creates per-size variants[] entries as it normally does.
  const sizeColLabel = template.find(c => c.label === 'Size')?.label;
  const qtyColLabel = template.find(c => c.label === 'Quantity')?.label;
  let rows = mappedRows;
  if (sizeColLabel && qtyColLabel) {
    const expanded: any[] = [];
    for (let i = 0; i < mappedRows.length; i++) {
      const row = mappedRows[i];
      const rawSv = rawRows[i]?.size_variants;
      if (
        rawSv && typeof rawSv === 'object' && !Array.isArray(rawSv) &&
        Object.keys(rawSv).length > 1 &&
        !row[sizeColLabel]
      ) {
        for (const [size, qty] of Object.entries(rawSv)) {
          expanded.push({ ...row, [sizeColLabel]: size, [qtyColLabel]: Number(qty) });
        }
      } else {
        expanded.push(row);
      }
    }
    rows = expanded;
  }

  return { rows, headers };
}
