import { PAYMENT_URL } from './config';

export type PlanKey = 'shop' | 'wholesale';

export const PLAN_DISPLAY: Record<string, string> = {
  shop:       'Shop',
  wholesale:  'Wholesale',
};

export const PLAN_LIMITS: Record<string, { maxProducts: number; maxUdharCustomers: number }> = {
  shop:       { maxProducts: Infinity, maxUdharCustomers: Infinity },
  wholesale:  { maxProducts: Infinity, maxUdharCustomers: Infinity },
};

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] ?? { maxProducts: Infinity, maxUdharCustomers: Infinity };
}

export function planLabel(plan: string): string {
  return PLAN_DISPLAY[plan] ?? plan;
}

export function canAddProduct(plan: string, currentCount: number): boolean {
  return currentCount < getPlanLimits(plan).maxProducts;
}

export function canAddUdharCustomer(plan: string, currentCount: number): boolean {
  const limit = getPlanLimits(plan).maxUdharCustomers;
  return currentCount < limit;
}

export function canExportReports(plan: string): boolean {
  return true;
}

export function productLimitDisplay(plan: string): string {
  return 'Unlimited';
}

export function udharLimitDisplay(plan: string): string {
  return 'Unlimited';
}

export const UPGRADE_URL = PAYMENT_URL;
