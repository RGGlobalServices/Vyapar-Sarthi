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
