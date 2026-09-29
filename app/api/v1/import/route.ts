import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { getBusinessConfig, BusinessType } from '@/lib/businessConfig';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = fd.get('targetType') as string || 'mixed';
    const businessTypeStr = fd.get('businessType') as string || 'general';
    const bizConfig = getBusinessConfig(businessTypeStr as BusinessType);

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const openaiKey = process.env.OPENAI_API_KEY || '';
    const geminiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
    ].filter(Boolean) as string[];

    if (!openaiKey && !geminiKeys.length) {
      return NextResponse.json({ error: 'No AI API key configured (set OPENAI_API_KEY or GEMINI_API_KEY)' }, { status: 500 });
    }
    
    // Convert the File into a base64 buffer for extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let mimeType = file.type;
    // Fix common mime type issues
    if (file.name.endsWith('.csv')) mimeType = 'text/csv';
    if (file.name.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (file.name.endsWith('.xls')) mimeType = 'application/vnd.ms-excel';
    if (!mimeType) mimeType = 'application/octet-stream';

    let extraItemFields = [];
    let extraSchemaFields = '';
    if (bizConfig.hasGender) { extraItemFields.push('gender'); extraSchemaFields += ', "gender": "String"'; }
    if (bizConfig.hasSizes) { extraItemFields.push('size_variants (CRITICAL RULE for Indian garment/clothing bills — read carefully:\n  CASE 1 — Size range in product name like "20X30", "34X42", "26X36" (two numbers separated by X):\n    This is a RANGE of sizes from start to end in steps of 2.\n    Example: "20X30" → sizes 20,22,24,26,28,30 = 6 sizes.\n    Example: "34X42" → sizes 34,36,38,40,42 = 5 sizes.\n    Example: "26X36" → sizes 26,28,30,32,34,36 = 6 sizes.\n    The QUANTITY on the bill is total pieces (all sizes combined).\n    Divide quantity ÷ number-of-sizes = pieces per size.\n    Set size_variants = each size mapped to that per-size quantity.\n    Example: product "S P LN699 20X30", qty=6 → 6÷6=1 per size → {\\"20\\":1,\\"22\\":1,\\"24\\":1,\\"26\\":1,\\"28\\":1,\\"30\\":1}\n    Example: product "ANY BABY 20X30", qty=12 → 12÷6=2 per size → {\\"20\\":2,\\"22\\":2,\\"24\\":2,\\"26\\":2,\\"28\\":2,\\"30\\":2}\n    If quantity is not perfectly divisible, distribute as evenly as possible.\n  CASE 2 — Explicit per-size quantities listed: "M: 10, L: 5" → {\\"M\\":10,\\"L\\":5}\n  CASE 3 — Single size label like "L", "XL", "38", "Set" with no range → leave size_variants as {} empty\n  NEVER assign the total quantity to all sizes — always divide it.)'); extraSchemaFields += ', "size_variants": {}'; }
    if (bizConfig.hasShades) { extraItemFields.push('shade'); extraSchemaFields += ', "shade": "String"'; }
    if (bizConfig.hasBatch) { extraItemFields.push('batch_number'); extraSchemaFields += ', "batch_number": "String"'; }
    if (bizConfig.hasDrugSchedule) { extraItemFields.push('drug_schedule'); extraSchemaFields += ', "drug_schedule": "String"'; }
    if (bizConfig.hasModel) { extraItemFields.push('model_number'); extraSchemaFields += ', "model_number": "String"'; }
    if (bizConfig.hasWarranty) { extraItemFields.push('warranty_months'); extraSchemaFields += ', "warranty_months": 0'; }
    if (bizConfig.hasFabric) { extraItemFields.push('fabric'); extraSchemaFields += ', "fabric": "String"'; }
    if (bizConfig.hasSoleMaterial) { extraItemFields.push('sole_material'); extraSchemaFields += ', "sole_material": "String"'; }
    if (businessTypeStr === 'kirana') { extraItemFields.push('weight', 'unit'); extraSchemaFields += ', "weight": "String", "unit": "String"'; }

    let businessInstructions = '';
    if (extraItemFields.length > 0) {
      businessInstructions = ` Additionally, extract the following fields for each product if available: ${extraItemFields.join(', ')}.`;
    }

    // Build the prompt based on targetType
    let specificInstructions = '';
    if (targetType === 'sales') {
      specificInstructions = 'Focus specifically on extracting sales transactions, dates, total amounts, and payment methods. The document may be a handwritten slip or notebook. If dates or total amounts are unclear or missing, you must still create a sales entry but explicitly flag the missing fields with the string "MISSING".';
    } else if (targetType === 'purchase') {
      specificInstructions = `Focus on extracting a purchase invoice. Extract vendorName, billDate, totalAmount, and EVERY individual product under "items". For each product, infer a logical "category" (e.g. Grocery, Dairy, Snacks). Extract "wholesaleCost" (the cost per unit on the bill). Intelligently calculate "suggestedSellingPrice" by adding a ~15% margin to wholesale cost. Ensure items array contains all products. Do not skip data because a column is missing!${businessInstructions}`;
    } else if (targetType === 'stock') {
      specificInstructions = `Focus on extracting bulk inventory from lists, kacha bills, or notebooks. CRITICAL: 1. Extract EVERY SINGLE ITEM. 2. Infer "category". 3. Smart Pricing: Set "mrp" and "sellingPrice". Intelligently estimate "wholesaleCost". 4. Ignore symbols. 5. Extract expiryDate.${businessInstructions}`;
    } else if (targetType === 'khata') {
      specificInstructions = 'Focus on extracting ledger (Udhar Khata) entries showing customer names, amounts they owe, dates, and any notes about the transaction. The document is likely a photo of a handwritten notebook. Read natural language (e.g., "Ramesh ko 500 dia") and extract it as a row.';
    }

    const jsonSchemaInstructions = `
Your response MUST be a VALID JSON object matching the following structure:
{
  "summary": "String summarizing what you found",
  "dataType": "String (khata, stock, sales, loans, mixed, purchase)",
  "needsClarification": "Boolean",
  "mismatchWarning": "String explaining if this data seems totally unrelated to a '${businessTypeStr}' business (e.g. uploading a cloth bill in a grocery store). Return null if it matches or is uncertain.",
  "khata": [{"customerName": "String", "amount": 0, "date": "String", "note": "String"}],
  "stock": [{"productName": "String", "category": "String", "quantity": 0, "unit": "String", "wholesaleCost": 0, "mrp": 0, "sellingPrice": 0, "expiryDate": "String", "missingPrice": false, "missingUnit": false${extraSchemaFields}}],
  "sales": [{"date": "String", "totalAmount": 0, "paymentMethod": "String", "note": "String", "missingDate": false, "missingAmount": false}],
  "purchase": [{"billDate": "String", "vendorName": "String", "totalAmount": 0, "missingDate": false, "missingAmount": false, "items": [{"productName": "String", "category": "String", "quantity": 0, "unit": "String", "wholesaleCost": 0, "suggestedSellingPrice": 0, "expiryDate": "String"${extraSchemaFields}}]}],
  "rawText": "String"
}`;

    let extractedText = '';
    let isVision = false;

    // Fast local PDF parsing
    if (mimeType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(buffer);
        if (!pdfData.text || pdfData.text.trim().length < 20) {
            throw new Error(`The PDF file ${file.name} appears to be a scanned image with no text. Please convert it to an image (JPG/PNG) or upload a photo of it so our Vision AI can read the handwriting.`);
        }
        extractedText = pdfData.text;
      } catch (pdfError: any) {
        throw new Error(pdfError.message || `The PDF file ${file.name} could not be read. Please convert it to an image (JPG/PNG) and upload again.`);
      }
    } else if (mimeType.startsWith('image/')) {
      isVision = true;
    } else if (mimeType === 'text/csv' || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
        try {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          extractedText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        } catch (e: any) {
          throw new Error(`Could not parse spreadsheet ${file.name}: ${e.message}`);
        }
    } else {
      extractedText = buffer.toString('utf-8'); // CSV, txt, etc.
    }

    const prompt = `You are an expert data entry assistant named Vyapar Sarthi AI. You extract structured data from messy images, informal handwritten notebooks, PDFs, CSVs, and Excel files. 

Target Data Type: ${targetType.toUpperCase()}
${specificInstructions}
${jsonSchemaInstructions}

CRITICAL RULES:
1. DO NOT SKIP OR IGNORE ANY ROWS. You MUST extract EVERY SINGLE ITEM, TRANSACTION, OR LEDGER ENTRY found in the document. 
2. Process the ENTIRE document from start to finish. Do not summarize.
3. For handwritten notebooks (especially Udhar Khata or sales), carefully read the messy handwriting and infer customer names and amounts.
4. If some fields (like price or quantity) are missing or illegible, DO NOT skip the row. Just extract what you can logically infer.
5. If you are unsure about an extraction, append " (Please Verify)" to the string value. 
6. If a required field is missing, set booleans like missingPrice or missingDate to true, and put 0 for missing numbers.

DOCUMENT DATA:
${extractedText}`;

    let resultData = null;

    function parseJsonOutput(text: string, source: string): any {
      try {
        return JSON.parse(text);
      } catch (e: any) {
        try {
          const { jsonrepair } = require('jsonrepair');
          return JSON.parse(jsonrepair(text));
        } catch {
          throw new Error(`${source} returned invalid JSON: ` + e.message);
        }
      }
    }

    // ── Primary: Gemini (direct REST API) ────────────────────────────────
    if (!resultData && geminiKeys.length > 0) {
      const geminiModels = (process.env.IMPORT_GEMINI_MODELS || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash')
        .split(',').map((s: string) => s.trim()).filter(Boolean);

      outer: for (const gKey of geminiKeys) {
        for (const model of geminiModels) {
          try {
            const parts: any[] = [{ text: prompt }];
            if (isVision) parts.push({ inline_data: { mime_type: mimeType, data: buffer.toString('base64') } });

            const gRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gKey },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts }],
                  generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' },
                }),
              }
            );
            const gData = await gRes.json();
            if (!gRes.ok) {
              const errMsg = gData?.error?.message || gRes.status;
              console.error(`Gemini REST error [${model}]:`, errMsg);
              // Auth errors — skip remaining models on this key
              if (gRes.status === 400 || gRes.status === 401 || gRes.status === 403) break;
              continue;
            }
            const text = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
              resultData = parseJsonOutput(cleaned, 'Gemini');
              break outer;
            }
          } catch (e: any) {
            console.error(`Gemini fetch error [${model}]:`, e.message);
          }
        }
      }
    }

    // ── Fallback: OpenAI ──────────────────────────────────────────────────
    if (!resultData && openaiKey) {
      try {
        const modelName = isVision ? 'gpt-4o' : 'gpt-4o-mini';
        const messages = isVision
          ? [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } }] }]
          : [{ role: 'user', content: prompt }];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: modelName, messages, temperature: 0.2, max_tokens: 8000, response_format: { type: 'json_object' } })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');
        const textOutput = data.choices?.[0]?.message?.content;
        if (textOutput) resultData = parseJsonOutput(textOutput, 'OpenAI');
      } catch (openaiErr: any) {
        console.error('OpenAI import fallback failed:', openaiErr.message);
      }
    }

    if (!resultData) throw new Error('File could not be read. Please check your GEMINI_API_KEY in .env.local and try again.');

    if (resultData) {
      resultData.khata = resultData.khata || [];
      resultData.stock = resultData.stock || [];
      resultData.sales = resultData.sales || [];
      resultData.purchase = resultData.purchase || [];
    }

    if (!resultData) {
      throw new Error('AI failed to return a valid JSON response. Please try again.');
    }

    const json = JSON.stringify(resultData);
    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error: any) {
    console.error('Import API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
