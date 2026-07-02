import { PAYMENT_URL } from './config';

export type PlanKey = 'shop' | 'vyapar' | 'wholesale';

export const PLAN_PRICES: Record<string, number> = {
  shop:      299,
  vyapar:    499,
  wholesale: 999,
};

export const PLAN_DISPLAY: Record<string, string> = {
  shop:      'Dukaan',
  vyapar:    'Vyapar',
  wholesale: 'Udyog',
  starter:   'Dukaan', // alias for backwards-compat
};

export const PLAN_COLORS: Record<string, string> = {
  shop:      'bg-sky-500 text-white',
  vyapar:    'bg-indigo-500 text-white',
  wholesale: 'bg-purple-500 text-white',
  starter:   'bg-sky-500 text-white',
};

interface PlanLimit {
  maxProducts: number;
  maxUdharCustomers: number;
  maxShops: number;
  autoSend: boolean;      // auto WhatsApp/Email bill sending
  multiShop: boolean;     // multiple shops
  godowns: boolean;       // warehouse management
  dukandar: boolean;      // dukandar management
  referEarn: boolean;     // refer and earn program
  manpower: boolean;      // staff management
}

export const PLAN_LIMITS: Record<string, PlanLimit> = {
  shop: {
    maxProducts: Infinity,
    maxUdharCustomers: 100,
    maxShops: 1,
    autoSend: false,
    multiShop: false,
    godowns: false,
    dukandar: false,
    referEarn: false,
    manpower: false,
  },
  vyapar: {
    maxProducts: Infinity,
    maxUdharCustomers: Infinity,
    maxShops: 3,
    autoSend: true,
    multiShop: true,
    godowns: false,
    dukandar: false,
    referEarn: true,
    manpower: true,
  },
  wholesale: {
    maxProducts: Infinity,
    maxUdharCustomers: Infinity,
    maxShops: Infinity,
    autoSend: true,
    multiShop: true,
    godowns: true,
    dukandar: true,
    referEarn: true,
    manpower: true,
  },
};

// starter is an alias for shop
const STARTER_LIMITS = PLAN_LIMITS.shop;

export function getPlanLimits(plan: string): PlanLimit {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.shop;
}

export function planLabel(plan: string): string {
  return PLAN_DISPLAY[plan] ?? plan;
}

export function planColor(plan: string): string {
  return PLAN_COLORS[plan] ?? PLAN_COLORS.shop;
}

export function canAddProduct(plan: string, currentCount: number): boolean {
  return currentCount < getPlanLimits(plan).maxProducts;
}

export function canAddUdharCustomer(plan: string, currentCount: number): boolean {
  return currentCount < getPlanLimits(plan).maxUdharCustomers;
}

export function canUseAutoSend(plan: string): boolean {
  return getPlanLimits(plan).autoSend;
}

export function canUseMultiShop(plan: string): boolean {
  return getPlanLimits(plan).multiShop;
}

export function canUseGodowns(plan: string): boolean {
  return getPlanLimits(plan).godowns;
}

export function canUseDukandar(plan: string): boolean {
  return getPlanLimits(plan).dukandar;
}

export function canUseReferEarn(plan: string): boolean {
  return getPlanLimits(plan).referEarn;
}

export function canUseManpower(plan: string): boolean {
  return getPlanLimits(plan).manpower;
}

export function udharLimitDisplay(plan: string): string {
  const limit = getPlanLimits(plan).maxUdharCustomers;
  return limit === Infinity ? 'Unlimited' : String(limit);
}

export function productLimitDisplay(_plan: string): string {
  return 'Unlimited';
}

export function canExportReports(_plan: string): boolean {
  return true;
}

/** Returns the next plan to upgrade to, or null if already on highest */
export function nextUpgrade(plan: string): PlanKey | null {
  if (plan === 'shop' || plan === 'starter') return 'vyapar';
  if (plan === 'vyapar') return 'wholesale';
  return null;
}

export const UPGRADE_URL = PAYMENT_URL;
