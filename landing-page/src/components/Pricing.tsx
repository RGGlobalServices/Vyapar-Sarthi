'use client';

import { useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { motion } from 'framer-motion';

const plans = [
  {
    name: 'Small Store',
    monthly: 699,
    yearly: 599,
    desc: 'For small Kirana shops',
    features: [
      'Up to 500 products',
      'Basic billing & invoices',
      'Udhar management',
      'Daily sales reports',
      'Email support',
    ],
    popular: false,
  },
  {
    name: 'Big Store',
    monthly: 1199,
    yearly: 999,
    desc: 'For medium to large stores',
    features: [
      'Unlimited products',
      'Advanced billing & GST invoices',
      'Udhar management with reminders',
      'AI insights & predictions',
      'Bulk import via Excel',
      'Multi-language support',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Wholesale',
    monthly: 1799,
    yearly: 1499,
    desc: 'For wholesale businesses',
    features: [
      'Everything in Big Store',
      'Wholesale pricing tiers',
      'Multi-branch management',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
      '24/7 phone support',
    ],
    popular: false,
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Pricing() {
  const [annual, setAnnual] = useState(true);
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section id="pricing" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Simple Pricing
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Choose the plan that fits your business. No hidden fees.
          </p>
        </div>

        <div className="mb-10 flex items-center justify-center gap-4">
          <span className={`text-sm ${!annual ? 'text-white' : 'text-slate-500'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-7 w-14 rounded-full transition-colors ${
              annual ? 'bg-indigo-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                annual ? 'translate-x-7' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-sm ${annual ? 'text-white' : 'text-slate-500'}`}>
            Annual{' '}
            <span className="text-xs text-emerald-400">(Save 15%)</span>
          </span>
        </div>

        <motion.div
          ref={ref}
          variants={container}
          initial="hidden"
          animate={visible ? 'show' : 'hidden'}
          className="grid gap-8 lg:grid-cols-3"
        >
          {plans.map((plan, i) => (
            <motion.div
              key={i}
              variants={item}
              className="relative flex flex-col rounded-2xl border border-slate-700/50 bg-slate-800/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-600/50"
            >
              <div className="relative z-10">
                <h3 className="mb-1 text-xl font-bold text-white">{plan.name}</h3>
                <p className="mb-4 text-sm text-slate-400">{plan.desc}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">
                    ₹{annual ? plan.yearly.toLocaleString() : plan.monthly.toLocaleString()}
                  </span>
                  <span className="ml-1 text-sm text-slate-400">/mo</span>
                  {annual && (
                    <p className="mt-1 text-xs text-slate-500">billed annually</p>
                  )}
                </div>

                <ul className="mb-8 flex flex-col gap-3">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-slate-300">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href="/register?redirect=/payment"
                  className="mt-auto block w-full rounded-xl border border-slate-600 py-3 text-center text-sm font-semibold text-slate-300 transition-all hover:border-emerald-500/50 hover:text-white"
                >
                  Get Started
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
