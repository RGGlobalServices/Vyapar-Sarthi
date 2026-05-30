'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import { motion } from 'framer-motion';

const testimonials = [
  {
    name: 'Ramesh Gupta',
    store: 'Kirana Store',
    quote: 'Pehle hisaab rakhte rakhte dimaag kharab ho jaata tha. Ab toh mobile uthao aur bill banao.',
    initials: 'RG',
  },
  {
    name: 'Sunita Agarwal',
    store: 'General Store',
    quote: 'Udhar ka hisaab kabhi mila nahi. Is app ne toh bahut easy kar diya.',
    initials: 'SA',
  },
  {
    name: 'Dr. Mahesh Patil',
    store: 'Medical Store',
    quote: 'AI se stock alert mil jaata hai. Kabhi expiry ka tension nahi.',
    initials: 'MP',
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Testimonials() {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section id="benefits" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Trusted by Shop Owners
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Hear from real businesses using Vyapar Sarthi every day.
          </p>
        </div>

        <motion.div
          ref={ref}
          variants={container}
          initial="hidden"
          animate={visible ? 'show' : 'hidden'}
          className="grid gap-8 md:grid-cols-3"
        >
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              variants={item}
              className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-600/50 hover:shadow-xl hover:shadow-indigo-500/5"
            >
              <div className="mb-4 flex gap-1">
                {[...Array(5)].map((_, s) => (
                  <svg key={s} className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <p className="mb-6 text-base leading-relaxed text-slate-300">&ldquo;{t.quote}&rdquo;</p>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-bold text-white">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.store}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
