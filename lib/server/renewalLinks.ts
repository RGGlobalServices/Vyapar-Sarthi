import crypto from 'crypto';
import { config } from './config';
import { type BillingCycle } from '../subscriptionPricing';

interface RenewalPayload {
  shopId: string;
  plan: string;
  amount: number;
  cycle: BillingCycle;
  exp: number; // Unix timestamp (ms)
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', config.cronSecret).update(data).digest('hex');
}

export function generateRenewalToken(
  shopId: string,
  plan: string,
  amount: number,
  cycle: BillingCycle = 'monthly',
): string {
  const payload: RenewalPayload = {
    shopId,
    plan,
    amount,
    cycle,
    exp: Date.now() + 72 * 60 * 60 * 1000, // 72 hours
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

export function verifyRenewalToken(token: string): RenewalPayload | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;

    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    if (sig !== hmac(encoded)) return null;

    const payload: RenewalPayload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    
    if (Date.now() > payload.exp) return null;
    if (!['monthly', 'yearly', '5_years'].includes(payload.cycle)) return null;

    return payload;
  } catch (e) {
    return null;
  }
}
