'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { config } from '@/lib/config';

interface StatsData {
  shops: number;
  wholesalers: number;
  businessTypes: number;
  categories: number;
}

export default function StatsSection() {
  const [stats, setStats] = useState<StatsData>({
    shops: 128,
    wholesalers: 15,
    businessTypes: 7,
    categories: 36,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${config.API_BASE}/marketing/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats({
            shops: data.shops,
            wholesalers: data.wholesalers,
            businessTypes: data.businessTypes,
            categories: data.categories,
          });
        }
      } catch (err) {
        console.error('Failed to fetch marketing stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const statItems = [
    {
      id: 'shops',
      value: stats.shops,
      suffix: '+',
      label: 'Shops Registered',
      desc: 'Active retail counters, kiranas, and general stores.',
      color: 'text-emerald-400',
      bgGlow: 'from-emerald-500/10 to-teal-500/10',
      borderColor: 'group-hover:border-emerald-500/30',
      icon: (
        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: 'wholesalers',
      value: stats.wholesalers,
      suffix: '+',
      label: 'Wholesalers Connected',
      desc: 'Active wholesale channels and bulk distributors.',
      color: 'text-indigo-400',
      bgGlow: 'from-indigo-500/10 to-blue-500/10',
      borderColor: 'group-hover:border-indigo-500/30',
      icon: (
        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'businessTypes',
      value: stats.businessTypes,
      suffix: '',
      label: 'Business Verticals',
      desc: 'Sectors configured (Kirana, Pharmacy, Footwear, Clothes, Electronics).',
      color: 'text-amber-400',
      bgGlow: 'from-amber-500/10 to-orange-500/10',
      borderColor: 'group-hover:border-amber-500/30',
      icon: (
        <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'categories',
      value: stats.categories,
      suffix: '+',
      label: 'Product Categories',
      desc: 'Unique stock classification categories managed.',
      color: 'text-purple-400',
      bgGlow: 'from-purple-500/10 to-pink-500/10',
      borderColor: 'group-hover:border-purple-500/30',
      icon: (
        <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
  ];

  return (
    <section id="benefits" className="relative px-4 py-16 sm:px-6 lg:px-8 bg-slate-950/20 border-y border-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold mb-4 uppercase tracking-wider">
            Live Platform Activity
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
            Empowering Small Businesses Across India
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-400">
            Real database counts show how shop owners are standardizing their workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statItems.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="group relative flex flex-col justify-between p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md hover:scale-[1.02] hover:border-indigo-500/20 transition-all duration-300 shadow-xl"
            >
              {/* Radial glow effect */}
              <div className={`absolute -inset-px bg-gradient-to-r ${item.bgGlow} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm -z-10`} />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/50">
                    {item.icon}
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live data synced" />
                </div>

                <div className="flex items-baseline gap-1">
                  <span className={`text-4xl font-black ${item.color} tracking-tight`}>
                    {item.value}
                  </span>
                  <span className={`text-2xl font-bold ${item.color}`}>
                    {item.suffix}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-200 mt-2">
                  {item.label}
                </h3>
              </div>

              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                {item.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
