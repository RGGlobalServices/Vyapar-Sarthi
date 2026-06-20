import crypto from 'crypto';
import { config } from './config';

interface RenewalPayload {
  shopId: string;
  plan: string;
  amount: number;
  exp: number; // Unix timestamp (ms)
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', config.cronSecret).update(data).digest('hex');
}

export function generateRenewalToken(shopId: string, plan: string, amount: number): string {
  const payload: RenewalPayload = {
    shopId,
    plan,
    amount,
    exp: Date.now() + 72 * 60 * 60 * 1000, // 72 hours
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

export function verifyRenewalToken(token: string): RenewalPayload {
  const dot = token.lastIndexOf('.');
  if (dot === -1) throw new Error('Invalid token format');

  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (sig !== hmac(encoded)) throw new Error('Invalid token signature');

  const payload: RenewalPayload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (Date.now() > payload.exp) throw new Error('Renewal link has expired');

  return payload;
}
