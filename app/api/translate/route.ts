import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    const { text, targetLocale } = await request.json();

    if (!text || !targetLocale) {
      return NextResponse.json({ error: 'Text and targetLocale are required' }, { status: 400 });
    }
    
    if (targetLocale === 'en') {
      return NextResponse.json({ translated: text });
    }

    const languageMap: Record<string, string> = {
      hi: 'Hindi',
      mr: 'Marathi',
      gu: 'Gujarati',
      bn: 'Bengali',
      ta: 'Tamil',
      te: 'Telugu',
      kn: 'Kannada',
      ml: 'Malayalam'
    };
    
    const lang = languageMap[targetLocale] || targetLocale;

    const prompt = `Translate the following product name or short text into ${lang}. Provide ONLY the translated text without quotes or formatting, nothing else. If it's a brand name, transliterate it. Text: "${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let translated = response.text?.trim() || text;
    
    // Remove any surrounding quotes from the AI's response if present
    if (translated.startsWith('"') && translated.endsWith('"')) {
      translated = translated.slice(1, -1);
    }

    return NextResponse.json({ translated });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json({ error: 'Failed to translate', translated: null }, { status: 500 });
  }
}
