/**
 * Printer profiles + physical-print settings for barcode/QR labels.
 *
 * The core idea: a shopkeeper sets the physical label size and their printer
 * DPI ONCE, saves it as a named profile, and every future print uses those
 * dimensions — no per-print guesswork, no accidental browser/OS scaling
 * changing the output size. The print engine (lib/printLabels.ts) then
 * converts every dimension in this profile from millimetres to whatever
 * unit the target renderer needs (`@page size: Wmm Hmm; margin: 0`, raster
 * pixels via `px = mm × DPI / 25.4`), so a label declared 50 × 30 mm
 * actually comes out 50 × 30 mm on paper regardless of printer make.
 *
 * Profiles are per-shop (keyed by shopId) and stored in localStorage — no
 * migration needed, offline-safe, and never travels between shops on the
 * same browser. Legacy calls that don't pass a profile continue to work
 * (see DEFAULT_PROFILE + printLabels.ts fallback), so nothing existing
 * breaks.
 */

import { estimateModules, autoDetectFormat } from './barcodeValidation';

export type BarcodeType = 'auto' | 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';
export type QRErrorLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * The four physically-distinct output modes the client's spec (section 1A)
 * calls out. This is orthogonal to the size preset: it decides which
 * RENDERER runs, not what size the label is.
 *   - 'a4-sheet'      → many small labels tiled on one A4 page (Avery-style
 *                        label sheets). Uses the grid engine + `sheet` below.
 *   - 'a4-plain'      → same grid engine, but on plain A4 with cut guides
 *                        (scissors-and-glue). Identical geometry to a4-sheet;
 *                        only the hairline cut border differs.
 *   - 'thermal-sticker' → one label per physical die-cut sticker (fixed
 *                        width × height page, one sticker advanced per print).
 *   - 'thermal-roll'  → continuous roll (fixed width, content-driven height).
 * Older saved profiles predate this field; normalizeProfile() derives a
 * sensible value from their `preset` so nothing breaks. */
export type PrintType = 'a4-sheet' | 'a4-plain' | 'thermal-sticker' | 'thermal-roll';

/** Barcode/label rotation in degrees. 90/270 print the barcode sideways —
 *  common on narrow continuous roll where a horizontal code won't fit the
 *  width but a vertical one will. */
export type Rotation = 0 | 90 | 180 | 270;
export type LabelSizePresetKey =
  | 'a4'
  | 'thermal58'
  | 'thermal80'
  | 'label40x20'
  | 'label40x30'
  | 'label50x25'
  | 'label50x30'
  | 'label60x30'
  | 'label70x40'
  | 'label100x50'
  | 'custom';

/**
 * Fields the label can display alongside the barcode/QR. Every ON/OFF
 * matches a section 7 field the client called out. Kept as a flat map so
 * new fields can be added without a schema migration.
 */
