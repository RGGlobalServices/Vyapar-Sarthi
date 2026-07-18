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

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'No Nvidia API key configured in environment' }, { status: 500 });
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
- For Products: Include ProductName, Quantity, SellingPrice, CostPrice, MRP, Category, and specific Specification Details (like Size, Color, Model, Warranty, Batch, Expiry).
- For Customers/Suppliers: Include Name, Address (Village/City), Mobile Number, and any Dates or Years present indicating when they were added or their last transaction.

Example JSON response:
{
  "summary": "Successfully extracted data",
  "items": [
    {
      "productName": "Tata Salt 1kg",
      "quantity": 50,
      "category": "Groceries",
      "size": "1kg",
      "customerName": "Ramesh Kumar",
      "mobile": "9999999999",
      "address": "Pune",
      "dateAdded": "2024-05-12"
    }
  ]
}
CRITICAL INSTRUCTIONS FOR AI: 
1. Return ONLY valid JSON matching the schema.
2. Do NOT include any explanations, greetings, or conversational text.
3. Do NOT wrap the JSON inside markdown code blocks (no \`\`\`json).
4. Do NOT include any text before '{' or after '}'.`;

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

    let messages = [];
    const modelName = hasImages ? "meta/llama-3.2-11b-vision-instruct" : "meta/llama-3.1-8b-instruct";

    if (hasImages) {
      messages = [
        {
          role: 'user',
          content: [
            { type: "text", text: prompt },
            ...imageContents
          ]
        }
      ];
    } else {
      messages = [
        { role: 'user', content: prompt }
      ];
    }

    const requestBody: any = {
      model: modelName,
      messages: messages,
      temperature: 0,
      max_tokens: 4096
    };

    if (targetType === 'purchase') {
      requestBody.response_format = {
        type: "json_schema",
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
    } else {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error(`Nvidia API returned an invalid response (${response.status}): ${responseText.substring(0, 500)}`);
    }

    if (!response.ok) {
      throw new Error(data.error?.message || data.detail || `Nvidia API Error ${response.status}`);
    }

    const textOutput = data.choices?.[0]?.message?.content;
    let resultData = null;
    
    if (textOutput) {
      console.log('--- RAW AI RESPONSE ---');
      console.log(textOutput);
      
      try {
        // Advanced cleanup: extract everything between the first '{' and the last '}'
        let cleanText = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }
        
        console.log('--- CLEANED RESPONSE ---');
        console.log(cleanText);

        resultData = JSON.parse(cleanText);
        console.log('--- PARSED JSON ---');
        console.log(JSON.stringify(resultData, null, 2));
      } catch (e: any) {
        console.log('JSON Parse failed, attempting jsonrepair...');
        try {
          const { jsonrepair } = require('jsonrepair');
          
          let cleanText = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
          const firstBrace = cleanText.indexOf('{');
          const lastBrace = cleanText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
          }
          
          const repaired = jsonrepair(cleanText);
          resultData = JSON.parse(repaired);
          console.log('--- REPAIRED PARSED JSON ---');
          console.log(JSON.stringify(resultData, null, 2));
        } catch (repairError: any) {
          console.error('Nvidia AI returned invalid JSON that could not be repaired: ', e.message);
          return NextResponse.json({ 
            error: 'AI extraction failed. Expected JSON but received plain text.', 
            rawAiResponse: textOutput,
            parseError: e.message 
          }, { status: 422 });
        }
      }
    }
    
    if (!resultData || !resultData.items || !Array.isArray(resultData.items)) {
      return NextResponse.json({ 
        error: 'AI extraction succeeded but the schema was invalid (missing "items" array).',
        rawAiResponse: textOutput,
        parsedData: resultData
      }, { status: 422 });
    }

    return NextResponse.json(resultData);
    
  } catch (error: any) {
    console.error('Analyze API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
