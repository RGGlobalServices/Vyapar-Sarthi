'use client';

import { useEffect, useRef } from 'react';

/**
 * Hardware barcode-scanner support for the billing screens.
 *
 * A USB/desktop scanner is a HID keyboard: it "types" the code then sends a
 * suffix key (Enter by default, Tab on some models). There is no driver or SDK
 * — the only real problem is telling a scan apart from a human typing.
 *
 * The earlier approach cleared the buffer whenever two keys were more than
 * 50ms apart and fired on any Enter with 3+ buffered characters. Two ways that
 * misfires:
 *   • a quick typist can land 3 characters inside the window, so pressing
 *     Enter in (say) the customer-name field was swallowed as a scan and the
 *     form never submitted;
 *   • it listened to every keystroke on the window regardless of where focus
 *     was, so ordinary form input fed the buffer.
 *
 * Instead we require EVERY gap inside the candidate to be scanner-fast, not
 * just the last one. A scanner emits at 10–30ms/char; a human sustaining
 * sub-50ms gaps across a whole barcode is not realistic. Anything failing that
 * test is left completely alone, so normal typing and Enter-to-submit behave
 * exactly as they would without this hook installed.
 */

export interface BarcodeScannerOptions {
  onScan: (code: string) => void;
  /** Turn off while a modal owns the keyboard. */
  enabled?: boolean;
  /** Shortest accepted code. Most retail barcodes are 8–13 characters. */
  minLength?: number;
  /** Longest gap between characters still considered machine speed. */
  maxKeyGapMs?: number;
  /** Some scanners are configured to send Tab instead of Enter. */
  allowTabSuffix?: boolean;
}

/**
 * Find a product in an already-loaded list by any scannable identifier.
 *
 * Tries the item's company barcode, then SKU, then carton barcode — all exact,
 * case-insensitive. HSN is only honoured when it resolves to a single product,
 * because an HSN code is a shared tax class and a multi-match must never guess
 * which product to bill. Returns undefined so the caller can fall back to the
 * server lookup (which covers products beyond the 2000-row list cap).
 */
export function matchProductByCode<T extends {
  barcode?: string | null; sku?: string | null; cartonBarcode?: string | null; hsnCode?: string | null;
}>(products: T[], rawCode: string): T | undefined {
  const code = String(rawCode || '').trim().toLowerCase();
  if (!code) return undefined;
  const eq = (v: string | null | undefined) => (v || '').trim().toLowerCase() === code;

  const direct = products.find(p => eq(p.barcode) || eq(p.sku) || eq(p.cartonBarcode));
  if (direct) return direct;

  const hsnMatches = products.filter(p => eq(p.hsnCode));
  return hsnMatches.length === 1 ? hsnMatches[0] : undefined;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 4,
  maxKeyGapMs = 50,
  allowTabSuffix = true,
}: BarcodeScannerOptions) {
  // Kept in a ref so changing the callback doesn't tear down the listener and
  // lose a scan that is mid-flight.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let fastGaps = 0; // how many inter-character gaps arrived at machine speed
    let lastKeyAt = 0;

    const reset = () => {
      buffer = '';
      fastGaps = 0;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - lastKeyAt;
      lastKeyAt = now;

      const isSuffix = e.key === 'Enter' || (allowTabSuffix && e.key === 'Tab');

      if (isSuffix) {
        // Every gap within the code must have been machine-fast. For N
        // characters that is N-1 gaps; the wait before the first character is
        // human and deliberately not counted.
        const isScan = buffer.length >= minLength && fastGaps >= buffer.length - 1;
        const code = buffer;
        reset();

        if (isScan) {
          // Only swallow the key once we are sure — otherwise Enter must keep
          // submitting whatever form the user is actually in.
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      // Ignore modifiers, arrows, function keys, and shortcut combinations.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      if (gap > maxKeyGapMs) {
        // Too slow to be part of a scan — treat as the potential first
        // character of a new one.
        buffer = e.key;
        fastGaps = 0;
      } else {
        buffer += e.key;
        fastGaps++;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, minLength, maxKeyGapMs, allowTabSuffix]);
}

/**
 * Audible scan feedback.
 *
 * At a busy counter the cashier is looking at the customer, not the screen, so
 * a silent scan gets repeated. Synthesised with the Web Audio API rather than
 * an audio file so there is no asset to load and no first-play delay.
 * Deliberately never throws: a browser that blocks audio before user gesture
 * must not break billing.
 */
let audioCtx: AudioContext | null = null;

export function playScanBeep(ok = true) {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Bright short blip when found; lower, longer buzz when not.
    osc.type = ok ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(ok ? 2000 : 220, audioCtx.currentTime);

    const duration = ok ? 0.07 : 0.22;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(ok ? 0.12 : 0.2, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    /* audio unavailable — scanning still works */
  }
}
