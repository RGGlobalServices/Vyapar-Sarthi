import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { aiVisionComplete } from '@/lib/server/ai';
import { getSimilarity } from '@/lib/fuzzy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a phone photo, keeps the base64 payload to OpenRouter sane
const MATCH_THRESHOLD = 0.55; // below this the extracted name is too far off any real party to auto-select

interface ExtractedRow {
  party: string;
  amount: number | null;
  cash: number | null;
  chq: number | null;
  dis: number | null;
}

/** Strip a ```json ... ``` (or bare ``` ... ```) fence a vision model
 *  routinely wraps its answer in even when told not to, then parse. */
function parseJsonArray(raw: string): ExtractedRow[] {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  // Some models still preface the JSON with a sentence — find the first '['.
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'AI could not read this photo as a collection sheet. Try a clearer, well-lit photo.');
  }
  if (!Array.isArray(parsed)) throw new ApiError(502, 'AI response was not a list of rows. Please try again.');

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  return (parsed as Record<string, unknown>[])
    .map((r) => ({
      party: String(r.party ?? r.name ?? '').trim(),
      amount: num(r.amount),
      cash: num(r.cash),
      chq: num(r.chq ?? r.cheque),
      dis: num(r.dis ?? r.discount),
    }))
    .filter((r) => r.party.length > 0);
}

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);

  // Which side of the ledger to match against — 'party' (Udyog wholesale
  // parties, the original use case) or 'customer' (retail Udhar buyers,
  // and Vyapar/Dukan where every buyer is a plain customer). Passed by the
  // ScanCollectionModal caller so one endpoint handles both — a shopkeeper
  // running Udyog might collect from both wholesale parties AND retail
  // customers, and needs separate scan rounds for each.
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType') === 'customer' ? 'customer' : 'party';

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new ApiError(400, 'No photo uploaded');
  if (file.size > MAX_FILE_BYTES) throw new ApiError(400, 'Photo is too large — please retake at a lower resolution.');
  if (!file.type.startsWith('image/')) throw new ApiError(400, 'Please upload an image file.');

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`;

  const prompt = `You are reading a handwritten or printed "collection register" page used by an Indian wholesale trader — a route sheet listing which parties (shop/customer names) owe money and what was collected from each during a collection round.

The sheet is a table with columns similar to: Party (shop/owner name, sometimes with a route/area name in parentheses), Amt (amount due), Cash (cash collected), Chq (cheque collected), Dis (discount given).

Read every row and return ONLY a raw JSON array (no markdown, no explanation, no code fence) — one object per party row:
[{"party": "<name exactly as written>", "amount": <number or null>, "cash": <number or null>, "chq": <number or null>, "dis": <number or null>}]

Rules:
- Skip section/area header lines that are not an individual party (e.g. a lone town/route name with no amount).
- Skip the TOTAL row at the bottom.
- If a cell is blank, illegible, or crossed out, use null for that field — never guess a number.
- Strip currency symbols and thousands separators from numbers (e.g. "10,548" -> 10548).
- Preserve the party name's spelling exactly as written, including any area name in parentheses.`;

  const raw = await aiVisionComplete(dataUrl, prompt, { maxTokens: 3000 });
  const rows = parseJsonArray(raw);

  // customerType='customer' rows are stored with `customerType` either
  // literally 'customer' or null (older rows). Match both so an old shop's
  // pre-Udyog retail customers still show up in the scan match list.
  const whereType = entityType === 'party'
    ? { customerType: 'party' as const }
    : { OR: [{ customerType: 'customer' as const }, { customerType: null }] };
  const parties = await prisma.customer.findMany({
    where: { shopId: shop.id, ...whereType },
    select: { id: true, name: true, shopName: true, mobile: true, totalDue: true },
  });

  const matched = rows.map((row) => {
    let best: { id: string; name: string; shopName: string | null; totalDue: number | null; score: number } | null = null;
    for (const p of parties) {
      // Whichever of name/shopName reads closer to the scanned text wins —
      // real party rows are commonly written as either the owner's name or
      // the shop's trading name, and a scan can't know which up front.
      const scoreName = getSimilarity(row.party, p.name || '');
      const scoreShop = p.shopName ? getSimilarity(row.party, p.shopName) : 0;
      const score = Math.max(scoreName, scoreShop);
      if (!best || score > best.score) {
        best = { id: p.id, name: p.name || '', shopName: p.shopName, totalDue: p.totalDue, score };
      }
    }
    return {
      ...row,
      matchedPartyId: best && best.score >= MATCH_THRESHOLD ? best.id : null,
      matchedPartyName: best && best.score >= MATCH_THRESHOLD ? (best.shopName || best.name) : null,
      matchScore: best?.score ?? 0,
    };
  });

  return json({
    rows: matched,
    parties: parties.map((p) => ({ id: p.id, name: p.name, shopName: p.shopName, mobile: p.mobile, totalDue: p.totalDue })),
  });
});
