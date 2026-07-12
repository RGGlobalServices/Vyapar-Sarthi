'use client';

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function Barcode({ value, width = 1, height = 30, displayValue = false }: { value: string; width?: number; height?: number; displayValue?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      JsBarcode(svgRef.current, value, {
        width,
        height,
        displayValue,
        margin: 0,
        background: 'transparent',
      });
    }
  }, [value, width, height, displayValue]);

  return <svg ref={svgRef} className="max-w-full" />;
}
