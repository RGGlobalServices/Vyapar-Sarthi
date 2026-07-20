import api from '@/lib/api';

/**
 * SWR fetchers shared between a screen and anything that prefetches for it.
 *
 * SWR caches by key alone, so a prefetch MUST use the same fetcher the screen
 * uses. Prefetching `/products` with a plain fetcher would leave the raw API
 * response under the key the products page reads, and every field it maps
 * (stock, cost, unit …) would come back undefined.
 */

export const fetchJson = (url: string) => api.get(url).then(res => res.data);

export const fetchProductsMapped = (url: string) =>
  api.get(url).then(res =>
    res.data.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      stock: p.currentStock,
      minStock: p.minStock,
      mrp: p.mrp,
      sellingPrice: p.sellingPrice,
      cost: p.wholesaleCost,
      unit: p.baseUnit || 'Unit',
      expiry_date: p.expiryDate,
      batch_number: p.batch_number,
      drug_schedule: p.drug_schedule,
      model_number: p.model_number,
      warranty_months: p.warranty_months,
      gender: p.gender,
      shade: p.shade,
      size_variants: p.size_variants,
      is_loose: p.is_loose,
      metadata: p.metadata,
      // The REAL stored barcode — without this the Barcode/QR modal shows an
      // unsaved PRD-<id> fallback that no scan or search can ever match.
      barcode: p.barcode,
      gstPercent: p.gstPercent,
      hsnCode: p.hsnCode,
      brand: p.brand,
      conversionFactor: p.conversionFactor,
      recentlyAdded: p.recentlyAdded,
    }))
  );
