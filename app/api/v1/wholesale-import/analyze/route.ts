import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = fd.get('targetType') as string || 'mixed';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'No Nvidia API key configured in environment' }, { status: 500 });
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let mimeType = file.type;
    if (file.name.endsWith('.csv')) mimeType = 'text/csv';
    if (!mimeType) mimeType = 'application/octet-stream';

    let specificInstructions = '';
    if (targetType === 'purchase') {
      specificInstructions = 'Extract the purchase invoice data STRICTLY conforming to the provided JSON schema. Do NOT include markdown code blocks or explanations.';
    } else {
      specificInstructions = `Extract all tabular data relevant to the ${targetType} category.`;
    }

    const jsonSchemaInstructions = `
Your response MUST be a VALID JSON object containing an "items" array. Each object in the "items" array represents a single row or product extracted from the document.
Example JSON response:
{
  "summary": "Successfully extracted invoice data",
  "items": [
    {
      "productName": "Tata Salt 1kg",
      "quantity": 50,
      "unit": "packs",
      "wholesaleCost": 22.50,
      "vendorName": "Adani Wilmar (if applicable)",
      "billDate": "2026-06-28 (if applicable)"
    }
  ]
}
CRITICAL INSTRUCTIONS FOR AI: 
1. Return ONLY valid JSON matching the schema.
2. Do NOT include any explanations, greetings, or conversational text.
3. Do NOT wrap the JSON inside markdown code blocks (no \`\`\`json).
4. Do NOT include any text before '{' or after '}'.`;

    let extractedText = '';
    let isVision = false;

    if (mimeType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } catch (pdfError: any) {
        throw new Error('This PDF file could not be read. Please convert it to an image (JPG/PNG) and upload again.');
      }
    } else if (mimeType.startsWith('image/')) {
      isVision = true;
    } else {
      extractedText = buffer.toString('utf-8');
    }

    const prompt = `You are Vyapar Sarthi AI, an expert enterprise data extraction agent. 
Target Data Type: ${targetType.toUpperCase()}
${specificInstructions}
${jsonSchemaInstructions}

DOCUMENT DATA:
${extractedText}`;

    let messages = [];
    const modelName = isVision ? "meta/llama-3.2-11b-vision-instruct" : "meta/llama-3.1-8b-instruct";

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
