// Mill UI components — single entry point for mill team
// Existing files live in components/mill/ and components/billing/Mill*
// Phase 3: actual files will move here; only this barrel needs updating then

// ── Mill operations UI ─────────────────────────────────────────────────────
export { default as BatchesModule } from '@/components/mill/BatchesModule';
export { default as PackingPending } from '@/components/mill/PackingPending';
export { default as ByProductsPackingPending } from '@/components/mill/ByProductsPackingPending';
export { default as BrokerField, EMPTY_BROKER } from '@/components/mill/BrokerField';
export { default as QuickAddPartyModal } from '@/components/mill/QuickAddPartyModal';
export { default as BillPartyDetailsField, EMPTY_BILL_PARTY, billPartyFrom } from '@/components/mill/BillPartyDetailsField';
export type { BillPartyInput } from '@/components/mill/BillPartyDetailsField';
export { default as DispatchDetailsField, EMPTY_DISPATCH_INPUT } from '@/components/mill/DispatchDetailsField';
export type { DispatchInput } from '@/components/mill/DispatchDetailsField';
export { default as RawLotPicker } from '@/components/mill/RawLotPicker';
export { default as MaterialFlowCard } from '@/components/mill/MaterialFlowCard';
export { default as QuickProductionForm } from '@/components/mill/QuickProductionForm';

// ── Production pipeline ─────────────────────────────────────────────────────
export { default as ProductionRuns } from '@/components/mill/ProductionRuns';
export { default as ProductionSources } from '@/components/mill/ProductionSources';
export { default as ProductionReports } from '@/components/mill/ProductionReports';
export { default as StageExecutionPanel } from '@/components/mill/StageExecutionPanel';
export { default as StageTimeline } from '@/components/mill/StageTimeline';
export { default as StageTemplateManager } from '@/components/mill/StageTemplateManager';
export { default as ProductionStageBuilder } from '@/components/mill/ProductionStageBuilder';
export { default as DynamicExecutionFields } from '@/components/mill/DynamicExecutionFields';

// ── Mill billing components ─────────────────────────────────────────────────
export { default as MillRateInput } from '@/components/billing/MillRateInput';
export { default as MillCommercialCharges, EMPTY_MILL_CHARGES } from '@/components/billing/MillCommercialCharges';
export type { MillChargeInputs } from '@/components/billing/MillCommercialCharges';
export { default as MillTotalsSummary } from '@/components/billing/MillTotalsSummary';
export { default as MillBillSavedModal } from '@/components/billing/MillBillSavedModal';

// ── Mill invoice ────────────────────────────────────────────────────────────
export { default as MillInvoice } from '@/components/invoice/MillInvoice';
export { default as MillInvoiceClassic } from '@/components/invoice/MillInvoiceClassic';
export { default as MillInvoicePreviewModal } from '@/components/invoice/MillInvoicePreviewModal';
