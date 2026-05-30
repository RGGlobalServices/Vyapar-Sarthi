'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import { motion } from 'framer-motion';

export default function FinalCTA() {
  const { ref, visible } = useScrollReveal(0.2);

  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 30 }}
        animate={visible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-4xl"
      >
        <div className="relative rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-cyan-600 p-8 text-center shadow-2xl shadow-indigo-500/25 sm:p-16">
          <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_60%)]" />

          <div className="relative z-10">
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Start Today — Completely Free
            </h2>
            <p className="mb-8 text-lg text-indigo-200">
              Join 2,000+ shop owners. No credit card required.
            </p>

            <a
              href="/register"
              className="mb-6 inline-block rounded-xl bg-white px-10 py-4 text-base font-bold text-indigo-600 shadow-xl transition-all hover:scale-105 hover:shadow-2xl"
            >
              Create Free Account
            </a>

            <p className="text-sm text-indigo-200/80">
              No credit card required • Free forever plan • 24/7 Support
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
