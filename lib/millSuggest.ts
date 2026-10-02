/**
 * Smart suggestions for the Quick Production form: once the material that goes in is known (Bhagar, Paddy, Wheat …), the products
 * that usually come out of it are offered first — and pre-selected — so the user only types weights.
 *
 * Three sources, strongest first:
 *   1. history   what this mill actually produced from the same material before (from production_outputs, computed on the server)
 *   2. recipe    what this device used last time for it
 *   3. names     the product names themselves (a "Bhagar Grain" for Bhagar) and typical by-products of that kind of grain
 * Pure functions, no imports — shared by the form and the tests.
 */

export type OutKind = 'finished_good' | 'by_product' | 'wip' | 'rejection';
export type ProductLite = { id: string; name: string; millCategory?: string | null };

const STOP = new Set(['grain', 'grains', 'raw', 'material', 'rm', 'new', 'old', 'lot', 'the', 'and', 'of', 'kg', 'prod', 'product', 'goods', 'mill', 'milled', 'whole']);

export function nameTokens(name: string): string[] {
  return String(name || '')
    .toLowerCase()
    .split(/[^a-zऀ-ॿ]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// Typical secondary outputs by kind of grain (English + Marathi/Hindi spellings in Latin letters, as shopkeepers write them).
const BY_PRODUCT_HINTS: Array<{ grain: string[]; hints: string[] }> = [
  { grain: ['paddy', 'dhan', 'rice', 'tandul', 'basmati'], hints: ['husk', 'bhusa', 'bran', 'konda', 'broken', 'khanda', 'tukda', 'polish'] },
  { grain: ['wheat', 'gahu', 'gehun', 'gehu'], hints: ['bran', 'chokar', 'chuni', 'bhusa', 'konda'] },
  { grain: ['bhagar', 'varai', 'vari', 'barnyard', 'samo'], hints: ['konda', 'bhusa', 'husk', 'bran', 'tukda'] },
  { grain: ['jowar', 'jwari', 'sorghum'], hints: ['bran', 'konda', 'bhusa', 'chuni'] },
  { grain: ['bajra', 'bajri', 'millet'], hints: ['bran', 'konda', 'bhusa', 'chuni'] },
  { grain: ['maize', 'makka', 'corn'], hints: ['bran', 'bhusa', 'chuni', 'husk'] },
  { grain: ['dal', 'tur', 'toor', 'moong', 'mung', 'udid', 'urad', 'chana', 'masoor', 'lentil'], hints: ['husk', 'chuni', 'bhusa', 'broken', 'khanda', 'cake'] },
  { grain: ['groundnut', 'shengdana', 'peanut', 'sesame', 'til', 'mustard', 'sunflower', 'soybean'], hints: ['cake', 'khal', 'husk', 'shell', 'pend', 'खळ'] },
];

// What each kind of raw material is milled / pressed INTO (the ready product), so "Dal" suggests Dal, a seed suggests Oil, wheat suggests Atta ...
// `grain` = words that identify the material, `hints` = words a ready-product name would contain, `label` = a name to offer when no such product exists yet.
const FINISHED_HINTS: Array<{ grain: string[]; hints: string[]; label: (raw: string) => string }> = [
  { grain: ['paddy', 'dhan', 'rice', 'tandul', 'basmati', 'धान', 'तांदूळ', 'चावल'], hints: ['rice', 'tandul', 'chawal', 'तांदूळ', 'चावल'], label: () => 'Rice' },
  { grain: ['wheat', 'gahu', 'gehun', 'gehu', 'गहू', 'गेहूं'], hints: ['atta', 'flour', 'maida', 'rava', 'sooji', 'suji', 'chakki', 'पीठ', 'आटा', 'रवा', 'मैदा'], label: () => 'Wheat Atta' },
  { grain: ['dal', 'dali', 'daal', 'tur', 'toor', 'arhar', 'moong', 'mung', 'udid', 'urad', 'chana', 'masoor', 'lentil', 'डाळ', 'दाल', 'तूर', 'मूग', 'उडीद', 'हरभरा'], hints: ['dal', 'daal', 'dali', 'besan', 'डाळ', 'दाल', 'बेसन'], label: (raw) => (/dal|daal|डाळ|दाल/i.test(raw) ? 'Dal' : `${raw} Dal`) },
  { grain: ['groundnut', 'shengdana', 'peanut', 'sesame', 'til', 'mustard', 'sarso', 'sunflower', 'soybean', 'soya', 'safflower', 'kardai', 'copra', 'coconut', 'seed', 'शेंगदाणा', 'तीळ', 'सोयाबीन', 'सरसों'], hints: ['oil', 'tel', 'तेल', 'तैल'], label: (raw) => (/oil|tel|तेल/i.test(raw) ? 'Oil' : `${raw} Oil`) },
  { grain: ['jowar', 'jwari', 'sorghum', 'ज्वारी'], hints: ['jowar', 'jwari', 'flour', 'pith', 'atta', 'पीठ', 'ज्वारी'], label: () => 'Jowar Flour' },
  { grain: ['bajra', 'bajri', 'बाजरी'], hints: ['bajra', 'bajri', 'flour', 'pith', 'atta', 'पीठ', 'बाजरी'], label: () => 'Bajra Flour' },
  { grain: ['maize', 'makka', 'corn', 'मका'], hints: ['corn', 'maize', 'makka', 'flour', 'grits', 'atta', 'मका'], label: () => 'Corn Flour' },
  { grain: ['bhagar', 'varai', 'vari', 'barnyard', 'samo', 'भगर'], hints: ['bhagar', 'varai', 'vari', 'भगर'], label: (raw) => `${raw} Grain` },
];

function groupsFor(materialName: string) {
  const toks = nameTokens(materialName);
  return FINISHED_HINTS.filter((g) => g.grain.some((w) => toks.some((t) => t === w || (t.length >= 3 && w.length >= 3 && (t.includes(w) || w.includes(t))))));
}

/** Words the ready product of this material would contain (dal -> "dal", seed -> "oil" / "tel" ...). */
export function finishedHints(materialName: string): string[] {
  const out = new Set<string>();
  for (const g of groupsFor(materialName)) g.hints.forEach((h) => out.add(h));
  return [...out];
}

/** A name worth offering when the ready product does not exist yet ("Dal", "Groundnut Oil" ...), or null when the material is not recognised. */
export function suggestedFinishedName(materialName: string): string | null {
  const raw = String(materialName || '').trim();
  const g = groupsFor(raw)[0];
  return g ? g.label(raw) : null;
}

export function byProductHints(materialName: string): string[] {
  const toks = nameTokens(materialName);
  const out = new Set<string>();
  for (const g of BY_PRODUCT_HINTS) if (g.grain.some((w) => toks.some((t) => t.includes(w) || w.includes(t)))) g.hints.forEach((h) => out.add(h));
  return [...out];
}

export type Ranked = { suggested: ProductLite[]; rest: ProductLite[] };

/**
 * Orders the product list for one output kind. `history` / `recipe` are product ids (best first). `materialName` / `materialProductId`
 * describe what went in. Suggested = every product with a reason to be there, best first (max 6); rest = everything else, A–Z.
 */
export function rankProducts(
  kind: OutKind,
  materialName: string,
  materialProductId: string | null,
  products: ProductLite[],
  history: string[] = [],
  recipe: string[] = [],
): Ranked {
  const toks = nameTokens(materialName);
  const hints = byProductHints(materialName);
  const finHints = finishedHints(materialName);
  const scored = products.map((p) => {
    let score = 0;
    // a by-product is never the material that went in (history can contain a test run that did exactly that)
    if (kind === 'by_product' && !!materialProductId && p.id === materialProductId) return { p, score: 0 };
    const hi = history.indexOf(p.id);
    if (hi >= 0) score += 1000 - hi;
    const ri = recipe.indexOf(p.id);
    if (ri >= 0) score += 500 - ri;
    const pname = p.name.toLowerCase();
    const nameMatch = toks.some((t) => pname.includes(t));
    const finMatch = finHints.some((h) => pname.includes(h));
    const isMaterial = !!materialProductId && p.id === materialProductId;
    if (kind === 'finished_good') {
      if (!isMaterial && nameMatch) score += 100;
      else if (!isMaterial && finMatch) score += 90;
      else if (!isMaterial && p.millCategory === 'finished_goods' && score === 0) score += 0;
    } else if (kind === 'by_product') {
      if (!isMaterial && p.millCategory === 'by_product' && hints.some((h) => pname.includes(h))) score += 80;
      else if (!isMaterial && hints.some((h) => pname.includes(h))) score += 40;
    } else {
      // WIP / rejected are made of the material itself (or its finished form)
      if (isMaterial) score += 60;
      else if (nameMatch || finMatch) score += 50;
    }
    return { p, score };
  });
  const suggested = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, 6).map((x) => x.p);
  const taken = new Set(suggested.map((s) => s.id));
  const rest = products.filter((p) => !taken.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { suggested, rest };
}

/** The rows to pre-fill once the material is known: one ready product, up to two by-products, one WIP, one rejected — products only, weights empty. */
export function defaultOutputPicks(
  materialName: string,
  materialProductId: string | null,
  products: ProductLite[],
  history: Partial<Record<OutKind, string[]>> = {},
  recipe: Partial<Record<OutKind, string[]>> = {},
): Array<{ kind: OutKind; productId: string }> {
  const pick = (kind: OutKind) => rankProducts(kind, materialName, materialProductId, products, history[kind] || [], recipe[kind] || []).suggested;
  const picks: Array<{ kind: OutKind; productId: string }> = [];
  const fin = pick('finished_good');
  picks.push({ kind: 'finished_good', productId: fin[0]?.id || '' });
  const bps = pick('by_product');
  if (bps.length === 0) picks.push({ kind: 'by_product', productId: '' });
  bps.slice(0, 2).forEach((b) => picks.push({ kind: 'by_product', productId: b.id }));
  picks.push({ kind: 'wip', productId: pick('wip')[0]?.id || '' });
  picks.push({ kind: 'rejection', productId: pick('rejection')[0]?.id || '' });
  return picks;
}
