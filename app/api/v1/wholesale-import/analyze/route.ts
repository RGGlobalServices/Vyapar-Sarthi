import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

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
    } else {
      businessSpecificFields = '- Extract Brand, Category, Unit, and any specific variants/models.';
    }

    let specificInstructions = '';
    if (targetType === 'purchase') {
      specificInstructions = 'Extract the purchase invoice data STRICTLY conforming to the provided JSON schema. Do NOT include markdown code blocks or explanations.';
    } else {
      specificInstructions = `Extract all tabular data relevant to the ${targetType} category.`;
    }

    const jsonSchemaInstructions = `
Your response MUST be a VALID JSON object containing an "items" array. Each object in the "items" array represents a single row or entity extracted from the document.

Extract EVERYTHING available. Do not skip data!
- For Products/Stock: Include ProductName, Quantity, SellingPrice, CostPrice, MRP.
${businessSpecificFields}
- For Customers/Suppliers: Include Name, Address (Village/City), Mobile Number, and any Dates or Years present indicating when they were added or their last transaction.
- For Sales History: Include ProductName, Quantity, SellingPrice (also known as Rate or Price), CustomerName, Mobile, InvoiceNumber, Date, and PaymentType.
- For Ledger/Udhar: Include PartyName, Type, Mobile, and OpeningBalance (Amount).

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
      if (!mimeType) mimeType = 'application/octet-stream';

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (mimeType === 'application/pdf') {
        try {
          const pdfData = await pdfParse(buffer);
          extractedText += `\n--- PDF: ${file.name} ---\n` + pdfData.text;
        } catch (pdfError: any) {
          throw new Error(`The PDF file ${file.name} could not be read. Please convert it to an image (JPG/PNG) and upload again.`);
        }
      } else if (mimeType.startsWith('image/')) {
        hasImages = true;
        imageContents.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` }
        });
      } else {
        extractedText += `\n--- Document: ${file.name} ---\n` + buffer.toString('utf-8');
      }
    }

    const prompt = `You are Vyapar Sarthi AI, an expert enterprise data extraction agent. 
Target Data Type: ${targetType.toUpperCase()}
${specificInstructions}
${jsonSchemaInstructions}

DOCUMENT DATA:
${extractedText}`;

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
    const callNvidia = async (messages: any[], model: string): Promise<string> => {
      const requestBody: any = { model, messages, temperature: 0, max_tokens: 4096 };
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

    // Any extracted document text → one text-model call.
    if (extractedText.trim()) {
      try {
        collect(await callNvidia([{ role: 'user', content: prompt }], 'meta/llama-3.1-8b-instruct'));
      } catch (e: any) { perCallErrors.push(`Text: ${e.message}`); }
    }

    // Each image → its own vision-model call (cap to keep total time sane).
    const MAX_IMAGES = 30;
    const imagesToProcess = imageContents.slice(0, MAX_IMAGES);
    for (let idx = 0; idx < imagesToProcess.length; idx++) {
      try {
        const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }, imagesToProcess[idx]] }];
        collect(await callNvidia(messages, 'meta/llama-3.2-11b-vision-instruct'));
      } catch (e: any) {
        perCallErrors.push(`Page/Image ${idx + 1}: ${e.message}`);
      }
    }

    if (aggregatedItems.length === 0) {
      return NextResponse.json({
        error: perCallErrors.length
          ? `AI extraction failed:\n${perCallErrors.join('\n')}`
          : 'AI extraction succeeded but returned no items.',
        rawAiResponse: lastRaw,
        parseError: perCallErrors.join('; '),
      }, { status: 422 });
    }

    return NextResponse.json({
      summary: `Extracted ${aggregatedItems.length} items from ${imagesToProcess.length || 1} document(s)${imageContents.length > MAX_IMAGES ? ` (first ${MAX_IMAGES} images processed)` : ''}`,
      ...header,
      items: aggregatedItems,
      partialErrors: perCallErrors.length ? perCallErrors : undefined,
    });

  } catch (error: any) {
    console.error('Analyze API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
