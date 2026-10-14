// Mill business logic — single entry point for mill team
// Existing files live in lib/mill*.ts
// Phase 3: actual files will move here; only this barrel needs updating then

export * from '@/lib/millBilling';
export * from '@/lib/millStock';
export * from '@/lib/millBill';
export * from '@/lib/millBillLabels';
export * from '@/lib/millInvoice';
export * from '@/lib/millLabels';
export * from '@/lib/millSuggest';
export * from '@/lib/millMachinePresets';
export { takeMillDuplicate } from '@/lib/millDuplicateHandoff';
