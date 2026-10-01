'use client';

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { detectBarcodeFormat } from '@/lib/barcode';

// Previous defaults (width:1, margin:0) rendered the thinnest possible bar
// with zero quiet zone — neither call site (ThermalInvoice/A4Invoice) ever
// overrode them, so every printed bill's barcode ran at the worst-case
// settings for a thermal printer's DPI. Bumped to values that still fit the
// tight space next to the bill number but give a scanner something to lock
// onto.
export function Barcode({ value, width = 1.5, height = 30, displayValue = false, margin = 6, printCrisp = false }: {
  value: string; width?: number; height?: number; displayValue?: boolean; margin?: number;
  /** thermal receipts: solid black on white, hard edges, readable number underneath */
  printCrisp?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      JsBarcode(svgRef.current, value, {
        format: detectBarcodeFormat(value),
        width,
        height,
        displayValue,
        margin,
        marginTop: printCrisp ? 2 : undefined,
        marginBottom: printCrisp ? 2 : undefined,
        fontSize: printCrisp ? 20 : undefined,
        font: 'monospace',
        fontOptions: printCrisp ? 'bold' : undefined,
        textMargin: printCrisp ? 2 : undefined,
        lineColor: '#000000',
        // A thermal printer rasterises the page: a transparent background can come out grey/black, so the bars get a
        // solid white field (and the quiet zone around them) instead.
        background: printCrisp ? '#ffffff' : 'transparent',
      });
    }
  }, [value, width, height, displayValue, margin, printCrisp]);

  // crispEdges keeps every bar on whole device pixels (no anti-aliased grey edges a scanner cannot lock on to).
  return <svg ref={svgRef} className="max-w-full" shapeRendering={printCrisp ? 'crispEdges' : undefined} />;
}
