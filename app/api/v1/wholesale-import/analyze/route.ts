import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { importConfig } from '@/lib/importConfig';

/* ─── Deterministic table reader ─────────────────────────────────────────────
 *
 * A machine-generated invoice/stock PDF already contains its table structure in
 * the glyph coordinates. Handing that to a language model and asking it to
 * re-derive the columns is strictly worse than reading them: the model has to
 * guess, and its guess changes between runs (one pass reads quantity from the
 * Qty column, the next reads it from Disc). For a document that has a real
 * header row there is nothing to infer, so we map cells to columns positionally
 * and skip the model entirely. The AI path remains for what it is actually good
 * at — handwritten notebooks, kacha bills, photos, and any layout with no
 * recognisable header.
 *
 * Input is the "|"-delimited text produced by the layout-aware PDF extractor.
 */

// Canonical field for a header cell, or null when the column is ignorable.
function canonicalColumn(raw: string): string | null {
  const h = raw.toLowerCase().replace(/[^a-z0-9%]/g, '');
  if (!h) return null;
  // Serial-number column carries no data.
  if (['#', 'sr', 'srno', 'sno', 'slno', 'no'].includes(h)) return null;
  if (/^(item|items|itemname|description|descriptionofgoods|goods|product|productname|particulars)$/.test(h)) return 'productName';
  if (/^(hsn|hsnsac|sac|hsncode)$/.test(h)) return 'hsnCode';
  if (/^(qty|quantity|nos|pcs|units)$/.test(h)) return 'quantity';
  if (/^(unit|uom|units?ofmeasure)$/.test(h)) return 'unit';
  if (/^(rate|price|priceunit|unitprice|unitcost|purchaserate)$/.test(h)) return 'unitCost';
  if (/^(disc|discount|discamount|discountamount)$/.test(h)) return 'discount';
  if (/^(taxable|taxableamount|taxablevalue|taxableamt)$/.test(h)) return 'taxableAmount';
  if (/^(gst%|gst|gstrate|gstpercent|tax%|taxrate|igst%|gstpct)$/.test(h)) return 'gstPercent';
  if (/^(amount|total|value|netamount|lineamount|amt)$/.test(h)) return 'amount';
  if (/^(mrp)$/.test(h)) return 'mrp';
  if (/^(batch|batchno|batchnumber)$/.test(h)) return 'batch';
  if (/^(expiry|exp|expirydate|expdate)$/.test(h)) return 'expiryDate';
  if (/^(barcode|sku|code|itemcode)$/.test(h)) return 'barcode';
  if (/^(category|group)$/.test(h)) return 'category';
  if (/^(brand|company|make)$/.test(h)) return 'brand';
  return null;
}

const NUMERIC_FIELDS = new Set([
  'quantity', 'unitCost', 'discount', 'taxableAmount', 'gstPercent', 'amount', 'mrp',
]);

function toNumber(v: string): number {
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Find header rows in the delimited text and read the data rows beneath each
 * one. Returns [] when no table with a usable header is present, which is the
 * signal to fall back to the AI extractor.
 */
function parseLayoutTables(text: string): any[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const headerCells = lines[i].split('|').map((c) => c.trim());
    if (headerCells.length < 3) continue;

    const mapping = headerCells.map(canonicalColumn);
    // A real product table needs a name column plus at least one number we can
    // act on. Without that we are looking at an address block, not a table.
    if (!mapping.includes('productName')) continue;
    if (!mapping.some((m) => m && NUMERIC_FIELDS.has(m))) continue;

    // Consume data rows until the shape stops matching (totals block, footer…).
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.includes('|')) break;
      const cells = line.split('|').map((c) => c.trim());
      // Allow a little raggedness (a blank trailing cell) but not a different table.
      if (cells.length < headerCells.length - 2 || cells.length > headerCells.length + 2) break;

      const row: any = {};
      for (let k = 0; k < mapping.length && k < cells.length; k++) {
        const field = mapping[k];
        if (!field) continue;
        const raw = cells[k];
        if (raw === '') continue;
        if (NUMERIC_FIELDS.has(field)) {
          const n = toNumber(raw);
          if (Number.isFinite(n)) row[field] = n;
        } else {
          row[field] = raw;
        }
      }

      // Summary lines ("Total | | | 132 | ...") have no product name — stop there.
      const name = String(row.productName ?? '').trim();
      if (!name) break;
      if (/^(total|sub\s*total|subtotal|grand\s*total|round\s*off|tax\s*summary)/i.test(name)) break;
      // A row with no numbers at all is a continuation/footnote, not a product.
      if (![...NUMERIC_FIELDS].some((f) => Number.isFinite(row[f]))) continue;

      items.push(row);
      i = j; // resume scanning after the consumed block
    }
  }

  return items;
}

/**
 * Pull supplier / invoice number / invoice date out of the block above the
 * table. Needed because the deterministic path never calls the model, and
 * /execute reads those fields off each row.
 */
