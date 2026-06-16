'use client';

import { useEffect, useState } from 'react';
import { isLoggedIn, getToken } from '@/lib/auth';
import { config } from '@/lib/config';

const plans = [
  {
    name: 'Dukaan',
    key: 'shop',
    price: 299,
    color: 'sky',
    desc: 'Perfect for small kirana, grocery & retail stores',
    features: [
      'Unlimited products & categories',
      'Smart billing & GST invoices',
      'PDF bills + WhatsApp sharing',
      'Udhar Khata (up to 100 customers)',
      'Stock management & low-stock alerts',
      'Daily sales & profit reports',
      'Bulk import via Excel',
      'Multi-language (EN / HI / MR)',
      'AI Expert chat assistant',
      'Refer & Earn rewards',
    ],
  },
  {
    name: 'Vyapar',
    key: 'vyapar',
    price: 499,
    originalPrice: 699,
    color: 'indigo',
    popular: true,
    desc: 'For growing shops with multiple branches',
    features: [
      'Everything in Dukaan',
      'Unlimited Udhar customers',
      'Multiple shops (up to 3)',
      'Auto WhatsApp + Email bill sending',
      'Advanced analytics & trend reports',
      'AI product scan (Photo/Upload)',
      'EMI billing for electronics',
      'AI Expert chat assistant',
      'Refer & Earn rewards',
    ],
  },
  {
    name: 'Udyog',
    key: 'wholesale',
    price: 999,
    originalPrice: 1499,
    color: 'purple',
    desc: 'For wholesalers, distributors & large businesses',
    features: [
      'Everything in Vyapar',
      'Unlimited shops',
      'Godown / warehouse management',
      'Stock transfers between godowns',
      'Dukandar (retailer) management',
      'Dukandar credit & payment tracking',
      'WhatsApp stock alerts to retailers',
      'AI Expert chat assistant',
      'Refer & Earn rewards',
      'Priority support',
    ],
  },
];

const colorMap: Record<string, { badge: string; price: string; btn: string; activeBorder: string }> = {
  sky:    { badge: 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30',          price: 'text-sky-400',    btn: 'from-sky-500 to-cyan-500 shadow-sky-500/25',        activeBorder: 'border-sky-500/60' },
  indigo: { badge: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30', price: 'text-indigo-300', btn: 'from-indigo-500 to-violet-500 shadow-indigo-500/25', activeBorder: 'border-indigo-500/60' },
  purple: { badge: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30', price: 'text-purple-400', btn: 'from-purple-500 to-pink-500 shadow-purple-500/25',   activeBorder: 'border-purple-500/60' },
};

// Plan tier order for upgrade/downgrade labelling.
const PLAN_RANK: Record<string, number> = { starter: 0, shop: 0, vyapar: 1, wholesale: 2 };

// Resolve the app (dashboard) URL at runtime from window.location so it never
// depends on baked-in env vars (which point to the wrong port on the landing page).
function resolveAppUrl(): string {
  if (typeof window !== 'undefined' && window.location.port === '3001') {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return config.FRONTEND_URL;
}

export default function PaymentPage() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string>('');
  const [redirecting, setRedirecting] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = `/login?redirect=/payment`;
      return;
    }
    const token = getToken();
    if (!token) return;
    fetch(`${config.API_BASE}/shop/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(shop => {
        const status = (shop?.subscriptionStatus ?? shop?.subscription_status ?? '').toLowerCase();
        const p = (shop?.subscriptionPlan ?? shop?.subscription_plan ?? '').toLowerCase();
        setSubStatus(status);
        // Show the current plan for both trial and active subscriptions (mirrors
        // the navbar). Expired/cancelled users have no "current" plan to mark.
        if (p && status !== 'expired' && status !== 'cancelled') setCurrentPlan(p);
      })
      .catch(() => {});
  }, []);

  const isPaid = subStatus === 'active';
  const isTrial = subStatus === 'trial';

  // Hand off to the app's secure PayU one-time payment bridge.
  function handleSelect(planKey: string) {
    setRedirecting(planKey);
    window.location.href = `${resolveAppUrl()}/en/payment?plan=${planKey}`;
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4">
            Choose Your{' '}
            <span className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Plan
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Subscribe to keep your shop running after the free trial. Pay monthly —
            we'll remind you before it expires, no automatic charges.
          </p>
          <p className="text-emerald-400/90 text-sm mt-2">
            ✓ 30-day money-back guarantee · ✓ Pay monthly via PayU · ✓ Cancel anytime
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid gap-8 lg:grid-cols-3 max-w-6xl mx-auto items-start">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.key || (plan.key === 'shop' && currentPlan === 'starter');
            // Highlight border only for a genuinely active (paid) current plan.
            const isActive = isCurrent && isPaid;
            const c = colorMap[plan.color];
            const isRedirecting = redirecting === plan.key;

            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-2xl border bg-slate-800/40 p-8 transition-all duration-300 hover:-translate-y-1 ${
                  isActive ? c.activeBorder : 'border-slate-700/50 hover:border-slate-600/50'
                }`}
              >
                {plan.popular && !isActive && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-indigo-500 px-4 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/40">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex flex-col h-full">
                  <div className="mb-1 flex items-center gap-3">
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    {isCurrent && (
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                        isPaid
                          ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                      }`}>
                        {isPaid ? 'Active' : 'On Trial'}
                      </span>
                    )}
                  </div>
                  <p className="mb-5 text-sm text-slate-400">{plan.desc}</p>

                  <div className="mb-6">
                    {plan.originalPrice && (
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm text-slate-500 line-through">₹{plan.originalPrice}</span>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">
                          {Math.round((1 - plan.price / plan.originalPrice) * 100)}% OFF
                        </span>
                      </div>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-black ${c.price}`}>₹{plan.price}</span>
                      <span className="text-sm text-slate-400">/month</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Billed monthly · renew anytime</p>
                  </div>

                  <ul className="mb-8 flex flex-col gap-2.5 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-slate-300">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent && isPaid ? (
                    <div className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Current Plan
                    </div>
                  ) : isCurrent && isTrial ? (
                    <div className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 py-3 text-sm font-semibold text-amber-400">
                      ✓ On Trial
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelect(plan.key)}
                      disabled={isRedirecting}
                      className={`mt-auto w-full rounded-xl bg-linear-to-r ${c.btn} py-3 text-center text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {isRedirecting
                        ? 'Redirecting…'
                        : isTrial
                          ? 'Switch (Free)'
                          : currentPlan
                            ? (PLAN_RANK[plan.key] > PLAN_RANK[currentPlan] ? 'Upgrade Plan' : 'Switch Plan')
                            : `Subscribe — ₹${plan.price}/mo`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-slate-600">
          All plans include AI Expert &amp; Refer&nbsp;&amp;&nbsp;Earn · Payments secured by PayU · 30-day money-back guarantee
        </p>
      </div>
    </div>
  );
}
