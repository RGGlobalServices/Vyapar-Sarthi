import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = fd.get('targetType') as string || 'mixed';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const apiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    if (apiKeys.length === 0) {
      return NextResponse.json({ error: 'No Gemini API keys configured in environment' }, { status: 500 });
    }
    
    // Convert the File into a base64 buffer for Gemini
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let mimeType = file.type;
    // Fix common mime type issues
    if (file.name.endsWith('.csv')) mimeType = 'text/csv';
    if (!mimeType) mimeType = 'application/octet-stream';

    // Build the prompt based on targetType
    let specificInstructions = '';
    if (targetType === 'sales') {
      specificInstructions = 'Focus specifically on extracting sales transactions, dates, total amounts, and payment methods. If dates or total amounts are unclear or missing, you must still create a sales entry but explicitly flag the missing fields with the string "MISSING".';
    } else if (targetType === 'purchase') {
      specificInstructions = 'Focus on extracting a list of products purchased from a vendor/supplier. Identify product names, quantities, unit types, and prices. Also look for a total bill amount and a bill date. If any product is missing a price or quantity, or if the overall date is missing, flag it clearly so the user can be prompted.';
    } else if (targetType === 'stock') {
      specificInstructions = 'Focus on extracting a bulk list of stock/inventory. Look for product names, quantities, units, prices, and expiry dates. CRITICAL: 1. You MUST extract EVERY SINGLE ITEM in the document. Do not stop early. If there are 55 products, return exactly 55 objects. 2. The price MUST be a numeric value in the "price" field. Ignore symbols like ₹, $, or ■. DO NOT put the price in the "unit" field. 3. The "unit" field should ONLY contain units of measurement (e.g. kg, g, ml, pcs, box) separated from the product name. 4. Extract expiry dates into the "expiryDate" field.';
    } else if (targetType === 'khata') {
      specificInstructions = 'Focus on extracting ledger (Udhar Khata) entries showing customer names, amounts they owe, dates, and any notes about the transaction.';
    }

    const prompt = `You are an expert data entry assistant named Vyapar Sarthi AI. You extract structured data from images, PDFs, CSVs, and Excel files. 

Target Data Type: ${targetType.toUpperCase()}
${specificInstructions}

Please analyze the attached document and return a detailed JSON object containing arrays for any found data. If you are unsure about an extraction (like a messy handwriting), append " (Please Verify)" to the value or provide options in a note. If a required field (like price or date) is missing, output the string "MISSING" for that field.

Provide a summary describing what you found.`;

    let resultData = null;
    let lastError: any = null;

    for (const apiKey of apiKeys) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  { inline_data: { data: buffer.toString('base64'), mime_type: mimeType } }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  summary: { type: "STRING" },
                  dataType: { type: "STRING", enum: ['khata', 'stock', 'sales', 'loans', 'mixed', 'purchase'] },
                  needsClarification: { type: "BOOLEAN", description: 'True if there is ambiguous data that requires user intervention' },
                  khata: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        customerName: { type: "STRING" },
                        amount: { type: "NUMBER" },
                        date: { type: "STRING" },
                        note: { type: "STRING" }
                      }
                    }
                  },
                  stock: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        productName: { type: "STRING" },
                        quantity: { type: "NUMBER" },
                        unit: { type: "STRING" },
                        price: { type: "NUMBER" },
                        expiryDate: { type: "STRING" },
                        missingPrice: { type: "BOOLEAN" },
                        missingUnit: { type: "BOOLEAN" }
                      }
                    }
                  },
                  sales: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        date: { type: "STRING" },
                        totalAmount: { type: "NUMBER" },
                        paymentMethod: { type: "STRING" },
                        note: { type: "STRING" },
                        missingDate: { type: "BOOLEAN" },
                        missingAmount: { type: "BOOLEAN" }
                      }
                    }
                  },
                  purchase: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        billDate: { type: "STRING" },
                        vendorName: { type: "STRING" },
                        totalAmount: { type: "NUMBER" },
                        missingDate: { type: "BOOLEAN" },
                        missingAmount: { type: "BOOLEAN" }
                      }
                    }
                  },
                  rawText: { type: "STRING" }
                }
              }
            }
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'Unknown API Error');
        }

        const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
        resultData = textOutput ? JSON.parse(textOutput) : null;
        
        if (resultData) {
          // Clean up missing booleans defaults
          resultData.khata = resultData.khata || [];
          resultData.stock = resultData.stock || [];
          resultData.sales = resultData.sales || [];
          resultData.purchase = resultData.purchase || [];
          
          break; // Success! Exit the loop
        }
      } catch (err: any) {
        console.warn(`API Key starting with ${apiKey.substring(0, 8)} failed:`, err.message);
        lastError = err;
        // Continue to the next key in the loop
      }
    }

    if (!resultData) {
      throw lastError || new Error('All AI API keys failed to return a response');
    }

    return NextResponse.json(resultData);
    
  } catch (error: any) {
    console.error('Import API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