function parseInvoiceHeader(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 15);
  const out: Record<string, string> = {};

  for (const line of lines) {
    const flat = line.replace(/\s*\|\s*/g, ' ');
    if (!out.invoiceNumber) {
      const m = flat.match(/\b(?:invoice|inv|bill)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9/\-_]{2,})/i);
      // Guard against matching the word "Invoice" inside a title line.
      if (m && !/^(tax|purchase|sample)$/i.test(m[1])) out.invoiceNumber = m[1];
    }
    if (!out.invoiceDate) {
      const m = flat.match(/\bdate\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
      if (m) out.invoiceDate = m[1];
    }
  }

  // Supplier: the first substantive line, before any "Invoice:"/"Buyer:" label.
  for (const line of lines) {
    const flat = line.replace(/\s*\|\s*/g, ' ').trim();
    if (!flat || /[:]/.test(flat)) continue;
    if (/^(tax invoice|invoice|original|duplicate|copy)$/i.test(flat)) continue;
    if (flat.length < 3 || flat.length > 60) continue;
    out.supplier = flat;
    break;
  }

  return out;
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const files = fd.getAll('files[]') as File[];
    // Fallback if frontend sends 'file'
    if (files.length === 0 && fd.has('file')) {
      files.push(fd.get('file') as File);
    }
    const targetType = fd.get('targetType') as string || 'mixed';
    const businessTypeStr = fd.get('businessType') as string || 'general';

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const nvidiaKey = process.env.NVIDIA_API_KEY || '';
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!nvidiaKey && !geminiKey) {
      return NextResponse.json({ error: 'No AI provider configured. Set GEMINI_API_KEY (recommended) or NVIDIA_API_KEY.' }, { status: 500 });
    }
    // Gemini is preferred: accurate on messy Indian invoices/handwriting, fast,
    // and a huge context window means fewer chunks. Falls back to Nvidia.
    const gemini = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
    
    let businessSpecificFields = '';
    let businessSpecificSchema = '';
    
    if (businessTypeStr === 'clothes' || businessTypeStr === 'boutique') {
      businessSpecificFields = '- Must extract Size, Color, Fabric, Gender, Brand, and Category.';
      businessSpecificSchema = '"size": "string", "color": "string", "fabric": "string", "gender": "string"';
    } else if (businessTypeStr === 'shoes') {
      businessSpecificFields = '- Must extract Size, Color, Sole Material, Gender, Brand, and Category.';
      businessSpecificSchema = '"size": "string", "color": "string", "sole_material": "string", "gender": "string"';
    } else if (businessTypeStr === 'kirana') {
      businessSpecificFields = '- Must extract precise Unit of measure (e.g., Kg, Ltr, Packet), Weight, Brand, and Category.';
      businessSpecificSchema = '"unit": "string", "weight": "string"';
    } else if (businessTypeStr === 'electric' || businessTypeStr === 'electronics') {
      businessSpecificFields = '- Must extract Model Number, Warranty (in months), Technical Specs (like Watt, Volt, Capacity), Brand, and Category.';
      businessSpecificSchema = '"model_number": "string", "warranty_months": "number"';
    } else if (businessTypeStr === 'liquor') {
      businessSpecificFields = '- Must extract Brand, Volume (e.g. 90ml/180ml/375ml/650ml/750ml), Alcohol Percentage (ABV %), Bottle Type (Bottle/Can/PET), Category (Beer/Wine/Whisky/Rum/Vodka/Gin/Brandy/Scotch/Soft Drinks/Snacks/Cigarettes), MRP, Purchase Price, Barcode, and Batch Number. For supplier liquor invoices also extract units-per-case for unit conversion.';
      businessSpecificSchema = '"brand": "string", "volume": "string", "alcoholPercentage": "string", "bottleType": "string"';
    } else {
      businessSpecificFields = '- Extract Brand, Category, Unit, and any specific variants/models.';
    }

    let specificInstructions = '';
    if (targetType === 'purchase') {
      // Purchase-invoice-specific rules. Indian GST invoices (Tax Invoice /
      // Kacha Bill / photographed supplier bills) look like:
      //   • Header block: supplier name, GSTIN, invoice number, date
      //   • Line items: description, HSN/SAC, qty, unit, price/unit,
      //     discount, taxable amount, GST%, total
      // We need field names that match the execute route's aliases exactly —
      // 'unitCost' (NOT sellingPrice, since this is what YOU paid the supplier).
      specificInstructions = [
        'This is a PURCHASE INVOICE (Indian GST tax invoice / supplier bill / kacha bill). You will see invoices from many different suppliers, each with its own layout, column names, language, and print quality — some typed, some handwritten, some photographed at an angle, some with no visible grid lines, headers sometimes in Hindi/Marathi or abbreviated. Do not assume this invoice matches any other invoice you have seen — read only what THIS page actually shows.',
        'Extract the supplier header AND every line item.',
        'For EACH item, output these exact field names: productName, hsnCode, quantity, unit, unitCost (price per unit YOU paid the supplier, NOT selling price), mrp (the printed MRP for this item, if the invoice shows one — else leave empty), gstPercent, amount (line total after discount+GST), barcode (leave empty if not present).',
        'For each item also copy the header onto the row: supplier (business name at top), invoiceNumber, invoiceDate (as YYYY-MM-DD if possible).',
        'unitCost — follow this procedure, in order, using only numbers actually printed on the page: (1) If a column exists that is clearly a per-unit rate separate from the line total — commonly labelled "Price/Unit", "Rate", "Basic Rate", "Dar", or an equivalent in whatever language the invoice uses — copy that figure exactly as printed. (2) Otherwise, if the row shows a line total/Amount, divide it by quantity — that is the actual amount charged per unit. (3) If neither a rate column nor a line total is present, leave unitCost empty rather than guessing. Never subtract, divide out, or otherwise back-calculate GST yourself, and never treat a printed MRP as if it were the purchase rate — a value is only valid if it is directly printed or a plain Amount÷quantity of what is printed.',
        'productName — transcribe the FULL item description exactly as printed, character for character, including every leading number, size, brand prefix, or code (e.g. a printed description like "500 REDLABEL TEA, 1KG PACK" must keep its leading "500" — never drop leading characters just because they look like a stray code). This rule applies regardless of what the item or brand actually is on any given invoice.',
        'Skip pure summary rows (Subtotal / Round Off / Grand Total / Tax Summary / signature) — only extract actual product rows.',
        'If HSN/SAC has slash (e.g. HSN/SAC), take just the code number.',
        'HSN codes are 4, 6 or 8 digits and are a SEPARATE column from quantity — never merge them. If you see "6203" in the HSN column and "18" in the Qty column, output hsnCode "6203" and quantity 18, never "620318".',
        'Also output discount and taxableAmount when the invoice shows them; they are used to cross-check each row.',
      ].join(' ');
    } else {
      specificInstructions = `Extract all data relevant to the ${targetType} category. The document may be a photo of a handwritten notebook, an informal note, a kacha bill, or a structured table. Extract what you can logically infer. DO NOT skip rows just because some fields (like price or quantity) are missing or illegible.`;
    }

    const jsonSchemaInstructions = `
Your response MUST be a VALID JSON object containing an "items" array. Each object in the "items" array represents a single row or entity extracted from the document.

The document could be a photo of a handwritten notebook, an informal "kacha bill", or a structured table. Extract EVERYTHING available. Do not skip data!
- For Products/Stock: Include ProductName, Quantity, SellingPrice, CostPrice, MRP. Look for scribbled lists or informal rows.
${businessSpecificFields}
- For Customers/Suppliers: Include Name, Address (Village/City), Mobile Number, and any Dates or Years present indicating when they were added or their last transaction.
- For Sales History: Include ProductName, Quantity, SellingPrice (also known as Rate or Price), CustomerName, Mobile, InvoiceNumber, Date, and PaymentType.
- For Ledger/Udhar: Include PartyName, Type, Mobile, and OpeningBalance (Amount). Look for natural language like "Ramesh ko 500 dia" and map it to Name: Ramesh, Amount: 500.

Example JSON response:
{
  "summary": "Successfully extracted data",
  "items": [
    {
      "productName": "Tata Salt 1kg",
      "quantity": 50,
      "sellingPrice": 20,
      "category": "Groceries",
      ${businessSpecificSchema ? businessSpecificSchema + ',' : ''}
      "customerName": "Ramesh Kumar",
      "mobile": "9999999999",
      "address": "Pune",
      "invoiceNumber": "INV-101",
      "date": "2024-05-12",
      "paymentType": "UPI"
    }
  ]
}
CRITICAL INSTRUCTIONS FOR AI: 
1. Return ONLY valid JSON matching the schema.
2. Do NOT include any explanations, greetings, or conversational text.
3. Do NOT wrap the JSON inside markdown code blocks (no \`\`\`json).
4. Do NOT include any text before '{' or after '}'.
5. If a value is missing from the document, leave it empty (e.g., null or ""). DO NOT use placeholder words like "string", "Not explicit", "N/A", or "Unknown".
6. Extract the actual values exactly as they appear in the document.`;

    let extractedText = '';
    let hasImages = false;
    let imageContents: any[] = [];
    // PDFs that text-extraction couldn't read — sent to Gemini as inline
    // documents (native PDF OCR) as a last-resort fallback. Handles corrupt
    // XRef tables, scanned PDFs, images-only PDFs, etc.
    const pdfFallbackDocs: { name: string; b64: string }[] = [];

    for (const file of files) {
      let mimeType = file.type;
      if (file.name.endsWith('.csv')) mimeType = 'text/csv';
      if (file.name.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (file.name.endsWith('.xls')) mimeType = 'application/vnd.ms-excel';
      if (!mimeType) mimeType = 'application/octet-stream';

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (mimeType === 'application/pdf') {
        // Three-tier extraction. Each tier is best-effort — a tier failing
        // must never abort the pipeline; only escalate to the next tier. Only
        // after ALL tiers have been tried do we surface an error.
        //   1. pdfjs layout — preserves table columns (see below)
        //   2. pdf-parse    — flattened text; fallback if pdfjs can't open it
        //   3. Gemini PDF   — native PDF OCR; scanned/image-only/corrupt PDFs
        let pdfText = '';
        const failures: string[] = [];

        // Layout-aware extraction runs FIRST because flattening a table is
        // lossy in a way the model cannot reliably undo. pdf-parse (and a naive
        // pdfjs `items.map(str).join(' ')`) emit one text run per row, so
        // neighbouring cells fuse: an invoice row with HSN "6203" and quantity
        // "18" becomes "620318", and the model then has to guess where the code
        // ends and the quantity begins — usually wrongly. Grouping items by
        // their Y baseline and inspecting the X gap between them lets us emit a
        // real "|" column separator instead of guessing.
        try {
          const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
          const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            disableFontFace: true,
            useSystemFonts: false,
            isEvalSupported: false,
          }).promise;

          const lines: string[] = [];
          for (let p = 1; p <= pdf.numPages; p++) {
            try {
              const page = await pdf.getPage(p);
              const tc = await page.getTextContent();

              // Bucket text items into rows keyed by their baseline Y.
              const rows = new Map<number, { x: number; w: number; s: string }[]>();
              for (const it of tc.items as any[]) {
                const s = (it.str ?? '').trim();
                if (!s) continue;
                const x = it.transform?.[4] ?? 0;
                const y = Math.round(it.transform?.[5] ?? 0);
                if (!rows.has(y)) rows.set(y, []);
                rows.get(y)!.push({ x, w: it.width ?? 0, s });
              }

              // PDF Y grows upward, so sort descending for top-to-bottom order.
              for (const [, cells] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
                cells.sort((a, b) => a.x - b.x);
                let line = '';
                let prevEnd: number | null = null;
                for (const c of cells) {
                  if (prevEnd !== null) {
                    // A wide horizontal gap means a new column; a small one is
                    // just intra-cell kerning between word fragments.
                    line += c.x - prevEnd > 6 ? ' | ' : ' ';
                  }
                  line += c.s;
                  prevEnd = c.x + c.w;
                }
                if (line.trim()) lines.push(line.trim());
              }
            } catch { /* skip unreadable page, keep the rest */ }
          }
          pdfText = lines.join('\n');
        } catch (e: any) {
          failures.push(`pdfjs-layout: ${e?.message || e}`);
        }

        if (!pdfText || pdfText.trim().length < 20) {
          try {
            const pdfData = await pdfParse(buffer);
            pdfText = pdfData.text || '';
          } catch (e: any) {
            failures.push(`pdf-parse: ${e?.message || e}`);
          }
        }

        if (pdfText.trim().length >= 20) {
          // Text extraction succeeded via tier 1 or 2.
          extractedText += `\n--- PDF: ${file.name} ---\n` + pdfText;
        } else {
          // Both text tiers failed OR text is too thin (scanned PDF).
          // Escalate to Gemini native PDF OCR — no local parsing needed.
          const pdfSizeMb = buffer.length / (1024 * 1024);
          if (gemini && pdfSizeMb <= 18) {
            pdfFallbackDocs.push({ name: file.name, b64: buffer.toString('base64') });
            continue;
          }
          const detail = failures.length ? ` [${failures.join(' | ')}]` : '';
          throw new Error(
            gemini
              ? `PDF ${file.name} is ${pdfSizeMb.toFixed(1)} MB — too large for direct AI OCR (max 18 MB). Please split it or export pages as images.${detail}`
              : `The PDF file ${file.name} has no readable text. Set GEMINI_API_KEY for automatic PDF OCR, or export each page as an image (JPG/PNG) and upload again.${detail}`
          );
        }
      } else if (mimeType.startsWith('image/')) {
        hasImages = true;
        imageContents.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` },
          mimeType,
          b64: buffer.toString('base64'),
        });
      } else if (mimeType === 'text/csv' || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
        try {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          // Read EVERY sheet — a workbook of category tabs (Groceries, Dairy…)
          // must not lose all but the first sheet. Sheets are concatenated with
          // headed markers so the AI can distinguish them if useful.
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, strip: true });
            if (csv.trim()) {
              extractedText += `\n--- Spreadsheet: ${file.name} :: Sheet: ${sheetName} ---\n` + csv;
            }
          }
        } catch (e: any) {
          throw new Error(`Could not parse spreadsheet ${file.name}: ${e.message}`);
        }
      } else {
        extractedText += `\n--- Document: ${file.name} ---\n` + buffer.toString('utf-8');
      }
    }

    // Build a prompt for one slice of document data. Text is processed in
    // chunks (see below) so every row is extracted regardless of file size —
    // for images, dataText is empty and the image itself carries the data.
    const buildPrompt = (dataText: string) => `You are Vyapar Sarthi AI, an expert enterprise data extraction agent.
Target Data Type: ${targetType.toUpperCase()}
${specificInstructions}
${jsonSchemaInstructions}

EXTRACTION RULES:
- Extract EVERY row present in the data below. Do not stop early, do not summarise, do not truncate.
- If a table row wraps across lines, treat it as one product.
- Return ALL rows you can see — there is no row limit.
- A " | " in the data is a COLUMN SEPARATOR taken from the document's own layout. Treat each "|"-delimited value as its own field and never join two of them into one number. The first data line is usually the header row naming those columns.

DOCUMENT DATA:
${dataText}`;

    const purchaseSchema = {
      type: "json_schema" as const,
      json_schema: {
        name: "purchase_invoice_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            supplier: { type: "string" },
            invoiceNumber: { type: "string" },
            invoiceDate: { type: "string" },
            warehouse: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productName: { type: "string" },
                  sku: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string" },
                  unitCost: { type: "number" },
                  batch: { type: "string" },
                  expiryDate: { type: "string" }
                },
                required: ["productName", "sku", "quantity", "unit", "unitCost", "batch", "expiryDate"],
                additionalProperties: false
              }
            },
            subtotal: { type: "number" },
            gst: { type: "number" },
            grandTotal: { type: "number" }
          },
          required: ["supplier", "invoiceNumber", "invoiceDate", "warehouse", "items", "subtotal", "gst", "grandTotal"],
          additionalProperties: false
        }
      }
    };

    // One Nvidia chat-completion call → returns the raw message content string.
    // max_tokens is high so a chunk's worth of rows never gets cut off mid-JSON.
    // An AbortController enforces importConfig.timeoutMs so a hung upstream
    // request can never block a whole batch forever.
    const callNvidia = async (messages: any[], model: string): Promise<string> => {
      if (!nvidiaKey) throw new Error('Nvidia API key not configured');
      const requestBody: any = { model, messages, temperature: 0, max_tokens: importConfig.aiMaxTokens };
      requestBody.response_format = targetType === 'purchase' ? purchaseSchema : { type: 'json_object' };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), importConfig.timeoutMs);
      let response: Response;
      try {
        response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nvidiaKey}` },
          body: JSON.stringify(requestBody),
          signal: ac.signal,
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          throw new Error(`Nvidia API call timed out after ${importConfig.timeoutMs}ms`);
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch { throw new Error(`Nvidia API returned an invalid response (${response.status}): ${responseText.substring(0, 300)}`); }
      if (!response.ok) throw new Error(data.error?.message || data.detail || `Nvidia API Error ${response.status}`);
      return data.choices?.[0]?.message?.content || '';
    };

    // Parse Gemini's retryDelay hint (e.g. "4.242585419s") from a 429 error.
    // Returns ms to wait, capped so we don't stall the whole request forever.
    const parseRetryDelayMs = (err: any): number | null => {
      const msg = err?.message || String(err || '');
      if (!/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return null;
      const m = msg.match(/retryDelay[^0-9]*([0-9.]+)s/i);
      const parsed = m ? Math.ceil(parseFloat(m[1]) * 1000) : 5000;
      return Math.min(parsed, 15000); // cap at 15s per attempt
    };
    // Google returns 503 UNAVAILABLE when its model shard is overloaded — no
    // retryDelay hint. It's transient and usually clears in a few seconds, so
    // we back off (2s → 4s → 8s) and try again, and if it still fails we
    // escalate to the next model in the chain (a less-loaded shard often
    // handles the same request straight away). Missing this made the import
    // hard-fail with the raw "This model is currently experiencing high
    // demand" message a single retry would have cleared.
    const isTransientUnavailable = (err: any): boolean => {
      const msg = err?.message || String(err || '');
      return /\b503\b|UNAVAILABLE|overloaded|high demand|Service Unavailable/i.test(msg);
    };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Gemini model chain — tries each model in order. If the primary model
    // returns a quota / rate-limit error (429), automatically falls through
    // to the next model. Comma-separated env override:
    //   IMPORT_GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite
    // Defaults reflect the current (2026) stable free-tier lineup — do not
    // hard-code deprecated 1.5/2.0 IDs. Add newer 3.x models to the front
    // of the env chain to opt in.
    const geminiChain = (process.env.IMPORT_GEMINI_MODELS || process.env.IMPORT_GEMINI_MODEL
      || 'gemini-2.5-flash,gemini-2.5-flash-lite')
      .split(',').map(s => s.trim()).filter(Boolean);

    // One Gemini generateContent invocation with per-attempt timeout, retry
    // on transient 429s (respecting the retryDelay hint), and automatic
    // fall-through to the next model in the chain on hard quota failure.
    const callGeminiOnce = async (contents: any, kind: string): Promise<string> => {
      if (!gemini) throw new Error('Gemini API key not configured');
      const attempt = async (model: string): Promise<string> => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), importConfig.timeoutMs);
        try {
          const resp = await gemini.models.generateContent({
            model,
            contents,
            config: { responseMimeType: 'application/json', temperature: 0 },
          });
          return resp.text || '';
        } catch (e: any) {
          if (e?.name === 'AbortError') {
            throw new Error(`Gemini ${kind} call to ${model} timed out after ${importConfig.timeoutMs}ms`);
          }
          throw e;
        } finally {
          clearTimeout(timer);
        }
      };

      const lastErrors: string[] = [];
      for (const model of geminiChain) {
        // Up to 3 attempts per model, honoring server-provided retryDelay on
        // 429 and using exponential backoff on transient 503 UNAVAILABLE.
        let escalate = false;
        for (let i = 0; i < 3; i++) {
          try { return await attempt(model); }
          catch (e: any) {
            const msg = e?.message || String(e);
            const wait = parseRetryDelayMs(e);
            if (wait !== null && i < 2 && !/limit:\s*0|PerDay/i.test(msg)) {
              await sleep(wait);
              continue;
            }
            // Transient overload: 2s → 4s → 8s, then escalate to next model.
            if (isTransientUnavailable(e) && i < 2) {
              await sleep(2000 * Math.pow(2, i));
              continue;
            }
            lastErrors.push(`${model}: ${msg.slice(0, 240)}`);
            // Hard quota OR overload survives 3 attempts → escalate: another
            // model in the chain is often on a different shard and answers.
            if (wait !== null || isTransientUnavailable(e)) escalate = true;
            break;
          }
        }
        if (!escalate) break; // non-recoverable error: don't burn every model
      }
      throw new Error(`Gemini ${kind} call failed: ${lastErrors.join(' | ')}`);
    };

    const callGeminiText = (promptText: string) => callGeminiOnce(promptText, 'text');
    const callGeminiPdf = (promptText: string, b64: string) => callGeminiOnce(
      [{ role: 'user', parts: [{ text: promptText }, { inlineData: { mimeType: 'application/pdf', data: b64 } }] }],
      'pdf',
    );
    const callGeminiVision = (promptText: string, mime: string, b64: string) => callGeminiOnce(
      [{ role: 'user', parts: [{ text: promptText }, { inlineData: { mimeType: mime, data: b64 } }] }],
      'vision',
    );

    // Parse the AI's JSON, with a jsonrepair fallback. Throws on unrecoverable output.
    const parseAiJson = (textOutput: string): any => {
      const extract = (s: string) => {
        let c = s.replace(/```json/gi, '').replace(/```/g, '').trim();
        const a = c.indexOf('{'), b = c.lastIndexOf('}');
        return a !== -1 && b !== -1 && b > a ? c.substring(a, b + 1) : c;
      };
      try { return JSON.parse(extract(textOutput)); }
      catch (e) {
        const { jsonrepair } = require('jsonrepair');
        return JSON.parse(jsonrepair(extract(textOutput)));
      }
    };

    // The vision model accepts at most ONE image per prompt, so multi-page PDFs
    // (converted to images by the client) and multiple photos are processed
    // sequentially — one call per image — and their extracted rows are merged.
    const aggregatedItems: any[] = [];
    let header: Record<string, any> = {}; // purchase-only top-level fields
    const perCallErrors: string[] = [];
    let lastRaw = '';

    const collect = (raw: string) => {
      lastRaw = raw;
      const r = parseAiJson(raw);
      if (targetType === 'purchase') {
        // Capture header first so we can bake it into each item — the wizard
        // only forwards data.items to /execute, and /execute reads the
        // supplier / invoice fields from firstRow, so header MUST live on
        // each row (not just the top-level of the analyze response).
        for (const k of ['supplier', 'invoiceNumber', 'invoiceDate', 'warehouse']) {
          if (!header[k] && r?.[k]) header[k] = r[k];
        }
        if (Array.isArray(r?.items)) {
          const withHeader = r.items.map((it: any) => ({
            supplier: it.supplier || r.supplier || header.supplier || undefined,
            invoiceNumber: it.invoiceNumber || r.invoiceNumber || header.invoiceNumber || undefined,
            invoiceDate: it.invoiceDate || r.invoiceDate || header.invoiceDate || undefined,
            ...it,
          }));
          aggregatedItems.push(...withHeader);
        }
      } else {
        if (Array.isArray(r?.items)) aggregatedItems.push(...r.items);
      }
    };

    // ── Split the full document text into row-sized chunks ──────────────────
    // A single call can only emit ~8k tokens, so a long product list would get
    // cut off mid-array and every row after that would be lost. Instead we slice
    // the text into batches of rows, extract each independently, and merge — so
    // 100% of rows are processed no matter how large the file is.
    const LINES_PER_CHUNK = importConfig.chunkSize;   // configurable rows per AI call
    const MAX_CHUNKS = importConfig.maxChunks;        // effectively unbounded (memory-guard only)
    const chunkText = (text: string): string[] => {
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length <= LINES_PER_CHUNK) return lines.length ? [lines.join('\n')] : [];
      // Prepend ONLY the first line (the column header) to each chunk for context.
      // Never repeat DATA rows into other chunks — that is what inflated the row
      // count (e.g. 80 rows reported as 141). Bodies are strictly non-overlapping.
      const headerLine = lines[0];
      const chunks: string[] = [];
      for (let i = 1; i < lines.length && chunks.length < MAX_CHUNKS; i += LINES_PER_CHUNK) {
        const body = lines.slice(i, i + LINES_PER_CHUNK).join('\n');
        chunks.push(`${headerLine}\n${body}`);
      }
      return chunks;
    };

    // Build the full task list: every text chunk + every image page. Nothing is
    // skipped — a large multi-page PDF becomes many tasks, all of which must run.
    type Task = { label: string; run: () => Promise<string> };
    const tasks: Task[] = [];

    // Provider selection — Gemini is preferred when configured (accurate on
    // messy Indian invoices, fast, generous context). Falls back to Nvidia
    // llama with an 8B default that is proven working on Nvidia's free tier.
    // Override either model via env: IMPORT_GEMINI_MODEL / IMPORT_TEXT_MODEL.
    const useGemini = !!gemini;
    const textModel = process.env.IMPORT_TEXT_MODEL || 'meta/llama-3.1-8b-instruct';
    const visionModel = process.env.IMPORT_VISION_MODEL || 'meta/llama-3.2-11b-vision-instruct';

    // Read any real table straight from the document's own column layout. When
    // this succeeds the values are exactly what the PDF contains, so we do NOT
    // send that text to a model at all — an LLM can only re-derive the columns
    // by guessing, and a guess that lands on the wrong column (quantity read
    // from the discount column, say) is silently wrong.
    const tableItems = extractedText.includes('|') ? parseLayoutTables(extractedText) : [];
    const usedDeterministicTable = tableItems.length > 0;
    if (usedDeterministicTable) {
      if (targetType === 'purchase') {
        // No model ran, so the header block has to be read from the layout too.
        for (const [k, v] of Object.entries(parseInvoiceHeader(extractedText))) {
          if (!header[k] && v) header[k] = v;
        }
      }
      aggregatedItems.push(
        ...tableItems.map((it) => ({
          ...(targetType === 'purchase'
            ? {
                supplier: header.supplier || undefined,
                invoiceNumber: header.invoiceNumber || undefined,
                invoiceDate: header.invoiceDate || undefined,
              }
            : {}),
          ...it,
        })),
      );
    }

    // Only fall back to the model when the layout gave us nothing to read.
    const textChunks = usedDeterministicTable || !extractedText.trim() ? [] : chunkText(extractedText);
    textChunks.forEach((chunk, idx) => {
      tasks.push({
        label: `Text chunk ${idx + 1}/${textChunks.length}`,
        run: () => useGemini
          ? callGeminiText(buildPrompt(chunk))
          : callNvidia([{ role: 'user', content: buildPrompt(chunk) }], textModel),
      });
    });

    const MAX_IMAGES = importConfig.maxImages; // each image = one page of a scanned/photographed doc
    const imagesToProcess = imageContents.slice(0, MAX_IMAGES);
    imagesToProcess.forEach((img: any, idx) => {
      tasks.push({
        label: `Page/Image ${idx + 1}/${imagesToProcess.length}`,
        run: () => useGemini
          ? callGeminiVision(buildPrompt(''), img.mimeType, img.b64)
          : callNvidia(
              [{ role: 'user', content: [{ type: 'text', text: buildPrompt('') }, { type: img.type, image_url: img.image_url }] }],
              visionModel
            ),
      });
    });

    // Direct-PDF fallback tasks — one call per PDF that text-extraction couldn't
    // read. Gemini reads the raw PDF including scanned pages via native OCR.
    pdfFallbackDocs.forEach((doc, idx) => {
      tasks.push({
        label: `PDF direct-OCR ${idx + 1}/${pdfFallbackDocs.length} (${doc.name})`,
        run: () => callGeminiPdf(buildPrompt(''), doc.b64),
      });
    });

    // Run tasks with bounded concurrency (fast, but avoids hammering the API),
    // then RETRY any that failed — configurable pass count so we never silently
    // drop rows.
    const CONCURRENCY = importConfig.maxConcurrentWorkers;
    const runTask = async (t: Task): Promise<{ label: string; raw?: string; error?: string }> => {
      try { return { label: t.label, raw: await t.run() }; }
      catch (e: any) { return { label: t.label, error: e?.message || 'failed' }; }
    };
    const runAll = async (list: Task[]) => {
      const out: { label: string; raw?: string; error?: string }[] = [];
      for (let i = 0; i < list.length; i += CONCURRENCY) {
        out.push(...await Promise.all(list.slice(i, i + CONCURRENCY).map(runTask)));
      }
      return out;
    };

    let results = await runAll(tasks);
    // Retry failed chunks/pages up to retryCount times before giving up.
    for (let attempt = 0; attempt < importConfig.retryCount; attempt++) {
      const failedTasks = tasks.filter((t) => results.find(r => r.label === t.label)?.error);
      if (failedTasks.length === 0) break;
      const retry = await runAll(failedTasks);
      results = results.map(r => retry.find(rr => rr.label === r.label && rr.raw) || r);
    }

    // Merge every successful task's rows (in task order) and record failures.
    for (const r of results) {
      if (r.raw) { try { collect(r.raw); } catch (e: any) { perCallErrors.push(`${r.label}: parse ${e.message}`); } }
      else if (r.error) { perCallErrors.push(`${r.label}: ${r.error}`); }
    }

    const totalTasks = tasks.length;
    const failedCount = results.filter(r => r.error).length;

    if (aggregatedItems.length === 0) {
      return NextResponse.json({
        error: perCallErrors.length
          ? `AI extraction failed:\n${perCallErrors.join('\n')}`
          : 'AI extraction succeeded but returned no items.',
        rawAiResponse: lastRaw,
        parseError: perCallErrors.join('; '),
      }, { status: 422 });
    }

    // Deduplicate rows the AI may have emitted twice (chunk boundaries, a
    // repeated header, or a vision model re-reading a table). We key on the
    // ENTIRE normalized row so only genuine exact-duplicate rows are dropped and
    // legitimately-distinct rows (different customer, qty, etc.) are all kept —
    // this is what corrects an inflated count like "80 rows shown as 141".
    const normalizeRow = (it: any): string => {
      if (!it || typeof it !== 'object') return String(it);
      const entries = Object.keys(it).sort().map(k => {
        const v = it[k];
        return `${k.toLowerCase()}=${String(v ?? '').trim().toLowerCase()}`;
      });
      return entries.join('|');
    };
    const seenKeys = new Set<string>();
    const dedupedItems = aggregatedItems.filter((it: any) => {
      const key = normalizeRow(it);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    const duplicatesRemoved = aggregatedItems.length - dedupedItems.length;

    // ── Arithmetic self-repair for invoice rows ─────────────────────────────
    // Every GST invoice line satisfies:  taxable = qty × rate − discount
    // That makes quantity recoverable even when the source text fused columns,
    // which is the one field a layout glitch corrupts silently (a wrong price
    // is obvious; a wrong quantity just quietly books the wrong stock).
    // We only overwrite when the arithmetic is confident: a rate is present and
    // the recomputed quantity is a near-whole number that disagrees with what
    // was extracted. An HSN code that swallowed the quantity is trimmed too.
    let repairedRows = 0;
    const num = (v: any): number => {
      if (v === undefined || v === null || v === '') return NaN;
      const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };
    const pick = (it: any, keys: string[]): any => {
      for (const k of Object.keys(it)) {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keys.includes(norm)) return it[k];
      }
      return undefined;
    };

    for (const it of dedupedItems as any[]) {
      if (!it || typeof it !== 'object') continue;

      // Looked up once per row and shared by both repairs below — quantity
      // repair needs it as a write target, the cost fill needs it as a divisor.
      const qtyKey = Object.keys(it).find(
        (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'quantity',
      ) || 'quantity';

      const rate = num(pick(it, ['unitcost', 'rate', 'price', 'priceperunit', 'unitprice']));
      const taxable = num(pick(it, ['taxableamount', 'taxable']));
      const discountRaw = num(pick(it, ['discount', 'disc']));
      const discount = Number.isFinite(discountRaw) ? discountRaw : 0;

      if (Number.isFinite(rate) && rate > 0 && Number.isFinite(taxable)) {
        const derived = (taxable + discount) / rate;
        // Quantities on a real invoice are whole (or near-whole) units.
        if (Number.isFinite(derived) && derived > 0) {
          const rounded = Math.round(derived);
          if (Math.abs(derived - rounded) <= 0.02) {
            const current = num(it[qtyKey]);
            if (current !== rounded) {
              it[qtyKey] = rounded;
              repairedRows++;

              // "6203" + "18" → "620318". With the true quantity known we can strip
              // the swallowed digits and restore a valid 4/6/8-digit HSN code.
              const hsnKey = Object.keys(it).find((k) =>
                ['hsncode', 'hsn', 'hsnsac', 'sac'].includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')),
              );
              if (hsnKey) {
                const hsn = String(it[hsnKey] ?? '').trim();
                const suffix = String(rounded);
                if (hsn.length > 4 && hsn.endsWith(suffix)) {
                  const trimmed = hsn.slice(0, -suffix.length);
                  if ([4, 6, 8].includes(trimmed.length)) it[hsnKey] = trimmed;
                }
              }
            }
          }
        }
      }

      // unitCost is what the review table shows as the row's purchase price —
      // it should never sit blank/zero when the invoice printed enough to
      // compute it. This only FILLS a missing value; it never overrides one
      // the model already reported, since a present unitCost may legitimately
      // be a genuine pre-GST rate that differs from amount÷quantity by design
      // (see the extraction prompt above) — a fill that can only ever help,
      // never make a correct value worse, is the only kind safe to run
      // unconditionally across every invoice format.
      const costKey = Object.keys(it).find(
        (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'unitcost',
      ) || 'unitCost';
      const currentCost = num(it[costKey]);
      if (!Number.isFinite(currentCost) || currentCost <= 0) {
        const amount = num(pick(it, ['amount', 'total', 'lineamount', 'netamount', 'value']));
        const qtyNow = num(it[qtyKey]);
        if (Number.isFinite(amount) && amount > 0 && Number.isFinite(qtyNow) && qtyNow > 0) {
          it[costKey] = Math.round((amount / qtyNow) * 100) / 100;
        }
      }
    }

    return NextResponse.json({
      summary: (usedDeterministicTable
        ? `Read ${tableItems.length} rows directly from the document's table layout (exact values, no AI guessing)`
        : `Extracted ${dedupedItems.length} rows from ${totalTasks} section(s) `
          + `(${textChunks.length} text chunk(s), ${imagesToProcess.length} page image(s))`)
        + `${failedCount > 0 ? ` — ${failedCount} section(s) failed after retry` : ''}`
        + `${duplicatesRemoved > 0 ? `, ${duplicatesRemoved} duplicate(s) removed` : ''}`
        + `${repairedRows > 0 ? `, ${repairedRows} quantity/HSN corrected from invoice totals` : ''}`
        + `${imageContents.length > MAX_IMAGES ? ` (first ${MAX_IMAGES} images processed)` : ''}`,
      stats: {
        sectionsTotal: totalTasks,
        sectionsFailed: failedCount,
        textChunks: textChunks.length,
        pageImages: imagesToProcess.length,
        rowsExtracted: aggregatedItems.length,
        rowsAfterDedup: dedupedItems.length,
        duplicatesRemoved,
        repairedRows,
        // True when values came straight from the PDF's column layout rather
        // than from a model — useful when diagnosing a bad import.
        deterministicTable: usedDeterministicTable,
      },
      ...header,
      items: dedupedItems,
      partialErrors: perCallErrors.length ? perCallErrors : undefined,
    });

  } catch (error: any) {
    console.error('Analyze API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
