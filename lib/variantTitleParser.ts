/**
 * Splits a product title that has its variant baked in
 * ("JAANZARA TG0968CD 36X40 PLAIN", "ZUNI & ZUNI 21069/A 22X32 COFFI") into
 * base name + size + colour so rows of the same model can be grouped into ONE
 * product with variants. Pure — used by the import preview and manual bulk entry;
 * the user always confirms/edits the suggestion, so this errs on "suggest".
 */

export type ParsedTitle = {
  baseName: string;
  size: string;
  color: string;
  /** high: size token + non-trivial remainder; medium: size only; low: nothing split */
  confidence: 'high' | 'medium' | 'low';
};

const DIM = /(?<![\w./-])(\d{1,3}(?:\.\d+)?)\s*[xX*]\s*(\d{1,3}(?:\.\d+)?)(?![\w])/;
const LETTER = /(?<![\w./-])(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|FREE\s*SIZE|FREE)(?![\w])\s*$/i;
const SIZE_WORD = /(?<![\w./-])(?:SIZE|SZ)\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?|XXS|XS|S|M|L|XL|XXL|XXXL)(?![\w])/i;

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());

const clean = (s: string) => s.replace(/[\s,;:|/-]+$/g, '').replace(/^[\s,;:|/-]+/g, '').replace(/\s+/g, ' ').trim();

export function parseVariantTitle(name: string): ParsedTitle {
  const raw = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return { baseName: '', size: '', color: '', confidence: 'low' };

  // 1) dimension size (36X40) — everything before = base, everything after = colour/design
  const dim = raw.match(DIM);
  if (dim && dim.index !== undefined) {
    const before = clean(raw.slice(0, dim.index));
    const after = clean(raw.slice(dim.index + dim[0].length));
    if (before) {
      const size = `${dim[1]}X${dim[2]}`;
      return { baseName: before, size, color: after ? titleCase(after) : '', confidence: after.length > 2 ? 'high' : 'medium' };
    }
  }

  // 2) "Size 40" / "Sz M"
  const sw = raw.match(SIZE_WORD);
  if (sw && sw.index !== undefined) {
    const before = clean(raw.slice(0, sw.index));
    const after = clean(raw.slice(sw.index + sw[0].length));
    if (before) return { baseName: before, size: sw[1].toUpperCase(), color: after ? titleCase(after) : '', confidence: 'medium' };
  }

  // 3) trailing letter size (Cotton Shirt Red L)
  const lt = raw.match(LETTER);
  if (lt && lt.index !== undefined && lt.index > 0) {
    const before = clean(raw.slice(0, lt.index));
    if (before) return { baseName: before, size: lt[1].toUpperCase().replace(/\s+/g, ' '), color: '', confidence: 'medium' };
  }

  return { baseName: raw, size: '', color: '', confidence: 'low' };
}

/** Grouping key: same brand+model ⇒ same product. Case/space/punctuation-insensitive. */
export function baseKey(baseName: string): string {
  return String(baseName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export type GroupableRow = { name: string; color?: string; size?: string; [k: string]: any };
export type RowGroup<T extends GroupableRow> = {
  key: string;
  baseName: string;
  rows: Array<T & { _color: string; _size: string; _parsed: ParsedTitle }>;
};

/**
 * Groups rows by parsed base name. A row's own Colour/Size column beats the parsed value.
 * Rows that don't parse (confidence 'low') each become their own single-row group.
 */
export function groupRowsByBase<T extends GroupableRow>(rows: T[]): RowGroup<T>[] {
  const groups = new Map<string, RowGroup<T>>();
  rows.forEach((row, idx) => {
    const parsed = parseVariantTitle(row.name);
    const key = parsed.confidence === 'low' ? `__single_${idx}` : baseKey(parsed.baseName);
    const g = groups.get(key) || { key, baseName: parsed.baseName, rows: [] };
    g.rows.push({
      ...row,
      _color: String(row.color ?? '').trim() || parsed.color,
      _size: String(row.size ?? '').trim() || parsed.size,
      _parsed: parsed,
    });
    groups.set(key, g);
  });
  return [...groups.values()];
}