export interface LabelFieldFlags {
  productName: boolean;
  sku: boolean;
  barcodeNumber: boolean;
  sellingPrice: boolean;
  mrp: boolean;
  variant: boolean;
  size: boolean;
  colour: boolean;
  shopName: boolean;
  customText: boolean;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * A4 (or A4-landscape) multi-label sheet layout. All in millimetres.
 * The grid engine (labelRenderer.generateA4SheetPdf) tiles `columns × rows`
 * labels per page, positioned purely from page-size + margins + gaps + label
 * size — never hard-coded coordinates — so any label-sheet stationery can be
 * matched exactly. Each cell is then rendered by the SAME single-label layout
 * engine, so a cell on an A4 sheet looks identical to a standalone sticker.
 */
export interface A4SheetConfig {
  orientation: 'portrait' | 'landscape';
  columns: number;
  rows: number;
  /** Physical size of ONE label cell. */
  labelWidthMm: number;
  labelHeightMm: number;
  /** Gaps BETWEEN adjacent labels (not the page edge). */
  gapXMm: number;
  gapYMm: number;
  /** Page edge → first label. */
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

/**
 * Complete printer profile — all dimensions in millimetres, all
 * calibration values as percentages (100 = no adjustment).
 */
export interface PrinterProfile {
  id: string;
  name: string;
  /** Which physical renderer runs. Optional for backward-compat with saved
   *  profiles that predate it — normalizeProfile() fills it from `preset`. */
  printType?: PrintType;
  preset: LabelSizePresetKey;
  /** Physical label / paper size in mm. Height 0 = "roll paper, height =
   *  content" (thermal receipt printers advance the roll per print). */
  labelWidthMm: number;
  labelHeightMm: number;
  /** Printer resolution — used only when a raster fallback is needed. 0 =
   *  auto (browser decides). Most thermal label printers are 203; some are
   *  300; office lasers 600. */
  dpi: 0 | 203 | 300 | 600;
  /** Barcode symbology. 'auto' = pick from the value (detectBarcodeFormat). */
  barcodeType: BarcodeType;
  /** Physical barcode dimensions in mm. When autoFit is true these are
   *  ignored and the engine calculates the biggest safe size. */
  barcodeWidthMm: number;
  barcodeHeightMm: number;
  /** Quiet zone in mm — required white margin around a barcode for it to
   *  scan reliably. Auto (undefined → 2mm) is safe for CODE128; EAN/UPC
   *  need at least 3mm. */
  quietZoneMm: number;
  autoFit: boolean;
  /** QR side length in mm. QR is always square. */
  qrSizeMm: number;
  qrErrorLevel: QRErrorLevel;
  fields: LabelFieldFlags;
  /** Caption shown before the selling price on the label (e.g. "Offer",
   *  "Rate", "Price"). Empty → just the ₹ amount. Lets a shopkeeper brand
   *  the selling line as an offer. Optional for backward-compat. MRP always
   *  prints with the fixed "MRP" caption. */
  sellingPriceLabel?: string;
  /** Font size (pt) for the SELLING / offer price line specifically — bigger
   *  than the body so the offer rate stands out. Undefined → fontSizePt + 2. */
  priceFontSizePt?: number;
  /** Put the selling/offer price ABOVE the barcode instead of below. */
  pricePosition?: 'above' | 'below';
  /** Per-element font sizes — each row on the label can be independently sized
   *  so the shopkeeper isn't stuck making everything the same size just to make
   *  ONE thing bigger. Undefined → derives from `fontSizePt`. */
  mrpFontSizePt?: number;
  headerFontSizePt?: number;         // Shop Name (line 1) — line 2 is line1-2
  productNameFontSizePt?: number;    // Product Name row
  variantFontSizePt?: number;        // Combined Variant / Size / Colour row
  barcodeNumberFontSizePt?: number;  // Digits printed under the bars
  /** Currency prefix printed before every price on the label. jsPDF's built-in
   *  Helvetica has no ₹ glyph, so past labels showed "INR" — the shopkeeper
   *  called that ugly. Default empty (just the number, MRP / Offer captions
   *  already tell the reader it's a price); shopkeepers who want "Rs." or "₹"
   *  can flip it here. */
  currencyPrefix?: string;
  /** Whether the MRP line prints with a strikethrough ("cut price") line
   *  through it. Default true — matches the traditional retail-label look
   *  where MRP is always struck. A shopkeeper who just wants to SHOW the
   *  MRP number (e.g. no discount being advertised, or the label's own
   *  design already communicates that) can switch it off for a plain MRP
   *  line. Only affects MRP — the Selling/Offer line never strikes either
   *  way. */
  mrpStrikethrough?: boolean;
  /** Custom-text (promo note) styling + placement — independent of the rest
   *  so a shopkeeper can make it big/bold and drop it wherever they want. */
  customTextFontSizePt?: number;
  customTextBold?: boolean;
  customTextAlign?: 'left' | 'center' | 'right';
  customTextPosition?: 'above' | 'below';
  fontSizePt: number;         // point size for label text (1pt ≈ 0.353 mm)
  fontWeight: 'normal' | 'medium' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  textPosition: 'above' | 'below';
  spacingMm: number;          // vertical gap between text and barcode
  positionH: 'left' | 'center' | 'right';
  positionV: 'top' | 'center' | 'bottom';
  offsetXMm: number;
  offsetYMm: number;
  /** Barcode/label rotation. Optional for backward-compat (defaults to 0). */
  rotation?: Rotation;
  /** A4 multi-label sheet layout. Only consumed when printType is
   *  'a4-sheet' / 'a4-plain'. Optional for backward-compat — normalizeProfile
   *  fills a sensible default. */
  sheet?: A4SheetConfig;
  margins: Margins;
  /** Per-axis scale correction. 100 = untouched. Range 90–110 to keep tiny
   *  driver-side inaccuracies from becoming ridiculous. Applied ONLY to
   *  the label print layout — bills/invoices are never affected. */
  scaleH: number;
  scaleV: number;
  createdAt: number;
  updatedAt: number;
}

/** Preset dimensions for the picker. Keeps the modal UI declarative. */
export interface LabelSizePreset {
  key: LabelSizePresetKey;
  label: string;
  widthMm: number;
  heightMm: number;
  group: 'thermal' | 'label' | 'a4' | 'custom';
}

export const LABEL_PRESETS: LabelSizePreset[] = [
  { key: 'thermal58',  label: '58 mm Receipt',        widthMm: 58,  heightMm: 0,  group: 'thermal' },
  { key: 'thermal80',  label: '80 mm Receipt',        widthMm: 80,  heightMm: 0,  group: 'thermal' },
  { key: 'label40x20', label: '40 × 20 mm Label',     widthMm: 40,  heightMm: 20, group: 'label'   },
  { key: 'label40x30', label: '40 × 30 mm Label',     widthMm: 40,  heightMm: 30, group: 'label'   },
  { key: 'label50x25', label: '50 × 25 mm Label',     widthMm: 50,  heightMm: 25, group: 'label'   },
  { key: 'label50x30', label: '50 × 30 mm Label',     widthMm: 50,  heightMm: 30, group: 'label'   },
  { key: 'label60x30', label: '60 × 30 mm Label',     widthMm: 60,  heightMm: 30, group: 'label'   },
  { key: 'label70x40', label: '70 × 40 mm Label',     widthMm: 70,  heightMm: 40, group: 'label'   },
  { key: 'label100x50', label: '100 × 50 mm Label',   widthMm: 100, heightMm: 50, group: 'label'   },
  { key: 'a4',         label: 'A4 Barcode Sheet',     widthMm: 210, heightMm: 297, group: 'a4'     },
  { key: 'custom',     label: 'Custom Size…',         widthMm: 50,  heightMm: 30, group: 'custom'  },
];

export function getPreset(key: LabelSizePresetKey): LabelSizePreset {
  return LABEL_PRESETS.find(p => p.key === key) || LABEL_PRESETS[0];
}

/**
 * Safe defaults for a fresh 50 × 30 mm label printer — the middle-of-the-
 * road small-label printer most footwear/apparel shops start with. Every
 * profile is derived from this + user tweaks.
 */
/**
 * A4 page dimensions in mm. Landscape simply swaps the two.
 */
export const A4_PORTRAIT = { widthMm: 210, heightMm: 297 } as const;

/**
 * Default A4 label-sheet grid — 3 columns × 8 rows on portrait A4 with 8 mm
 * page margins and 2 mm gaps. The label size below is the exact result of
 * fitSheetLabels() for this grid; it's written as a literal (not a function
 * call) so this module has no init-time function dependency. fitSheetLabels()
 * recomputes it whenever the shopkeeper changes columns/rows/margins/gaps.
 *   usableW = 210 − 8 − 8 − 2×2 = 190 → 190/3 = 63.3 mm
 *   usableH = 297 − 8 − 8 − 2×7 = 267 → 267/8 = 33.3 mm
 */
export const DEFAULT_SHEET: A4SheetConfig = {
  orientation: 'portrait',
  columns: 3,
  rows: 8,
  labelWidthMm: 63.3,
  labelHeightMm: 33.3,
  gapXMm: 2,
  gapYMm: 2,
  marginTopMm: 8,
  marginBottomMm: 8,
  marginLeftMm: 8,
  marginRightMm: 8,
};

export const DEFAULT_PROFILE: PrinterProfile = {
  id: 'default',
  name: 'Default (50 × 30 mm)',
  printType: 'thermal-sticker',
  rotation: 0,
  sheet: DEFAULT_SHEET,
  preset: 'label50x30',
  labelWidthMm: 50,
  labelHeightMm: 30,
  dpi: 0,
  barcodeType: 'auto',
  barcodeWidthMm: 38,
  barcodeHeightMm: 12,
  quietZoneMm: 2,
  autoFit: true,
  qrSizeMm: 20,
  qrErrorLevel: 'M',
  fields: {
    productName: true,
    sku: false,
    barcodeNumber: true,
    sellingPrice: true,
    mrp: true,
    variant: true,
    size: true,
    colour: true,
    shopName: true,
    customText: false,
  },
  sellingPriceLabel: 'Rate',
  priceFontSizePt: 10,
  pricePosition: 'below',
  mrpFontSizePt: 8,
  headerFontSizePt: 9,
  productNameFontSizePt: 8,
  variantFontSizePt: 7,
  barcodeNumberFontSizePt: 7,
  currencyPrefix: '',
  mrpStrikethrough: true,
  customTextFontSizePt: 8,
  customTextBold: false,
  customTextAlign: 'center',
  customTextPosition: 'below',
  fontSizePt: 7,
  fontWeight: 'bold',
  textAlign: 'center',
  textPosition: 'above',
  spacingMm: 1,
  positionH: 'center',
  positionV: 'center',
  offsetXMm: 0,
  offsetYMm: 0,
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  scaleH: 100,
  scaleV: 100,
  createdAt: 0,
  updatedAt: 0,
};

/**
 * Recommended defaults for each preset — tuned per common label size so
 * "Reset to Recommended" gives a working starting point without the user
 * having to tune barcode dimensions by hand. Values below come from real
 * thermal-label printer manuals (Zebra/TSC/Postek) for common label
 * stocks, not guesses.
 */
export function recommendedForPreset(key: LabelSizePresetKey): Partial<PrinterProfile> {
  switch (key) {
    case 'thermal58':  return { labelWidthMm: 58, labelHeightMm: 0,  barcodeWidthMm: 48, barcodeHeightMm: 14, qrSizeMm: 22, fontSizePt: 8, autoFit: true };
    case 'thermal80':  return { labelWidthMm: 80, labelHeightMm: 0,  barcodeWidthMm: 66, barcodeHeightMm: 18, qrSizeMm: 28, fontSizePt: 9, autoFit: true };
    // Font sizes tuned per label physical width: 6pt is only readable on
    // the tiniest 40×20 stickers; anything 50mm+ can carry 8-9pt cleanly.
    // Client feedback: "text want correctly normal size for easy visible
    // text for read its title, size and variant properly" — small text on
    // a 60mm label looked cramped even though it technically fit.
    case 'label40x20': return { labelWidthMm: 40, labelHeightMm: 20, barcodeWidthMm: 32, barcodeHeightMm: 7,  qrSizeMm: 14, fontSizePt: 7,  autoFit: true };
    case 'label40x30': return { labelWidthMm: 40, labelHeightMm: 30, barcodeWidthMm: 32, barcodeHeightMm: 12, qrSizeMm: 18, fontSizePt: 8,  autoFit: true };
    case 'label50x25': return { labelWidthMm: 50, labelHeightMm: 25, barcodeWidthMm: 40, barcodeHeightMm: 10, qrSizeMm: 16, fontSizePt: 8,  autoFit: true };
    case 'label50x30': return { labelWidthMm: 50, labelHeightMm: 30, barcodeWidthMm: 40, barcodeHeightMm: 12, qrSizeMm: 20, fontSizePt: 8,  autoFit: true };
    case 'label60x30': return { labelWidthMm: 60, labelHeightMm: 30, barcodeWidthMm: 48, barcodeHeightMm: 14, qrSizeMm: 22, fontSizePt: 9,  autoFit: true };
    case 'label70x40': return { labelWidthMm: 70, labelHeightMm: 40, barcodeWidthMm: 56, barcodeHeightMm: 18, qrSizeMm: 28, fontSizePt: 10, autoFit: true };
    case 'label100x50':return { labelWidthMm: 100, labelHeightMm: 50, barcodeWidthMm: 80, barcodeHeightMm: 22, qrSizeMm: 36, fontSizePt: 12, autoFit: true };
    case 'a4':         return { labelWidthMm: 210, labelHeightMm: 297, barcodeWidthMm: 40, barcodeHeightMm: 12, qrSizeMm: 20, fontSizePt: 8, autoFit: true };
    case 'custom':     return {};
  }
}

/** Build a fresh profile from a preset. UI uses this when the shopkeeper
 *  picks a size from the preset picker. */
export function profileFromPreset(preset: LabelSizePresetKey, name?: string): PrinterProfile {
  const p = getPreset(preset);
  const rec = recommendedForPreset(preset);
  const now = Date.now();
  return {
    ...DEFAULT_PROFILE,
    id: `prof-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name || `${p.label} Printer`,
    preset,
    labelWidthMm: p.widthMm,
    labelHeightMm: p.heightMm,
    ...rec,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── A4 label-sheet grid ───────────────────────────────────────────────────

export interface A4SheetPreset {
  key: string;
  label: string;
  columns: number;
  rows: number;
  orientation: 'portrait' | 'landscape';
}

/** Common label-sheet grids from the client spec (section 2). Label sizes
 *  are derived to fill the page (fitSheetLabels) so they always tile cleanly
 *  — the shopkeeper picks the grid, we compute the geometry. */
export const A4_SHEET_PRESETS: A4SheetPreset[] = [
  { key: '2x7',  label: '2 × 7 (14/sheet)',  columns: 2, rows: 7,  orientation: 'portrait' },
  { key: '2x10', label: '2 × 10 (20/sheet)', columns: 2, rows: 10, orientation: 'portrait' },
  { key: '3x8',  label: '3 × 8 (24/sheet)',  columns: 3, rows: 8,  orientation: 'portrait' },
  { key: '3x10', label: '3 × 10 (30/sheet)', columns: 3, rows: 10, orientation: 'portrait' },
  { key: '4x8',  label: '4 × 8 (32/sheet)',  columns: 4, rows: 8,  orientation: 'portrait' },
];

/** Page size (mm) for a sheet's chosen orientation. */
export function sheetPageSize(sheet: A4SheetConfig): { widthMm: number; heightMm: number } {
  return sheet.orientation === 'landscape'
    ? { widthMm: A4_PORTRAIT.heightMm, heightMm: A4_PORTRAIT.widthMm }
    : { widthMm: A4_PORTRAIT.widthMm, heightMm: A4_PORTRAIT.heightMm };
}

/**
 * Recompute labelWidthMm/labelHeightMm so `columns × rows` labels fill the
 * page evenly given the current margins + gaps. Called when the shopkeeper
 * picks a grid preset or changes count/margins/gaps — guarantees the labels
 * always tile without overflowing (the exact "never allow overflow into the
 * next label" requirement). Returns a NEW config; never mutates the input.
 */
export function fitSheetLabels(sheet: A4SheetConfig): A4SheetConfig {
  const page = sheetPageSize(sheet);
  const cols = Math.max(1, Math.floor(sheet.columns));
  const rows = Math.max(1, Math.floor(sheet.rows));
  const usableW = page.widthMm - sheet.marginLeftMm - sheet.marginRightMm - sheet.gapXMm * (cols - 1);
  const usableH = page.heightMm - sheet.marginTopMm - sheet.marginBottomMm - sheet.gapYMm * (rows - 1);
  return {
    ...sheet,
    columns: cols,
    rows,
    labelWidthMm: Math.max(10, Math.floor((usableW / cols) * 10) / 10),
    labelHeightMm: Math.max(8, Math.floor((usableH / rows) * 10) / 10),
  };
}

/** Top-left (x,y) mm origin of every cell on the sheet, row-major. Positions
 *  are computed purely from page + margins + gaps + label size — no
 *  hard-coded coordinates. Cells that would spill past the page edge are
 *  dropped so a bad custom config can never print a clipped half-label. */
export function computeSheetGeometry(sheet: A4SheetConfig): {
  page: { widthMm: number; heightMm: number };
  cells: Array<{ x: number; y: number }>;
  perPage: number;
} {
  const page = sheetPageSize(sheet);
  const cells: Array<{ x: number; y: number }> = [];
  const cols = Math.max(1, Math.floor(sheet.columns));
  const rows = Math.max(1, Math.floor(sheet.rows));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = sheet.marginLeftMm + c * (sheet.labelWidthMm + sheet.gapXMm);
      const y = sheet.marginTopMm + r * (sheet.labelHeightMm + sheet.gapYMm);
      // Guard: keep only cells that fully fit on the physical page.
      if (x + sheet.labelWidthMm <= page.widthMm + 0.5 && y + sheet.labelHeightMm <= page.heightMm + 0.5) {
        cells.push({ x, y });
      }
    }
  }
  return { page, cells, perPage: cells.length };
}

// ─── Normalization + duplication (backward compat) ─────────────────────────

/** Derive a PrintType for a profile that predates the field, from its size
 *  preset. Keeps old saved profiles behaving sensibly. */
function derivePrintType(p: PrinterProfile): PrintType {
  if (p.preset === 'a4') return 'a4-sheet';
  if (p.preset === 'thermal58' || p.preset === 'thermal80') return 'thermal-roll';
  if (p.preset === 'custom') return p.labelHeightMm <= 0 ? 'thermal-roll' : 'thermal-sticker';
  return 'thermal-sticker';
}

/**
 * Fill any fields a stored profile is missing (printType, rotation, sheet)
 * with safe defaults so profiles saved before these features load cleanly.
 * Pure — returns a new object, never mutates localStorage.
 */
export function normalizeProfile(p: PrinterProfile): PrinterProfile {
  return {
    ...p,
    printType: p.printType ?? derivePrintType(p),
    rotation: p.rotation ?? 0,
    sheet: p.sheet ?? { ...DEFAULT_SHEET },
    sellingPriceLabel: p.sellingPriceLabel ?? 'Rate',
  };
}

/** Deep-copy a profile under a new id + name for the "Duplicate" action. */
export function duplicateProfile(p: PrinterProfile): PrinterProfile {
  const now = Date.now();
  return {
    ...normalizeProfile(p),
    id: `prof-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${p.name} (copy)`,
    sheet: p.sheet ? { ...p.sheet } : { ...DEFAULT_SHEET },
    margins: { ...p.margins },
    fields: { ...p.fields },
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Storage (per-shop localStorage) ───────────────────────────────────────

/**
 * localStorage keys are prefixed with the shop id so two shops on the same
 * browser (a multi-shop admin, a shared computer) never see each other's
 * printer profiles. Falls back gracefully during SSR by using an in-memory
 * store — Next.js will re-hydrate on the client with the real data.
 */
const memoryStore = new Map<string, string>();
function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}
function storageKey(shopId: string): string { return `ks_print_profiles_${shopId}`; }
function activeKey(shopId: string): string { return `ks_active_print_profile_${shopId}`; }
function readRaw(key: string): string | null {
  const ls = safeLocalStorage();
  return ls ? ls.getItem(key) : (memoryStore.get(key) ?? null);
}
function writeRaw(key: string, value: string): void {
  const ls = safeLocalStorage();
  if (ls) ls.setItem(key, value); else memoryStore.set(key, value);
}

export function listProfiles(shopId: string): PrinterProfile[] {
  if (!shopId) return [];
  const raw = readRaw(storageKey(shopId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Upgrade any pre-feature profiles in-memory so callers always get a
    // fully-populated profile (printType/rotation/sheet present).
    return (arr as PrinterProfile[]).map(normalizeProfile);
  } catch { return []; }
}

export function saveProfile(shopId: string, profile: PrinterProfile): PrinterProfile {
  const all = listProfiles(shopId);
  const idx = all.findIndex(p => p.id === profile.id);
  const now = Date.now();
  const next: PrinterProfile = { ...profile, updatedAt: now, createdAt: profile.createdAt || now };
  if (idx >= 0) all[idx] = next; else all.push(next);
  writeRaw(storageKey(shopId), JSON.stringify(all));
  return next;
}

export function deleteProfile(shopId: string, profileId: string): void {
  const all = listProfiles(shopId).filter(p => p.id !== profileId);
  writeRaw(storageKey(shopId), JSON.stringify(all));
  const active = getActiveProfileId(shopId);
  if (active === profileId) setActiveProfileId(shopId, null);
}

export function getActiveProfileId(shopId: string): string | null {
  return readRaw(activeKey(shopId));
}

export function setActiveProfileId(shopId: string, id: string | null): void {
  const ls = safeLocalStorage();
  if (id === null) {
    if (ls) ls.removeItem(activeKey(shopId)); else memoryStore.delete(activeKey(shopId));
  } else {
    writeRaw(activeKey(shopId), id);
  }
}

/** Resolve the profile a print job should use RIGHT NOW: the active
 *  profile if set and still exists, otherwise the most-recently-updated
 *  one, otherwise the built-in default. */
export function resolveActiveProfile(shopId: string): PrinterProfile {
  const all = listProfiles(shopId);
  const activeId = getActiveProfileId(shopId);
  if (activeId) {
    const hit = all.find(p => p.id === activeId);
    if (hit) return hit;
  }
  if (all.length) return [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return normalizeProfile({ ...DEFAULT_PROFILE });
}

// ─── Unit conversion + physical accuracy helpers ───────────────────────────

/** Millimetres → pixels at a given DPI. `px = mm × DPI / 25.4` — used
 *  wherever a raster fallback is required (canvas exports, PNG downloads).
 *  For SVG vector paths, use `mm` units directly and let the print engine
 *  translate. */
export function mmToPx(mm: number, dpi: number): number {
  const useDpi = dpi > 0 ? dpi : 96; // browser default CSS px is 96 DPI
  return (mm * useDpi) / 25.4;
}

/** Points → millimetres (1 pt = 1/72 in = 0.3527 mm). Used to convert
 *  fontSizePt into mm-based print CSS when preview needs it. */
export function ptToMm(pt: number): number {
  return pt * 0.3527777778;
}

// ─── Auto-fit calculator ───────────────────────────────────────────────────

/** Target module (thinnest-bar) width in mm used to size a barcode from its
 *  OWN content length — not the label's available width. 0.33mm matches the
 *  standard "100% magnification" X-dimension real barcode software (Zebra
 *  Designer, BarTender) uses for CODE128/EAN/UPC/CODE39, comfortably above
 *  the 0.25mm reliable-scan floor `validateBarcode` warns below. */
const SAFE_MODULE_WIDTH_MM = 0.33;

/**
 * Given a profile (and, when known, the actual barcode value about to be
 * printed) return the barcode size that fits safely. Height still comes
 * from the label's own available vertical space (see below). Width now
 * comes from the BARCODE'S OWN content length at a constant, scannable
 * module width — capped to what the label can physically hold — rather
 * than always stretching every barcode to fill the label.
 *
 * Why: the old behaviour forced every barcode to the exact same physical
 * width regardless of content. A short value (e.g. "6868", ~4 chars) got
 * stretched into unnaturally fat bars, while a long one (e.g. a generated
 * "PRD-84C9BADF-WHITE-XXL" variant code, ~20+ chars) got squeezed into that
 * SAME width, driving its module width down toward — or below — the
 * reliable-scan floor ("barcode lines is too much so its barcode make to
 * big" — the shopkeeper's own words for bars becoming too dense/thin).
 * Real barcode-label software never stretches bars to fill a box; it keeps
 * module width constant and lets the total width vary with content,
 * centering the result — that's what this now does.
 *
 * Called only when profile.autoFit is true — a shopkeeper who tuned
 * dimensions by hand keeps their tuned values.
 */
export function autoFitBarcode(profile: PrinterProfile, barcodeValue?: string): { widthMm: number; heightMm: number } {
  const innerW = profile.labelWidthMm - profile.margins.left - profile.margins.right;
  // Roll paper: height is unbounded; use a comfortable default proportional to width.
  const innerH = profile.labelHeightMm > 0
    ? profile.labelHeightMm - profile.margins.top - profile.margins.bottom
    : Math.max(15, profile.labelWidthMm * 0.4);

  // Reserve height for EVERY enabled text line, not just an approximate
  // "one line per group". Client reported: on 58mm receipt + 70×40 label,
  // the bottom of the label ("INR 999" / barcode number) was being cropped
  // because the old estimate counted 3 lines when the layout was actually
  // producing 5 (shopName1, shopName2, productName, variantLine, barcode
  // number, price). autoFit under-reserved space → barcode was too tall
  // → text spilled off the page.
  const linesReserveMm = reserveHeightForLines(profile);
  const quietZoneReserveMm = 2 * profile.quietZoneMm;
  // Two `spacingMm` gaps between text-block ↔ barcode ↔ text-block.
  const gapsReserveMm = 2 * profile.spacingMm;
  const nonBarcodeReserveMm = linesReserveMm + quietZoneReserveMm + gapsReserveMm;

  const maxWidthMm = Math.max(10, innerW - 2 * profile.quietZoneMm);
  let widthMm = maxWidthMm;
  if (barcodeValue) {
    const format = profile.barcodeType === 'auto'
      ? autoDetectFormat(barcodeValue)
      : (profile.barcodeType === 'CODE39' ? 'CODE39' : profile.barcodeType);
    const modules = estimateModules(barcodeValue, format);
    const naturalWidthMm = modules * SAFE_MODULE_WIDTH_MM;
    widthMm = Math.max(10, Math.min(naturalWidthMm, maxWidthMm));
  }
  // If the label is genuinely too small for all enabled lines + barcode,
  // clamp barcode to the 6mm minimum and let downstream drop lower-priority
  // lines rather than silently overflowing off the physical page.
  const heightMm = Math.max(6, Math.min(profile.barcodeHeightMm, innerH - nonBarcodeReserveMm));
  return { widthMm, heightMm };
}

/**
 * Estimated total vertical space (mm) all enabled text lines will take.
 * Kept in sync with the line list computeLabelLayout() actually emits —
 * each `fields.*` toggle here corresponds to a real .lines.push() there.
 */
function reserveHeightForLines(profile: PrinterProfile): number {
  const line = (ptSize: number) => ptToMm(ptSize) * 1.3;
  const f = profile.fields;
  let mm = 0;
  // Shop-name header block accounts for BOTH lines when shopName is on
  // and the caller (settings modal or bulk print) actually supplies text.
  // We can't know at autoFit time whether both lines are non-empty, so
  // assume the worst case (both used) — better to over-reserve by a mm or
  // two than under-reserve and clip.
  if (f.shopName) {
    mm += line(profile.headerFontSizePt ?? (profile.fontSizePt + 1)); // header1
    mm += line(Math.max(6, profile.fontSizePt - 1)); // header2
  }
  // Product name — one line, at its own (possibly overridden) font size.
  if (f.productName) mm += line(profile.productNameFontSizePt ?? profile.fontSizePt);
  // Variant / size / colour — one combined line, own font size.
  if (f.variant || f.size || f.colour) mm += line(Math.max(6, profile.variantFontSizePt ?? (profile.fontSizePt - 1)));
  // Barcode-number line rendered ONCE below the bars whenever barcodeNumber
  // is on. Was completely missing from the old reserve calc.
  if (f.barcodeNumber) mm += line(Math.max(6, profile.barcodeNumberFontSizePt ?? (profile.fontSizePt - 1)));
  // Custom text (promo note) — one line at its own (possibly bigger) size.
  if (f.customText) mm += line(Math.max(6, profile.customTextFontSizePt ?? profile.fontSizePt));
  // Price + MRP — each on its OWN line (both can show). Selling/MRP each use
  // their own (possibly bigger) font so autofit reserves enough space.
  if (f.mrp) mm += line(Math.max(6, profile.mrpFontSizePt ?? (profile.fontSizePt - 1)));
  if (f.sellingPrice) mm += line(Math.max(6, profile.priceFontSizePt ?? (profile.fontSizePt + 2)));
  return mm;
}

/** How many text lines the label will render — used by autoFit to reserve
 *  the right amount of vertical space so autofit never overlaps text.
 *  Kept for backwards compatibility; prefer reserveHeightForLines above. */
export function countTextLines(profile: PrinterProfile): number {
  const f = profile.fields;
  let n = 0;
  if (f.shopName) n += 2; // header1 + header2
  if (f.productName) n += 1;
  if (f.variant || f.size || f.colour) n += 1;
  if (f.barcodeNumber) n += 1;
  if (f.mrp) n += 1;
  if (f.sellingPrice) n += 1;
  if (f.customText) n += 1;
  return n;
}
