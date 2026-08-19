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

export type BarcodeType = 'auto' | 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';
export type QRErrorLevel = 'L' | 'M' | 'Q' | 'H';
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
 * Complete printer profile — all dimensions in millimetres, all
 * calibration values as percentages (100 = no adjustment).
 */
export interface PrinterProfile {
  id: string;
  name: string;
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
  fontSizePt: number;         // point size for label text (1pt ≈ 0.353 mm)
  fontWeight: 'normal' | 'medium' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  textPosition: 'above' | 'below';
  spacingMm: number;          // vertical gap between text and barcode
  positionH: 'left' | 'center' | 'right';
  positionV: 'top' | 'center' | 'bottom';
  offsetXMm: number;
  offsetYMm: number;
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
export const DEFAULT_PROFILE: PrinterProfile = {
  id: 'default',
  name: 'Default (50 × 30 mm)',
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
    mrp: false,
    variant: true,
    size: true,
    colour: true,
    shopName: false,
    customText: false,
  },
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
    return arr as PrinterProfile[];
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
  return { ...DEFAULT_PROFILE };
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

/**
 * Given a profile and the label's physical inner box (label minus
 * margins), return the biggest barcode/QR that fits safely. The returned
 * dimensions respect the profile's quiet zone + a small headroom for the
 * text label the user asked to print above/below.
 *
 * Called only when profile.autoFit is true — a shopkeeper who tuned
 * dimensions by hand keeps their tuned values.
 */
export function autoFitBarcode(profile: PrinterProfile): { widthMm: number; heightMm: number } {
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

  const widthMm = Math.max(10, innerW - 2 * profile.quietZoneMm);
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
    mm += line(profile.fontSizePt + 1); // header1
    mm += line(Math.max(6, profile.fontSizePt - 1)); // header2
  }
  // Product name — one line, at the profile's own font size.
  if (f.productName) mm += line(profile.fontSizePt);
  // Variant / size / colour — one combined line.
  if (f.variant || f.size || f.colour) mm += line(Math.max(6, profile.fontSizePt - 1));
  // Barcode-number line rendered ONCE below the bars whenever barcodeNumber
  // is on. Was completely missing from the old reserve calc.
  if (f.barcodeNumber) mm += line(Math.max(6, profile.fontSizePt - 1));
  // Custom text (promo note) — one line when enabled.
  if (f.customText) mm += line(Math.max(6, profile.fontSizePt - 1));
  // Price / MRP — one line when either is enabled.
  if (f.sellingPrice || f.mrp) mm += line(profile.fontSizePt);
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
  if (f.sellingPrice || f.mrp) n += 1;
  if (f.customText) n += 1;
  return n;
}
