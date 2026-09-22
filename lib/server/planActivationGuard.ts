import type { BillingCycle } from '../subscriptionPricing';

// payments/activate-plan activates a paid plan WITHOUT any payment. It exists
// only so a developer can exercise the "payment succeeded" path when no PayU
// gateway is configured, so it is off unless BOTH are true:
//   1. the process is not running in production, and
//   2. an operator has explicitly set ALLOW_TEST_PLAN_ACTIVATION=true.
// In production it can never be enabled, whatever the flag says.
export function testActivationAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.ALLOW_TEST_PLAN_ACTIVATION === 'true';
}

// The expiry is always derived on the server — one billing cycle from now,
// the same rule payu-success applies — never taken from the request.
export function activationExpiry(cycle: BillingCycle, billingCycleDays: number, now: Date = new Date()): Date {
  const expiry = new Date(now);
  if (cycle === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
  else if (cycle === '5_years') expiry.setFullYear(expiry.getFullYear() + 5);
  else expiry.setDate(expiry.getDate() + billingCycleDays);
  return expiry;
}
