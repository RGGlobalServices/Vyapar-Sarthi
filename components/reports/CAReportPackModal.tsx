'use client';

import { useState } from 'react';
import { X, Loader2, FileDown, CheckSquare, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { saveOrShareBlob } from '@/lib/nativeSave';
import { buildWorkbookBlob, type WorkbookSheet } from '@/lib/excelWorkbook';
import { generateCAReportPackPdf, type CAPackSection } from '@/lib/pdf/caReportPack';
import type { DateRangeValue } from './FinancialYearPicker';

export interface ReportDef {
  key: string; // report_type on the ca module
  label: string;
  orientation: 'portrait' | 'landscape';
  columns: { key: string; label: string; type?: 'text' | 'currency' | 'number' | 'date' }[];
  // Where the row list lives in the API response, and an optional summary builder.
  rowsFrom: (data: any) => any[];
  summary?: (data: any) => { label: string; value: string }[];
}

type Tr = (key: string, values?: Record<string, any>) => string;

// Markers the server sends instead of hardcoded English so the client can
// translate them — see app/api/v1/reports/engine/route.ts's handleCA().
const MARKER_KEYS: Record<string, string> = {
  '__walk_in__': 'common.walkIn',
  '__unknown_item__': 'common.unknownItem',
  '__unknown_supplier__': 'common.unknownSupplier',
  '__unknown__': 'common.unknown',
  '__salary_payroll__': 'common.salaryRow',
};

function trText(t: Tr, raw: string | null | undefined): string {
  if (raw == null || raw === '') return raw ?? '';
  const key = MARKER_KEYS[raw];
  return key ? t(key) : raw;
}

function trGstClass(t: Tr, raw: string | null | undefined): string {
  if (raw === 'gst') return t('common.gst');
  if (raw === 'non_gst') return t('common.nonGst');
  if (raw === 'gst_info_missing') return t('common.gstInfoMissing');
  return raw || '';
}

function trPaymentStatus(t: Tr, raw: string | null | undefined): string {
  const key = (raw || '').toLowerCase();
  return key === 'paid' || key === 'partial' || key === 'unpaid' ? t(`paymentStatus.${key}`) : (raw || '');
}

function trCashDirection(t: Tr, raw: string | null | undefined): string {
  const key = (raw || '').toLowerCase();
  return key === 'in' || key === 'out' ? t(`cashDirection.${key}`) : (raw || '');
}

function trAgeBucket(t: Tr, raw: string | null | undefined): string {
  return raw ? t(`ageBuckets.${raw}` as any) : '';
}

function trWarning(t: Tr, w: { type: string; params?: Record<string, any> }): { type: string; message: string } {
  return {
    type: t(`dataQuality.types.${w.type}` as any),
    message: t(`dataQuality.warnings.${w.type}` as any, w.params || {}),
  };
}

const money = (n: number) => `Rs ${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Builds the Phase 1-3 CA report definitions with every label/value routed
 *  through next-intl — called with useTranslations('Reports.ca') so callers
 *  just pass their `t` through. */
export function buildCaReports(t: Tr): ReportDef[] {
  const rn = (key: string) => t(`reportNames.${key}` as any);
  const col = (report: string, key: string) => t(`reports.${report}.columns.${key}` as any);
  const sum = (report: string, key: string) => t(`reports.${report}.summary.${key}` as any);

  return [
    {
      key: 'sales_register', label: rn('sales_register'), orientation: 'landscape',
      columns: [
        { key: 'date', label: col('sales_register', 'date'), type: 'date' }, { key: 'invoiceNumber', label: col('sales_register', 'invoiceNumber') },
        { key: 'customerName', label: col('sales_register', 'customerName') }, { key: 'customerGstin', label: col('sales_register', 'customerGstin') },
        { key: 'product', label: col('sales_register', 'product') }, { key: 'hsn', label: col('sales_register', 'hsn') },
        { key: 'quantity', label: col('sales_register', 'quantity'), type: 'number' }, { key: 'unit', label: col('sales_register', 'unit') },
        { key: 'taxableValue', label: col('sales_register', 'taxableValue'), type: 'currency' }, { key: 'gstRate', label: col('sales_register', 'gstRate'), type: 'number' },
        { key: 'cgst', label: col('sales_register', 'cgst'), type: 'currency' }, { key: 'sgst', label: col('sales_register', 'sgst'), type: 'currency' }, { key: 'igst', label: col('sales_register', 'igst'), type: 'currency' },
        { key: 'invoiceTotal', label: col('sales_register', 'invoiceTotal'), type: 'currency' }, { key: 'paymentStatus', label: col('sales_register', 'paymentStatus') }, { key: 'paymentMode', label: col('sales_register', 'paymentMode') },
      ],
      rowsFrom: (d) => (d.rows || []).map((r: any) => ({ ...r, customerName: trText(t, r.customerName), product: trText(t, r.product), paymentStatus: trPaymentStatus(t, r.paymentStatus) })),
      summary: (d) => [{ label: sum('sales_register', 'lines'), value: String(d.summary?.lineCount ?? 0) }, { label: sum('sales_register', 'invoiceTotal'), value: money(d.summary?.invoiceTotal || 0) }],
    },
    {
      key: 'purchase_register', label: rn('purchase_register'), orientation: 'landscape',
      columns: [
        { key: 'date', label: col('purchase_register', 'date'), type: 'date' }, { key: 'billNumber', label: col('purchase_register', 'billNumber') },
        { key: 'supplierName', label: col('purchase_register', 'supplierName') }, { key: 'supplierGstin', label: col('purchase_register', 'supplierGstin') },
        { key: 'product', label: col('purchase_register', 'product') }, { key: 'hsn', label: col('purchase_register', 'hsn') },
        { key: 'quantity', label: col('purchase_register', 'quantity'), type: 'number' }, { key: 'taxableValue', label: col('purchase_register', 'taxableValue'), type: 'currency' },
        { key: 'gstAmount', label: col('purchase_register', 'gstAmount'), type: 'currency' }, { key: 'total', label: col('purchase_register', 'total'), type: 'currency' }, { key: 'gstClass', label: col('purchase_register', 'gstClass') },
      ],
      rowsFrom: (d) => (d.rows || []).map((r: any) => ({ ...r, supplierName: trText(t, r.supplierName), product: trText(t, r.product), gstClass: trGstClass(t, r.gstClass) })),
      summary: (d) => [{ label: sum('purchase_register', 'lines'), value: String(d.summary?.lineCount ?? 0) }, { label: sum('purchase_register', 'total'), value: money(d.summary?.total || 0) }],
    },
    {
      key: 'gst_summary', label: rn('gst_summary'), orientation: 'portrait',
      columns: [{ key: 'rate', label: col('gst_summary', 'rate'), type: 'number' }, { key: 'taxable', label: col('gst_summary', 'taxable'), type: 'currency' }, { key: 'cgst', label: col('gst_summary', 'cgst'), type: 'currency' }, { key: 'sgst', label: col('gst_summary', 'sgst'), type: 'currency' }, { key: 'igst', label: col('gst_summary', 'igst'), type: 'currency' }, { key: 'total', label: col('gst_summary', 'total'), type: 'currency' }],
      rowsFrom: (d) => d.output?.rows || [],
      summary: (d) => [
        { label: sum('gst_summary', 'outputGst'), value: money((d.output?.cgst || 0) + (d.output?.sgst || 0) + (d.output?.igst || 0)) },
        { label: sum('gst_summary', 'inputGst'), value: money(d.input?.gst || 0) },
        { label: sum('gst_summary', 'netGst'), value: money(d.netGstDifference || 0) },
      ],
    },
    {
      key: 'gst_monthly', label: rn('gst_monthly'), orientation: 'portrait',
      columns: [{ key: 'label', label: col('gst_monthly', 'label') }, { key: 'outputTaxable', label: col('gst_monthly', 'outputTaxable'), type: 'currency' }, { key: 'outputGst', label: col('gst_monthly', 'outputGst'), type: 'currency' }, { key: 'inputTaxable', label: col('gst_monthly', 'inputTaxable'), type: 'currency' }, { key: 'inputGst', label: col('gst_monthly', 'inputGst'), type: 'currency' }, { key: 'netGst', label: col('gst_monthly', 'netGst'), type: 'currency' }],
      rowsFrom: (d) => d.rows || [],
    },
    {
      key: 'non_gst', label: rn('non_gst'), orientation: 'landscape',
      columns: [{ key: 'date', label: col('non_gst', 'date'), type: 'date' }, { key: 'docNumber', label: col('non_gst', 'docNumber') }, { key: 'party', label: col('non_gst', 'party') }, { key: 'product', label: col('non_gst', 'product') }, { key: 'hsn', label: col('non_gst', 'hsn') }, { key: 'amount', label: col('non_gst', 'amount'), type: 'currency' }, { key: 'classification', label: col('non_gst', 'classification') }],
      rowsFrom: (d) => (d.rows || []).map((r: any) => ({ ...r, party: trText(t, r.party), product: trText(t, r.product), classification: trGstClass(t, r.classification) })),
      summary: (d) => [{ label: sum('non_gst', 'transactions'), value: String(d.summary?.count ?? 0) }, { label: sum('non_gst', 'total'), value: money(d.summary?.total || 0) }],
    },
    {
      key: 'data_quality', label: rn('data_quality'), orientation: 'portrait',
      columns: [{ key: 'type', label: col('data_quality', 'type') }, { key: 'message', label: col('data_quality', 'message') }],
      rowsFrom: (d) => (d.warnings || []).map((w: any) => ({ ...w, ...trWarning(t, w) })),
      summary: (d) => [{ label: sum('data_quality', 'warnings'), value: String(d.summary?.count ?? 0) }],
    },
    // ── Phase 2 ──────────────────────────────────────────────────────────
    {
      key: 'profit_loss', label: rn('profit_loss'), orientation: 'portrait',
      columns: [{ key: 'category', label: col('profit_loss', 'category') }, { key: 'amount', label: col('profit_loss', 'amount'), type: 'currency' }],
      rowsFrom: (d) => (d.expenses || []).map((r: any) => ({ ...r, category: trText(t, r.category) })),
      summary: (d) => [
        { label: sum('profit_loss', 'revenue'), value: money(d.revenue || 0) },
        { label: sum('profit_loss', 'grossProfit'), value: money(d.grossProfit || 0) },
        { label: sum('profit_loss', 'netProfit'), value: money(d.netProfit || 0) },
      ],
    },
    {
      key: 'trading_account', label: rn('trading_account'), orientation: 'portrait',
      columns: [
        { key: 'lineItem', label: col('trading_account', 'lineItem') }, { key: 'amount', label: col('trading_account', 'amount'), type: 'currency' },
      ],
      rowsFrom: (d) => [
        { lineItem: t('reports.trading_account.lineItems.openingStock' as any), amount: d.openingStock },
        { lineItem: t('reports.trading_account.lineItems.purchases' as any), amount: d.purchases },
        { lineItem: t('reports.trading_account.lineItems.purchaseReturns' as any), amount: d.purchaseReturns },
        { lineItem: t('reports.trading_account.lineItems.closingStock' as any), amount: d.closingStock },
        { lineItem: t('reports.trading_account.lineItems.cogs' as any), amount: d.cogs },
        { lineItem: t('reports.trading_account.lineItems.grossSales' as any), amount: d.grossSales },
        { lineItem: t('reports.trading_account.lineItems.salesReturns' as any), amount: d.salesReturns },
        { lineItem: t('reports.trading_account.lineItems.netSales' as any), amount: d.netSales },
        { lineItem: t('reports.trading_account.lineItems.grossProfitOrLoss' as any), amount: d.grossProfitOrLoss },
      ],
      summary: (d) => [{ label: sum('trading_account', 'grossProfitLoss'), value: money(d.grossProfitOrLoss || 0) }],
    },
    {
      key: 'stock_summary', label: rn('stock_summary'), orientation: 'landscape',
      columns: [
        { key: 'product', label: col('stock_summary', 'product') }, { key: 'category', label: col('stock_summary', 'category') },
        { key: 'openingQty', label: col('stock_summary', 'openingQty'), type: 'number' }, { key: 'purchasedQty', label: col('stock_summary', 'purchasedQty'), type: 'number' },
        { key: 'soldQty', label: col('stock_summary', 'soldQty'), type: 'number' }, { key: 'purchaseReturnQty', label: col('stock_summary', 'purchaseReturnQty'), type: 'number' },
        { key: 'salesReturnQty', label: col('stock_summary', 'salesReturnQty'), type: 'number' }, { key: 'closingQty', label: col('stock_summary', 'closingQty'), type: 'number' },
        { key: 'closingValue', label: col('stock_summary', 'closingValue'), type: 'currency' },
      ],
      rowsFrom: (d) => (d.rows || []).map((r: any) => ({ ...r, category: trText(t, r.category) })),
      summary: (d) => [{ label: sum('stock_summary', 'closingStockValue'), value: money(d.summary?.totalClosingValue || 0) }],
    },
    {
      key: 'receivables_ageing', label: rn('receivables_ageing'), orientation: 'landscape',
      columns: [
        { key: 'party', label: col('receivables_ageing', 'party') }, { key: 'billNumber', label: col('receivables_ageing', 'billNumber') }, { key: 'date', label: col('receivables_ageing', 'date'), type: 'date' },
        { key: 'originalAmount', label: col('receivables_ageing', 'originalAmount'), type: 'currency' }, { key: 'remaining', label: col('receivables_ageing', 'remaining'), type: 'currency' }, { key: 'ageBucket', label: col('receivables_ageing', 'ageBucket') },
      ],
      rowsFrom: (d) => (d.rows || []).map((r: any) => ({ ...r, ageBucket: trAgeBucket(t, r.ageBucket) })),
      summary: (d) => (d.bucketSummary || []).map((b: any) => ({ label: trAgeBucket(t, b.bucket), value: money(b.amount) })),
    },
    {
      key: 'payables_ageing', label: rn('payables_ageing'), orientation: 'landscape',
      columns: [
        { key: 'party', label: col('payables_ageing', 'party') }, { key: 'billNumber', label: col('payables_ageing', 'billNumber') }, { key: 'date', label: col('payables_ageing', 'date'), type: 'date' },
        { key: 'originalAmount', label: col('payables_ageing', 'originalAmount'), type: 'currency' }, { key: 'remaining', label: col('payables_ageing', 'remaining'), type: 'currency' }, { key: 'ageBucket', label: col('payables_ageing', 'ageBucket') },
      ],
      rowsFrom: (d) => (d.rows || []).map((r: any) => ({ ...r, ageBucket: trAgeBucket(t, r.ageBucket) })),
      summary: (d) => (d.bucketSummary || []).map((b: any) => ({ label: trAgeBucket(t, b.bucket), value: money(b.amount) })),
    },
    // ── Phase 3 ──────────────────────────────────────────────────────────
    {
      key: 'cash_bank_summary', label: rn('cash_bank_summary'), orientation: 'portrait',
      columns: [{ key: 'type', label: col('cash_bank_summary', 'type') }, { key: 'direction', label: col('cash_bank_summary', 'direction') }, { key: 'amount', label: col('cash_bank_summary', 'amount'), type: 'currency' }],
      rowsFrom: (d) => (d.cashRows || []).map((r: any) => ({ ...r, direction: trCashDirection(t, r.direction) })),
      summary: (d) => [
        { label: sum('cash_bank_summary', 'cashIn'), value: money(d.cashIn || 0) },
        { label: sum('cash_bank_summary', 'cashOut'), value: money(d.cashOut || 0) },
        { label: sum('cash_bank_summary', 'netCashFlow'), value: money(d.netCashFlow || 0) },
      ],
    },
    // ── Balance Sheet ──────────────────────────────────────────────────────
    {
      key: 'balance_sheet', label: rn('balance_sheet'), orientation: 'portrait',
      columns: [
        { key: 'section', label: 'Section' },
        { key: 'item', label: 'Item' },
        { key: 'amount', label: 'Amount', type: 'currency' as const },
      ],
      rowsFrom: (d) => {
        if (!d?.assets) return [];
        return [
          { section: 'Assets', item: 'Cash & Bank', amount: d.assets.cash },
          { section: 'Assets', item: 'Accounts Receivable (Debtors)', amount: d.assets.debtors },
          { section: 'Assets', item: 'Closing Stock', amount: d.assets.closingStock },
          { section: 'Assets', item: 'Total Assets', amount: d.assets.total },
          { section: 'Liabilities', item: 'Accounts Payable (Creditors)', amount: d.liabilities.creditors },
          { section: 'Liabilities', item: 'Total Liabilities', amount: d.liabilities.total },
          { section: 'Equity', item: 'Net Profit (Period)', amount: d.equity.netProfit },
          { section: 'Equity', item: 'Net Worth', amount: d.equity.total },
        ];
      },
      summary: (d) => [
        { label: 'Total Assets', value: money(d?.assets?.total || 0) },
        { label: 'Total Liabilities', value: money(d?.liabilities?.total || 0) },
        { label: 'Net Worth', value: money(d?.equity?.total || 0) },
      ],
    },
  ];
}

/** Mill/Bada Udyog specific reports — real RawMaterialLot/ProductionBatch/
 *  ByProduct data (see prisma/schema.prisma), only meaningful for a Bada
 *  Udyog package shop (packageType === 'badaudyog' — mills/manufacturers;
 *  Dukan/Vyapar are retail shopkeepers, Udyog/'wholesale' is wholesalers &
 *  distributors). Kept separate from CA_REPORTS and merged in by
 *  getReportsForPackage() below so a non-mill shop never sees a mill-only
 *  checklist item. Gated on package rather than the single businessType
 *  literal 'millprocessing' because several legacy business types
 *  (ricemill, flourmill, oilmill, foodprocessing, smallmanufacturing — see
 *  lib/businessConfig.ts) are also Bada Udyog mills but don't carry that
 *  exact businessType string. */
export function buildMillReports(t: Tr): ReportDef[] {
  const rn = (key: string) => t(`reportNames.${key}` as any);
  const col = (report: string, key: string) => t(`reports.${report}.columns.${key}` as any);
  const sum = (report: string, key: string) => t(`reports.${report}.summary.${key}` as any);

  return [
    {
      key: 'mill_raw_material', label: rn('mill_raw_material'), orientation: 'landscape',
      columns: [
        { key: 'lotNumber', label: col('mill_raw_material', 'lotNumber') }, { key: 'farmerName', label: col('mill_raw_material', 'farmerName') }, { key: 'purchaseDate', label: col('mill_raw_material', 'purchaseDate'), type: 'date' },
        { key: 'weightKg', label: col('mill_raw_material', 'weightKg'), type: 'number' }, { key: 'moisturePct', label: col('mill_raw_material', 'moisturePct'), type: 'number' },
        { key: 'ratePerKg', label: col('mill_raw_material', 'ratePerKg'), type: 'currency' }, { key: 'totalAmount', label: col('mill_raw_material', 'totalAmount'), type: 'currency' }, { key: 'remainingKg', label: col('mill_raw_material', 'remainingKg'), type: 'number' },
      ],
      rowsFrom: (d) => d.rows || [],
      summary: (d) => [
        { label: sum('mill_raw_material', 'totalWeight'), value: `${Math.round(d.summary?.totalWeightKg || 0).toLocaleString('en-IN')} Kg` },
        { label: sum('mill_raw_material', 'totalAmount'), value: money(d.summary?.totalAmount || 0) },
      ],
    },
    {
      key: 'mill_production', label: rn('mill_production'), orientation: 'landscape',
      columns: [
        { key: 'batchNumber', label: col('mill_production', 'batchNumber') }, { key: 'startedAt', label: col('mill_production', 'startedAt'), type: 'date' }, { key: 'status', label: col('mill_production', 'status') }, { key: 'currentStage', label: col('mill_production', 'currentStage') },
        { key: 'inputKg', label: col('mill_production', 'inputKg'), type: 'number' }, { key: 'outputKg', label: col('mill_production', 'outputKg'), type: 'number' },
        { key: 'wastageKg', label: col('mill_production', 'wastageKg'), type: 'number' }, { key: 'brokenKg', label: col('mill_production', 'brokenKg'), type: 'number' },
        { key: 'branKg', label: col('mill_production', 'branKg'), type: 'number' }, { key: 'huskKg', label: col('mill_production', 'huskKg'), type: 'number' }, { key: 'recoveryPct', label: col('mill_production', 'recoveryPct'), type: 'number' },
      ],
      rowsFrom: (d) => d.rows || [],
      summary: (d) => [
        { label: sum('mill_production', 'batches'), value: String(d.summary?.batchCount ?? 0) },
        { label: sum('mill_production', 'avgRecovery'), value: `${d.summary?.avgRecoveryPct ?? 0}%` },
      ],
    },
    {
      key: 'mill_byproducts', label: rn('mill_byproducts'), orientation: 'landscape',
      columns: [
        { key: 'name', label: col('mill_byproducts', 'name') }, { key: 'quantityKg', label: col('mill_byproducts', 'quantityKg'), type: 'number' }, { key: 'soldKg', label: col('mill_byproducts', 'soldKg'), type: 'number' },
        { key: 'remainingKg', label: col('mill_byproducts', 'remainingKg'), type: 'number' }, { key: 'ratePerKg', label: col('mill_byproducts', 'ratePerKg'), type: 'currency' }, { key: 'soldValue', label: col('mill_byproducts', 'soldValue'), type: 'currency' },
      ],
      rowsFrom: (d) => d.rows || [],
      summary: (d) => [{ label: sum('mill_byproducts', 'totalSoldValue'), value: money(d.summary?.totalSoldValue || 0) }],
    },
  ];
}

/** Businesses without recorded raw-material/production/hamali/broker/
 *  freight data (confirmed by inspecting the schema — no such models exist
 *  beyond the mill ones above) can't get those specific report lines built
 *  without inventing data, so they stay listed as Coming Soon rather than
 *  silently vanishing from the checklist. */
export function getReportsForPackage(packageType: string | null | undefined, t: Tr): ReportDef[] {
  return packageType === 'badaudyog' ? [...buildCaReports(t), ...buildMillReports(t)] : buildCaReports(t);
}

export default function CAReportPackModal({ dateRange, onClose }: { dateRange: DateRangeValue; onClose: () => void }) {
  const t = useTranslations('Reports.ca');
  const { profile } = useBusinessStore();
  const reports = getReportsForPackage(profile.packageType, t);
  const [selected, setSelected] = useState<Set<string>>(new Set(reports.map((r) => r.key)));
  const [generating, setGenerating] = useState<'pdf' | 'excel' | null>(null);
  const [error, setError] = useState('');

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function fetchReport(def: ReportDef) {
    const res = await api.get(`/reports/engine?module=ca&report_type=${def.key}&start_date=${dateRange.from}&end_date=${dateRange.to}`);
    return { def, data: res.data };
  }

  async function generate(kind: 'pdf' | 'excel') {
    setGenerating(kind);
    setError('');
    try {
      const chosen = reports.filter((r) => selected.has(r.key));
      if (!chosen.length) { setError(t('pack.pickAtLeastOne')); return; }
      const results = await Promise.all(chosen.map(fetchReport));

      const shop = { name: profile.shopName || 'Vyapar Sarthi', address: profile.address || null, mobile: profile.mobile || null, gst: profile.gst || null, pan: profile.pan || null };
      const rangeLabel = `${dateRange.from} to ${dateRange.to}`;

      if (kind === 'excel') {
        const sheets: WorkbookSheet[] = results.map(({ def, data }) => ({ name: def.label, columns: def.columns, rows: def.rowsFrom(data) }));
        const blob = await buildWorkbookBlob(sheets);
        const name = `CA_Report_Pack_${dateRange.label.replace(/\s+/g, '_')}.xlsx`;
        if (!(await saveOrShareBlob(blob, name))) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }
      } else {
        const sections: CAPackSection[] = results.map(({ def, data }) => ({
          title: def.label, columns: def.columns, rows: def.rowsFrom(data),
          summary: def.summary?.(data), orientation: def.orientation,
        }));
        const blob = await generateCAReportPackPdf({ shop, fyLabel: dateRange.label, dateRangeLabel: rangeLabel, sections });
        const name = `CA_Report_Pack_${dateRange.label.replace(/\s+/g, '_')}.pdf`;
        if (!(await saveOrShareBlob(blob, name))) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || t('pack.genericError'));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('pack.title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {dateRange.label} &middot; {dateRange.from} to {dateRange.to}
          </p>

          <div className="space-y-1.5">
            {reports.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => toggle(r.key)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
              >
                {selected.has(r.key) ? <CheckSquare size={16} className="text-emerald-600 shrink-0" /> : <Square size={16} className="text-slate-400 shrink-0" />}
                <span className="text-sm text-slate-800 dark:text-slate-200">{r.label}</span>
              </button>
            ))}
            <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg opacity-50 cursor-not-allowed">
              <Square size={16} className="text-slate-300 shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-500">{t('pack.comingSoonHamali')}</span>
              <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('pack.comingSoon')}</span>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            onClick={() => generate('pdf')}
            disabled={!!generating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-60"
          >
            {generating === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
            {t('pack.pdfButton')}
          </button>
          <button
            onClick={() => generate('excel')}
            disabled={!!generating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-700 hover:bg-green-800 text-white text-sm font-bold disabled:opacity-60"
          >
            {generating === 'excel' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
            {t('pack.excelButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
