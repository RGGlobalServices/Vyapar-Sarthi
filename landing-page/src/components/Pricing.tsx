'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { isLoggedIn, getToken, apiGet } from '@/lib/auth';

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

const colorMap: Record<string, { ring: string; badge: string; price: string; btn: string; activeBorder: string }> = {
  sky:    { ring: 'ring-sky-500/30',    badge: 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30',       price: 'text-sky-400',    btn: 'from-sky-500 to-cyan-500 shadow-sky-500/25',        activeBorder: 'border-sky-500/60 ring-1 ring-sky-500/30' },
  indigo: { ring: 'ring-indigo-500/30', badge: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30', price: 'text-indigo-300', btn: 'from-indigo-500 to-violet-500 shadow-indigo-500/25', activeBorder: 'border-indigo-500/60 ring-1 ring-indigo-500/30' },
  purple: { ring: 'ring-purple-500/30', badge: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30', price: 'text-purple-400', btn: 'from-purple-500 to-pink-500 shadow-purple-500/25',   activeBorder: 'border-purple-500/60 ring-1 ring-purple-500/30' },
};

// Plan tier order for upgrade/downgrade labelling.
const PLAN_RANK: Record<string, number> = { starter: 0, shop: 0, vyapar: 1, wholesale: 2 };

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Pricing() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string>('');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    if (!isLoggedIn()) return;
    const token = getToken();
    if (!token) return;
    (async () => {
      try {
        const shop = await apiGet('/shop/profile', token);
        const status = (shop?.subscription_status ?? shop?.subscriptionStatus ?? '').toLowerCase();
        const plan = (shop?.subscription_plan ?? shop?.subscriptionPlan ?? '').toLowerCase();
        setSubStatus(status);
        // Show current plan for trial and active alike (matches the navbar);
        // expired/cancelled users have no current plan.
        if (plan && status !== 'expired' && status !== 'cancelled') setCurrentPlan(plan);
      } catch {}
    })();
  }, []);

  const isPaid = subStatus === 'active';
  const isTrial = subStatus === 'trial';

  return (
    <section id="pricing" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Simple, Honest Pricing
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Start with a 7-day free trial — get [14 days with referral code]. No credit card required.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid gap-8 lg:grid-cols-3 max-w-6xl mx-auto items-start"
        >
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.key || (plan.key === 'shop' && currentPlan === 'starter');
            const isActive = isCurrent && isPaid;
            const c = colorMap[plan.color];
            return (
              <motion.div
                key={plan.key}
                variants={item}
                className={`relative flex flex-col rounded-2xl border bg-slate-800/40 p-8 transition-all duration-300 hover:-translate-y-1 ${
                  isActive ? c.activeBorder : 'border-slate-700/50 hover:border-slate-600/50'
                }`}
              >
                {/* Popular badge */}
                {plan.popular && !isActive && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-indigo-500 px-4 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/40">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="relative z-10 flex flex-col h-full">
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
                    <p className="text-xs text-slate-500 mt-1">7-day free trial · [14 days with referral code]</p>
                  </div>

                  <ul className="mb-8 flex flex-col gap-2.5 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-slate-300">
                        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                    <a
                      href={loggedIn ? `/payment?plan=${plan.key}` : `/register?redirect=/payment&plan=${plan.key}`}
                      className={`mt-auto block w-full rounded-xl bg-linear-to-r ${c.btn} py-3 text-center text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02]`}
                    >
                      {!loggedIn
                        ? 'Start Free Trial'
                        : isTrial
                          ? 'Switch (Free)'
                          : currentPlan
                            ? (PLAN_RANK[plan.key] > PLAN_RANK[currentPlan] ? 'Upgrade Plan' : 'Switch Plan')
                            : `Subscribe — ₹${plan.price}/mo`}
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <p className="mt-10 text-center text-xs text-slate-600">
          All plans include AI Expert &amp; Refer&nbsp;&amp;&nbsp;Earn · Powered by PayU · Cancel anytime
        </p>
      </div>
    </section>
  );
}
