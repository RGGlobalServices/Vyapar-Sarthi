/**
 * Symbology-aware validation for barcode labels. Called before print so a
 * chosen barcode type + value + physical size combination that would
 * generate an unscannable label is caught up-front — with a specific,
 * actionable error — instead of silently producing bad stickers.
 *
 * Each symbology has:
 *   - a value-shape validator (checksums / character set / length)
 *   - a minimum X-dimension (module width) below which most scanners can't
 *     resolve individual bars
 *   - a minimum height / aspect ratio for the printed bars
 *
 * The dimension floors come from the ISO/IEC 15420 (EAN/UPC), ISO/IEC 15417
 * (CODE128) and ANSI/AIM BC1 (CODE39) specs — conservative "reliably
 * scans on a low-end retail scanner" numbers, not the theoretical minimum.
 */

import type { BarcodeType } from './printProfiles';

export interface ValidationResult {
  ok: boolean;
  /** Symbology JsBarcode should actually render with. 'auto' resolves here. */
  resolvedFormat: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';
  errors: string[];
  warnings: string[];
}

const ONLY_DIGITS = /^\d+$/;

function ean13Check(first12: string): number {
  const sum = first12.split('').reduce((a, ch, i) => a + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}
function ean8Check(first7: string): number {
  const sum = first7.split('').reduce((a, ch, i) => a + Number(ch) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}
function upcCheck(first11: string): number {
  let s = 0;
  for (let i = 1; i < 11; i += 2) s += Number(first11[i]);
  for (let i = 0; i < 11; i += 2) s += Number(first11[i]) * 3;
  return (10 - (s % 10)) % 10;
}

/** Auto-detect a symbology from the value alone — same rules the existing
 *  lib/barcode.ts uses, extended to EAN8. Falls back to CODE128 (the
 *  universal-alphanumeric fallback) when nothing else fits. */
export function autoDetectFormat(value: string): ValidationResult['resolvedFormat'] {
  const v = String(value || '').trim();
  if (ONLY_DIGITS.test(v)) {
    if (v.length === 13 && Number(v[12]) === ean13Check(v.slice(0, 12))) return 'EAN13';
    if (v.length === 12 && Number(v[11]) === upcCheck(v.slice(0, 11))) return 'UPC';
    if (v.length === 8  && Number(v[7])  === ean8Check(v.slice(0, 7))) return 'EAN8';
  }
  return 'CODE128';
}

/**
 * Validate a value against the picked symbology + the physical size the
 * profile is asking to print at. Called from the Settings modal preview
 * and from the print engine as a last-chance safety net.
 *
 * `barcodeWidthMm` is the total printed width including quiet zones —
 * scanner minimum X-dimension is derived from it via character count.
 */
export function validateBarcode(
  value: string,
  type: BarcodeType,
  barcodeWidthMm: number,
  barcodeHeightMm: number,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const v = String(value || '').trim();

  if (!v) {
    return { ok: false, resolvedFormat: 'CODE128', errors: ['Barcode value is empty.'], warnings };
  }

  // Resolve the picked type into a concrete symbology (auto → detect).
  let format: ValidationResult['resolvedFormat'];
  if (type === 'auto') format = autoDetectFormat(v);
  else if (type === 'CODE39') format = 'CODE39';
  else format = type as ValidationResult['resolvedFormat'];

  // Symbology-specific value checks.
  switch (format) {
    case 'EAN13': {
      if (!ONLY_DIGITS.test(v) || v.length !== 13) {
        errors.push('EAN-13 needs exactly 13 digits.');
      } else if (Number(v[12]) !== ean13Check(v.slice(0, 12))) {
        errors.push('EAN-13 checksum is invalid — the last digit does not match.');
      }
      break;
    }
    case 'EAN8': {
      if (!ONLY_DIGITS.test(v) || v.length !== 8) {
        errors.push('EAN-8 needs exactly 8 digits.');
      } else if (Number(v[7]) !== ean8Check(v.slice(0, 7))) {
        errors.push('EAN-8 checksum is invalid — the last digit does not match.');
      }
      break;
    }
    case 'UPC': {
      if (!ONLY_DIGITS.test(v) || v.length !== 12) {
        errors.push('UPC-A needs exactly 12 digits.');
      } else if (Number(v[11]) !== upcCheck(v.slice(0, 11))) {
        errors.push('UPC-A checksum is invalid — the last digit does not match.');
      }
      break;
    }
    case 'CODE39': {
      if (!/^[0-9A-Z\-. $\/+%]+$/.test(v)) {
        errors.push('Code 39 accepts A–Z, 0–9 and only these symbols: - . space $ / + %');
      }
      break;
    }
    case 'CODE128':
      // Accepts full ASCII — nothing to reject at the value level.
      break;
  }

  // Physical-size sanity checks. A barcode that's too narrow won't scan
  // however sharply it prints. Numbers below are ISO recommended minimums.
  const modules = estimateModules(v, format);
  const xDimMm = modules > 0 ? barcodeWidthMm / modules : 0;
  if (xDimMm > 0 && xDimMm < 0.25) {
    warnings.push(`Barcode may be too narrow — module width is ${xDimMm.toFixed(2)} mm (below the 0.25 mm floor for reliable scanning). Widen the label or turn on Auto-Fit.`);
  }
  if (barcodeHeightMm > 0 && barcodeHeightMm < 6) {
    warnings.push(`Barcode is only ${barcodeHeightMm.toFixed(1)} mm tall — most scanners need at least 6 mm to lock on.`);
  }
  // ISO 15420 says an EAN/UPC bar height should be ≥ 25% of nominal width.
  if ((format === 'EAN13' || format === 'UPC' || format === 'EAN8') && barcodeHeightMm > 0 && barcodeWidthMm > 0) {
    if (barcodeHeightMm < barcodeWidthMm * 0.2) {
      warnings.push(`${format} works best when the barcode is at least ${(barcodeWidthMm * 0.2).toFixed(1)} mm tall for a ${barcodeWidthMm.toFixed(1)} mm wide code.`);
    }
  }

  return { ok: errors.length === 0, resolvedFormat: format, errors, warnings };
}

/** Rough module count per symbology — used to estimate the printed
 *  X-dimension from a total mm width. Numbers below are the standard bar
 *  counts (quiet zones excluded), which is what a scanner actually reads.
 *  Exported so printProfiles.ts's autoFitBarcode can size a barcode from
 *  its own content length instead of always filling the label width. */
export function estimateModules(value: string, format: ValidationResult['resolvedFormat']): number {
  const v = String(value || '').trim();
  switch (format) {
    case 'EAN13': return 95;
    case 'EAN8':  return 67;
    case 'UPC':   return 95;
    case 'CODE39': return 13 * v.length + 16;
    case 'CODE128':
    default: {
      // ~11 modules per character + 35 for start/stop/checksum/quiet zones.
      return 11 * v.length + 35;
    }
  }
}
