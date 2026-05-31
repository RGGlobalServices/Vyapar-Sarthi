'use client';

import { motion } from 'framer-motion';

const plans = [
  {
    name: 'Shop',
    key: 'shop',
    desc: 'For retail Kirana & general stores',
    features: [
      'Unlimited products',
      'Smart billing & GST invoices',
      'Udhar book with WhatsApp reminders',
      'AI insights & predictions',
      'Sales reports & analytics',
      'Bulk import via Excel',
      'Multi-language support',
    ],
    popular: true,
  },
  {
    name: 'Wholesale',
    key: 'wholesale',
    desc: 'For wholesale & distribution businesses',
    features: [
      'Everything in Shop',
      'Dukandar (retailer) management',
      'Wholesale pricing tiers',
      'Bulk import/export',
      'Priority support',
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
  return (
    <section id="pricing" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Both plans are completely free during testing. No credit card required.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid gap-8 lg:grid-cols-2 max-w-4xl mx-auto"
        >
          {plans.map((plan, i) => (
            <motion.div
              key={plan.key}
              variants={item}
              className="relative flex flex-col rounded-2xl border border-slate-700/50 bg-slate-800/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-600/50"
            >
              <div className="relative z-10">
                <h3 className="mb-1 text-xl font-bold text-white">{plan.name}</h3>
                <p className="mb-4 text-sm text-slate-400">{plan.desc}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-emerald-400">Free</span>
                  <span className="ml-1 text-sm text-slate-400">/mo</span>
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
                  href={`/register?redirect=/payment&plan=${plan.key}`}
                  className="mt-auto block w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02]"
                >
                  Get Started Free
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
