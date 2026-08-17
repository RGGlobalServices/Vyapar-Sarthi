import OpenAI from 'openai';
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

// The text chat model above (Nemotron nano) has no image input at all — a
// separate, vision-capable model is needed for photo-reading features (e.g.
// scanning a handwritten collection register). Kept as its own env var so
// swapping either model never affects the other feature.
const DEFAULT_VISION_MODEL = 'google/gemma-4-26b-a4b-it:free';

/**
 * One-shot image → text extraction via a vision-capable OpenRouter model.
 * `imageDataUrl` must be a full data: URL (e.g. `data:image/jpeg;base64,...`).
 * Returns the model's raw text reply — callers that expect JSON should strip
 * markdown fences themselves (models routinely wrap JSON in ```json blocks
 * despite being told not to).
 */
export async function aiVisionComplete(imageDataUrl: string, prompt: string, opts: { maxTokens?: number } = {}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ApiError(503, 'AI is not configured (OPENROUTER_API_KEY missing)');
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
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
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
