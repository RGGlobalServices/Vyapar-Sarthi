import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { ApiError } from './http';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

// ─── Key helpers ──────────────────────────────────────────────────────────────

function geminiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(Boolean) as string[];
}

const GEMINI_TEXT_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_VISION_MODELS = (
  process.env.IMPORT_GEMINI_MODELS || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash'
).split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransientOverload(msg: string): boolean {
  return /overload|unavailable|try again|temporarily|deadline|tim/i.test(msg) || /\b(500|502|503|504)\b/.test(msg);
}

// ─── Text: OpenAI primary ─────────────────────────────────────────────────────

async function openAITextComplete(messages: Msg[], opts: { maxTokens?: number }): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ApiError(503, 'OPENAI_API_KEY not configured');

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    max_tokens: opts.maxTokens ?? 800,
  });
  const answer = completion.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new ApiError(502, 'AI returned an empty response. Please try again.');
  return answer;
}

// ─── Text: Gemini secondary ───────────────────────────────────────────────────

async function geminiTextComplete(messages: Msg[], opts: { maxTokens?: number }): Promise<string> {
  const keys = geminiKeys();
  if (!keys.length) throw new ApiError(503, 'No AI key configured (set OPENAI_API_KEY or GEMINI_API_KEY)');

  const prompt = messages
    .map((m) => `${m.role === 'system' ? 'Instructions' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  for (const key of keys) {
    const client = new GoogleGenAI({ apiKey: key });
    try {
      const resp = await client.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.3, maxOutputTokens: opts.maxTokens ?? 800 },
      });
      const text = resp.text?.trim();
      if (text) return text;
    } catch (e) {
      console.error('Gemini text error:', e instanceof Error ? e.message : e);
    }
  }
  throw new ApiError(502, 'AI request failed. Please try again.');
}

// ─── Public: text completion ──────────────────────────────────────────────────

export async function aiComplete(messages: Msg[], opts: { maxTokens?: number } = {}): Promise<string> {
  // Primary: Gemini
  if (geminiKeys().length > 0) {
    try {
      return await geminiTextComplete(messages, opts);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) throw err;
      console.error('Gemini text failed — trying OpenAI fallback:', err instanceof Error ? err.message : err);
    }
  }
  // Fallback: OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      return await openAITextComplete(messages, opts);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number })?.status;
      if (status === 429 || /rate limit|quota/i.test(msg)) throw new ApiError(429, 'AI usage limit reached. Please try again later.');
      throw new ApiError(502, 'AI request failed. Please try again.');
    }
  }
  throw new ApiError(503, 'No AI key configured (set GEMINI_API_KEY or OPENAI_API_KEY)');
}

// ─── Vision helpers ───────────────────────────────────────────────────────────

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec((dataUrl || '').trim());
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

// ─── Vision: Gemini primary ───────────────────────────────────────────────────

async function geminiVision(imageDataUrl: string, prompt: string, opts: { maxTokens?: number }): Promise<string> {
  const keys = geminiKeys();
  if (!keys.length) throw new ApiError(503, 'No Gemini key configured');
  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) throw new ApiError(400, 'Invalid image data for AI vision.');

  const clients = keys.map((k) => new GoogleGenAI({ apiKey: k }));
  const timeoutMs = 45000;
  const lastErrors: string[] = [];

  for (let ki = 0; ki < clients.length; ki++) {
    const client = clients[ki];
    for (const model of GEMINI_VISION_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const callPromise = client.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } }] }],
            config: { temperature: 0.1, maxOutputTokens: opts.maxTokens ?? 3000 },
          }).then((resp) => resp.text || '');
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini ${model} timed out`)), timeoutMs),
          );
          const text = (await Promise.race([callPromise, timeoutPromise])).trim();
          if (text) return text;
          throw new Error('empty response');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isTransientOverload(msg) && attempt === 0) { await sleep(1500); continue; }
          lastErrors.push(`key${ki + 1}/${model}: ${msg.slice(0, 140)}`);
          break;
        }
      }
    }
  }
  console.error('AI Vision (Gemini) — all keys/models failed:', lastErrors.join(' | '));
  throw new ApiError(429, 'AI usage limit reached for now. Please try again later.');
}

// ─── Vision: OpenAI fallback ──────────────────────────────────────────────────

async function openAIVision(imageDataUrl: string, prompt: string, opts: { maxTokens?: number }): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ApiError(503, 'OPENAI_API_KEY not configured');

  const client = new OpenAI({ apiKey });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await (client.chat.completions.create as any)({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataUrl } }] }],
    temperature: 0.1,
    max_tokens: opts.maxTokens ?? 3000,
  });
  const answer = completion.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new ApiError(502, 'AI could not read the photo. Please try a clearer image.');
  return answer;
}

// ─── Public: vision completion ────────────────────────────────────────────────

/**
 * Image → text extraction. Primary: Gemini (rotating keys). Fallback: OpenAI gpt-4o.
 */
export async function aiVisionComplete(imageDataUrl: string, prompt: string, opts: { maxTokens?: number } = {}): Promise<string> {
  if (geminiKeys().length > 0) {
    try {
      return await geminiVision(imageDataUrl, prompt, opts);
    } catch (err) {
      if (!process.env.OPENAI_API_KEY) throw err;
      console.error('Gemini vision failed — falling back to OpenAI gpt-4o:', err instanceof Error ? err.message : err);
    }
  }
  return openAIVision(imageDataUrl, prompt, opts);
}
