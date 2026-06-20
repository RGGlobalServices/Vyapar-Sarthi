import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const targetType = fd.get('targetType') as string || 'mixed';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
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
      specificInstructions = 'Focus on extracting a bulk list of stock/inventory. Look for product names, quantities, and prices. Ensure you format it as stock entries.';
    } else if (targetType === 'khata') {
      specificInstructions = 'Focus on extracting ledger (Udhar Khata) entries showing customer names, amounts they owe, dates, and any notes about the transaction.';
    }

    const prompt = `You are an expert data entry assistant named Vyapar Sarthi AI. You extract structured data from images, PDFs, CSVs, and Excel files. 

Target Data Type: ${targetType.toUpperCase()}
${specificInstructions}

Please analyze the attached document and return a detailed JSON object containing arrays for any found data. If you are unsure about an extraction (like a messy handwriting), append " (Please Verify)" to the value or provide options in a note. If a required field (like price or date) is missing, output the string "MISSING" for that field.

Provide a summary describing what you found.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: buffer.toString('base64'), mimeType: mimeType } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            dataType: { type: Type.STRING, enum: ['khata', 'stock', 'sales', 'loans', 'mixed', 'purchase'] },
            needsClarification: { type: Type.BOOLEAN, description: 'True if there is ambiguous data that requires user intervention' },
            khata: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  customerName: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  date: { type: Type.STRING },
                  note: { type: Type.STRING }
                }
              }
            },
            stock: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  productName: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  missingPrice: { type: Type.BOOLEAN },
                  missingUnit: { type: Type.BOOLEAN }
                }
              }
            },
            sales: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  totalAmount: { type: Type.NUMBER },
                  paymentMethod: { type: Type.STRING },
                  note: { type: Type.STRING },
                  missingDate: { type: Type.BOOLEAN },
                  missingAmount: { type: Type.BOOLEAN }
                }
              }
            },
            purchase: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  billDate: { type: Type.STRING },
                  vendorName: { type: Type.STRING },
                  totalAmount: { type: Type.NUMBER },
                  missingDate: { type: Type.BOOLEAN },
                  missingAmount: { type: Type.BOOLEAN }
                }
              }
            },
            rawText: { type: Type.STRING }
          }
        }
      }
    });

    let resultData = response.text ? JSON.parse(response.text) : null;
    
    if (!resultData) {
      throw new Error('AI returned an empty response');
    }
    
    // Clean up missing booleans defaults
    resultData.khata = resultData.khata || [];
    resultData.stock = resultData.stock || [];
    resultData.sales = resultData.sales || [];
    resultData.purchase = resultData.purchase || [];

    return NextResponse.json(resultData);
    
  } catch (error: any) {
    console.error('Import API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process file' }, { status: 500 });
  }
}
