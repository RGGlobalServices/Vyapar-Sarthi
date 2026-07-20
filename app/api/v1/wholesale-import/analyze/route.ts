import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { importConfig } from '@/lib/importConfig';

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

    const apiKey = process.env.NVIDIA_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'No Nvidia API key configured in environment' }, { status: 500 });
    }
    
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
      specificInstructions = 'Extract the purchase invoice data STRICTLY conforming to the provided JSON schema. The data may be messy, handwritten, or informal (e.g., a "kacha bill"). Use your intelligence to infer the Item Name, Quantity, Price, and Total even if column headers are missing or unclear. Do NOT include markdown code blocks or explanations.';
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

    for (const file of files) {
      let mimeType = file.type;
      if (file.name.endsWith('.csv')) mimeType = 'text/csv';
      if (file.name.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (file.name.endsWith('.xls')) mimeType = 'application/vnd.ms-excel';
      if (!mimeType) mimeType = 'application/octet-stream';

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (mimeType === 'application/pdf') {
        try {
          const pdfData = await pdfParse(buffer);
          if (!pdfData.text || pdfData.text.trim().length < 20) {
            throw new Error(`The PDF file ${file.name} appears to be a scanned image with no text. Please convert it to an image (JPG/PNG) or upload a photo of it so our Vision AI can read the handwriting.`);
          }
          extractedText += `\n--- PDF: ${file.name} ---\n` + pdfData.text;
        } catch (pdfError: any) {
          throw new Error(pdfError.message || `The PDF file ${file.name} could not be read. Please convert it to an image (JPG/PNG) and upload again.`);
        }
      } else if (mimeType.startsWith('image/')) {
        hasImages = true;
        imageContents.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` }
        });
      } else if (mimeType === 'text/csv' || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
        try {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          extractedText += `\n--- Spreadsheet: ${file.name} ---\n` + csv;
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
    const callNvidia = async (messages: any[], model: string): Promise<string> => {
      const requestBody: any = { model, messages, temperature: 0, max_tokens: importConfig.aiMaxTokens };
      requestBody.response_format = targetType === 'purchase' ? purchaseSchema : { type: 'json_object' };
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody),
      });
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch { throw new Error(`Nvidia API returned an invalid response (${response.status}): ${responseText.substring(0, 300)}`); }
      if (!response.ok) throw new Error(data.error?.message || data.detail || `Nvidia API Error ${response.status}`);
      return data.choices?.[0]?.message?.content || '';
    };

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
      if (Array.isArray(r?.items)) aggregatedItems.push(...r.items);
      if (targetType === 'purchase') {
        for (const k of ['supplier', 'invoiceNumber', 'invoiceDate', 'warehouse']) {
          if (!header[k] && r?.[k]) header[k] = r[k];
        }
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

    const textChunks = extractedText.trim() ? chunkText(extractedText) : [];
    textChunks.forEach((chunk, idx) => {
      tasks.push({
        label: `Text chunk ${idx + 1}/${textChunks.length}`,
        run: () => callNvidia([{ role: 'user', content: buildPrompt(chunk) }], 'meta/llama-3.1-8b-instruct'),
      });
    });

    const MAX_IMAGES = importConfig.maxImages; // each image = one page of a scanned/photographed doc
    const imagesToProcess = imageContents.slice(0, MAX_IMAGES);
    imagesToProcess.forEach((img, idx) => {
      tasks.push({
        label: `Page/Image ${idx + 1}/${imagesToProcess.length}`,
        run: () => callNvidia(
          [{ role: 'user', content: [{ type: 'text', text: buildPrompt('') }, img] }],
          'meta/llama-3.2-11b-vision-instruct'
        ),
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

    return NextResponse.json({
      summary: `Extracted ${dedupedItems.length} rows from ${totalTasks} section(s) `
        + `(${textChunks.length} text chunk(s), ${imagesToProcess.length} page image(s))`
        + `${failedCount > 0 ? ` — ${failedCount} section(s) failed after retry` : ''}`
        + `${duplicatesRemoved > 0 ? `, ${duplicatesRemoved} duplicate(s) removed` : ''}`
        + `${imageContents.length > MAX_IMAGES ? ` (first ${MAX_IMAGES} images processed)` : ''}`,
      stats: {
        sectionsTotal: totalTasks,
        sectionsFailed: failedCount,
        textChunks: textChunks.length,
        pageImages: imagesToProcess.length,
        rowsExtracted: aggregatedItems.length,
        rowsAfterDedup: dedupedItems.length,
        duplicatesRemoved,
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
