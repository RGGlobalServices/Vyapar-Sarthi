import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { config } from './config';
import { ApiError } from './http';

// Shared OpenRouter (OpenAI-compatible) client used by the AI chat + insights.
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Nano MoE — ~2s responses. The 550B "ultra" model takes ~70s on free tier.
const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function aiComplete(messages: Msg[], opts: { maxTokens?: number } = {}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ApiError(503, 'AI is not configured (OPENROUTER_API_KEY missing)');
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: { 'HTTP-Referer': config.appUrl, 'X-Title': 'Vyapar Sarthi' },
  });

  try {
    // `reasoning.enabled: false` (OpenRouter extension) turns OFF the model's
    // hidden "thinking". Nemotron-style reasoning models otherwise spend the
    // entire token budget reasoning and return empty content (caused 502s).
    // It's also ~3x faster. Ignored gracefully by non-reasoning models.
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 800,
      reasoning: { enabled: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const answer = completion.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new ApiError(502, 'AI returned an empty response. Please try again.');
    return answer;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const msg = err instanceof Error ? err.message : 'AI request failed';
    const status = (err as { status?: number })?.status;
    console.error('AI (OpenRouter) error:', status, msg);
    if (status === 401 || /unauthor|invalid api key|no auth/i.test(msg)) {
      throw new ApiError(503, 'AI key invalid. Check OPENROUTER_API_KEY.');
    }
    if (status === 429 || /rate limit|quota/i.test(msg)) {
      throw new ApiError(429, 'AI usage limit reached for now. Please try again later.');
    }
    if (status === 404 || /not a valid model|no endpoints|model/i.test(msg)) {
      throw new ApiError(502, `AI model "${model}" is unavailable on OpenRouter right now.`);
    }
    throw new ApiError(502, 'AI request failed. Please try again.');
  }
}

export const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

// ─── Vision (photo → text) — Gemini-first, multi-key, OpenRouter fallback ───
//
// Photo-reading features (Add Bill "Scan Bill", the handwritten collection
// scanner) now use the SAME rotating Google Gemini keys as the Import Data
// feature — GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3(…). When one
// key's free quota is exhausted the next is tried automatically, so a single
// key hitting its daily cap no longer kills the feature. OpenRouter stays as a
// last-resort fallback only when NO Gemini key is configured (or every Gemini
// key AND model failed), so nothing breaks for a shop that only set the
// OpenRouter key.

/** Gemini keys in priority order, missing ones skipped — identical set to the
 *  Import pipeline so a shop configures its keys once and both features use
 *  them. */
function geminiVisionKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(Boolean) as string[];
}

/** Vision model chain — reuses the Import feature's env var so both stay on
 *  the same models. Walked in order per key before rotating to the next key. */
const GEMINI_VISION_MODELS = (process.env.IMPORT_GEMINI_MODELS || process.env.IMPORT_GEMINI_MODEL
  || 'gemini-3.5-flash,gemini-3.5-flash-lite')
  .split(',').map(s => s.trim()).filter(Boolean);

/** Split a `data:<mime>;base64,<data>` URL into the parts Gemini's inlineData
 *  needs. Returns null for anything that isn't a base64 data URL. */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec((dataUrl || '').trim());
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for transient "model is overloaded / try again" style errors that are
 *  worth a short retry on the SAME key/model before escalating. */
function isTransientOverload(msg: string): boolean {
  return /overload|unavailable|try again|temporarily|deadline|tim/i.test(msg) || /\b(500|502|503|504)\b/.test(msg);
}

/**
 * Read an image with Gemini, rotating key × model on failure exactly like the
 * Import pipeline: walk every model on the current key, and if all fail move
 * to the next key. Throws only when every key × every model has failed.
 */
async function geminiVision(imageDataUrl: string, prompt: string, opts: { maxTokens?: number }): Promise<string> {
  const keys = geminiVisionKeys();
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
          const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Gemini ${model} timed out`)), timeoutMs));
          const text = (await Promise.race([callPromise, timeoutPromise])).trim();
          if (text) return text;
          throw new Error('empty response');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          // One quick retry on a transient overload before escalating.
          if (isTransientOverload(msg) && attempt === 0) { await sleep(1500); continue; }
          lastErrors.push(`key${ki + 1}/${model}: ${msg.slice(0, 140)}`);
          break; // escalate to the next model (then next key)
        }
      }
    }
  }
  // Every key × model exhausted — quota is the overwhelmingly common cause.
  console.error('AI Vision (Gemini) — all keys/models failed:', lastErrors.join(' | '));
  throw new ApiError(429, 'AI usage limit reached for now. Please try again later.');
}

// OpenRouter fallback vision model — used only when no Gemini key is set.
const DEFAULT_VISION_MODEL = 'google/gemma-4-26b-a4b-it:free';

async function openRouterVision(imageDataUrl: string, prompt: string, opts: { maxTokens?: number }): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ApiError(503, 'AI is not configured (set GEMINI_API_KEY or OPENROUTER_API_KEY).');
  const model = process.env.OPENROUTER_VISION_MODEL || DEFAULT_VISION_MODEL;

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: { 'HTTP-Referer': config.appUrl, 'X-Title': 'Vyapar Sarthi' },
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataUrl } } ] },
      ],
      temperature: 0.1,
      max_tokens: opts.maxTokens ?? 2000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const answer = completion.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new ApiError(502, 'AI could not read the photo. Please try a clearer image.');
    return answer;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const msg = err instanceof Error ? err.message : 'AI vision request failed';
    const status = (err as { status?: number })?.status;
    console.error('AI Vision (OpenRouter) error:', status, msg);
    if (status === 401 || /unauthor|invalid api key|no auth/i.test(msg)) {
      throw new ApiError(503, 'AI key invalid. Check OPENROUTER_API_KEY.');
    }
    if (status === 429 || /rate limit|quota/i.test(msg)) {
      throw new ApiError(429, 'AI usage limit reached for now. Please try again later.');
    }
    if (status === 404 || /not a valid model|no endpoints|model/i.test(msg)) {
      throw new ApiError(502, `AI vision model "${model}" is unavailable on OpenRouter right now.`);
    }
    throw new ApiError(502, 'Could not read the photo. Please try again with better lighting.');
  }
}

/**
 * One-shot image → text extraction. `imageDataUrl` must be a full data: URL
 * (e.g. `data:image/jpeg;base64,...`). Returns the model's raw text reply —
 * callers that expect JSON strip markdown fences themselves (models routinely
 * wrap JSON in ```json blocks despite being told not to).
 *
 * Uses the rotating Gemini keys first (same keys as Import Data); only falls
 * back to OpenRouter when NO Gemini key is configured.
 */
export async function aiVisionComplete(imageDataUrl: string, prompt: string, opts: { maxTokens?: number } = {}): Promise<string> {
  if (geminiVisionKeys().length > 0) {
    try {
      return await geminiVision(imageDataUrl, prompt, opts);
    } catch (err) {
      // If Gemini exhausted every key AND an OpenRouter key exists, give that a
      // last try; otherwise surface Gemini's error (usually the quota message).
      if (!process.env.OPENROUTER_API_KEY) throw err;
      console.error('Gemini vision failed — falling back to OpenRouter:', err instanceof Error ? err.message : err);
    }
  }
  return openRouterVision(imageDataUrl, prompt, opts);
}
