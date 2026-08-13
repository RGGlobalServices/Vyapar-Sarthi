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
export function Barcode({ value, width = 1.5, height = 30, displayValue = false }: { value: string; width?: number; height?: number; displayValue?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      JsBarcode(svgRef.current, value, {
        format: detectBarcodeFormat(value),
        width,
        height,
        displayValue,
        margin: 6,
        background: 'transparent',
      });
    }
  }, [value, width, height, displayValue]);

  return <svg ref={svgRef} className="max-w-full" />;
}
