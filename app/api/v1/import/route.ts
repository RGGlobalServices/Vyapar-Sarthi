import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { getBusinessConfig, BusinessType } from '@/lib/businessConfig';

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

    const apiKey = process.env.NVIDIA_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json({ error: 'No Nvidia API key configured in environment' }, { status: 500 });
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
    if (bizConfig.hasSizes) { extraItemFields.push('size_variants (as a JSON object e.g. {\\"M\\": 10, \\"L\\": 5} if sizes are grouped, otherwise leave empty)'); extraSchemaFields += ', "size_variants": {}'; }
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

Please analyze the attached document data and return the required JSON object. Extract what you can logically infer. DO NOT skip rows just because some fields (like price or quantity) are missing or illegible. If you are unsure about an extraction, append " (Please Verify)" to the value. If a required field is missing, set booleans like missingPrice or missingDate to true, and put 0 for missing numbers.

DOCUMENT DATA:
${extractedText}`;

    let resultData = null;

    let messages = [];
    let modelName = isVision ? "meta/llama-3.2-11b-vision-instruct" : "meta/llama-3.1-8b-instruct";

    if (isVision) {
      messages = [
        {
          role: 'user',
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } }
          ]
        }
      ];
    } else {
      messages = [
        { role: 'user', content: prompt }
      ];
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || data.detail || 'Unknown Nvidia API Error');
    }

    const textOutput = data.choices?.[0]?.message?.content;
    
    if (textOutput) {
      try {
        resultData = JSON.parse(textOutput);
      } catch (e: any) {
        try {
          const { jsonrepair } = require('jsonrepair');
          const repaired = jsonrepair(textOutput);
          resultData = JSON.parse(repaired);
        } catch (repairError) {
          throw new Error('Nvidia AI returned invalid JSON that could not be repaired: ' + e.message);
        }
      }
    }
    
    if (resultData) {
      resultData.khata = resultData.khata || [];
      resultData.stock = resultData.stock || [];
      resultData.sales = resultData.sales || [];
      resultData.purchase = resultData.purchase || [];
    }

    if (!resultData) {
      throw new Error('Nvidia AI API failed to return a valid JSON response');
    }

    return NextResponse.json(resultData);
    
  } catch (error: any) {
    console.error('Import API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
