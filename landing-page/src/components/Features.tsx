'use client';

import { motion } from 'framer-motion';

const badgeStyles = {
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', dot: 'bg-indigo-400', text: 'text-indigo-400', icon: 'bg-indigo-500', glow: 'from-indigo-500/10 to-blue-500/10' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400', text: 'text-emerald-400', icon: 'bg-emerald-500', glow: 'from-emerald-500/10 to-teal-500/10' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-400', text: 'text-amber-400', icon: 'bg-amber-500', glow: 'from-amber-500/10 to-orange-500/10' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', dot: 'bg-purple-400', text: 'text-purple-400', icon: 'bg-purple-500', glow: 'from-purple-500/10 to-pink-500/10' },
};

const mainFeatures = [
  {
    id: 'billing',
    title: 'Smart Billing',
    subtitle: 'Fast, accurate, and print-ready bills in seconds',
    desc: 'Create professional bills instantly with our intuitive billing interface. Designed for speed — whether it\'s a single item or a full cart.',
    points: [
      'Generate GST-compliant invoices with auto-calculation',
      'Print or share bills via WhatsApp instantly',
      'Support for returns, discounts, and partial payments',
      'Auto-save draft bills for quick repeat customers',
    ],
    badge: 'indigo' as keyof typeof badgeStyles,
    img: (
      <svg viewBox="0 0 400 320" className="w-full h-auto" fill="none">
        <rect x="20" y="20" width="360" height="280" rx="16" className="fill-slate-800/80 stroke-slate-700" strokeWidth="1.5" />
        <rect x="40" y="40" width="320" height="40" rx="8" className="fill-indigo-500/20 stroke-indigo-500/30" strokeWidth="1" />
        <text x="60" y="65" className="fill-indigo-400 text-xs font-bold" fontSize="13">INVOICE #INV-0042</text>
        <text x="280" y="65" className="fill-slate-500 text-[10px]" fontSize="10">29 May 2026</text>
        <rect x="40" y="95" width="150" height="30" rx="6" className="fill-slate-700/50" />
        <text x="55" y="114" className="fill-slate-300 text-[10px]" fontSize="10">Customer: Ramesh Kumar</text>
        <rect x="40" y="135" width="320" height="2" className="fill-slate-700" />
        <text x="55" y="162" className="fill-slate-100 text-xs font-semibold" fontSize="12">Atta 10kg</text>
        <text x="280" y="162" className="fill-slate-100 text-xs font-semibold" fontSize="12">₹320</text>
        <text x="220" y="162" className="fill-slate-100 text-xs font-semibold" fontSize="12">1</text>
        <text x="320" y="162" className="fill-slate-100 text-xs font-semibold" fontSize="12">₹320</text>
        <rect x="40" y="195" width="320" height="2" className="fill-slate-700" />
        <text x="220" y="220" className="fill-slate-400 text-[10px]" fontSize="10">Subtotal</text>
        <text x="310" y="220" className="fill-slate-100 text-sm font-bold" fontSize="13">₹500</text>
        <text x="220" y="240" className="fill-slate-400 text-[10px]" fontSize="10">GST (5%)</text>
        <text x="310" y="240" className="fill-slate-100 text-sm font-bold" fontSize="13">₹25</text>
        <rect x="40" y="250" width="320" height="2" className="fill-slate-700" />
        <text x="220" y="272" className="fill-indigo-400 text-xs font-bold" fontSize="12">Total</text>
        <text x="290" y="272" className="fill-indigo-400 text-lg font-black" fontSize="18">₹525</text>
      </svg>
    ),
  },
  {
    id: 'inventory',
    title: 'Inventory Management',
    subtitle: 'Never run out of stock again',
    desc: 'Track every item in your shop in real time. Get alerts when stock runs low and know exactly what to reorder.',
    points: [
      'Real-time stock tracking for thousands of products',
      'Low-stock and expiry alerts via notification',
      'Bulk import products from Excel/CSV in minutes',
      'Categorize by type — Kirana, Pharmacy, General Store & more',
    ],
    badge: 'emerald' as keyof typeof badgeStyles,
    img: (
      <svg viewBox="0 0 400 320" className="w-full h-auto" fill="none">
        <rect x="20" y="20" width="360" height="280" rx="16" className="fill-slate-800/80 stroke-slate-700" strokeWidth="1.5" />
        <rect x="40" y="40" width="120" height="28" rx="8" className="fill-emerald-500/20" />
        <text x="52" y="59" className="fill-emerald-400 text-xs font-bold" fontSize="11">INVENTORY</text>
        <rect x="280" y="40" width="80" height="28" rx="8" className="fill-amber-500/20" />
        <text x="294" y="59" className="fill-amber-400 text-[10px] font-bold" fontSize="10">3 LOW</text>
        {['Rice 5kg', 'Atta', 'Sugar', 'Dal', 'Oil', 'Spices'].map((name, i) => (
          <g key={i}>
            <rect x="40" y={85 + i * 33} width="320" height="28" rx="6" className="fill-slate-700/30" />
            <text x="55" y={103 + i * 33} className="fill-slate-100 text-xs font-semibold" fontSize="11">{name}</text>
            <rect x="200" y={92 + i * 33} width="80" height="14" rx="4" className="fill-slate-700" />
            <rect x="200" y={92 + i * 33} width={[60, 70, 20, 50, 65, 45][i]} height="14" rx="4" className={[2, 5].includes(i) ? 'fill-emerald-500' : [0].includes(i) ? 'fill-amber-500' : 'fill-red-500'} />
            <text x="295" y={103 + i * 33} className={[0, 3, 4, 5].includes(i) ? 'fill-emerald-400 text-[10px] font-bold' : 'fill-red-400 text-[10px] font-bold'} fontSize="10">{[120, 85, 8, 45, 200, 95][i]}</text>
          </g>
        ))}
      </svg>
    ),
  },
  {
    id: 'udhar',
    title: 'Udhar Book',
    subtitle: 'Digital ledger for credit sales & pending payments',
    desc: 'Replace your physical udhar book with a smart digital ledger. Track who owes you, send reminders, and never lose a record.',
    points: [
      'Record credit sales with customer name & phone',
      'Automatic total due calculation for each customer',
      'Send WhatsApp payment reminders in one tap',
      'View payment history and udhar reports anytime',
    ],
    badge: 'amber' as keyof typeof badgeStyles,
    img: (
      <svg viewBox="0 0 400 320" className="w-full h-auto" fill="none">
        <rect x="20" y="20" width="360" height="280" rx="16" className="fill-slate-800/80 stroke-slate-700" strokeWidth="1.5" />
        <rect x="40" y="40" width="100" height="28" rx="8" className="fill-amber-500/20" />
        <text x="50" y="59" className="fill-amber-400 text-xs font-bold" fontSize="11">UDHAR BOOK</text>
        <text x="300" y="59" className="fill-amber-400 text-[10px] font-bold" fontSize="10">₹12,450 Due</text>
        <rect x="40" y="75" width="320" height="2" className="fill-slate-700" />
        {[
          { name: 'Ramesh Sharma', due: '₹4,200', status: '15 days', color: '#f87171' },
          { name: 'Suresh Patel', due: '₹3,800', status: '8 days', color: '#fbbf24' },
          { name: 'Amit Verma', due: '₹2,450', status: '3 days', color: '#fbbf24' },
          { name: 'Vijay Singh', due: '₹1,200', status: '1 day', color: '#34d399' },
          { name: 'Dinesh Yadav', due: '₹800', status: 'Today', color: '#34d399' },
        ].map((c, i) => (
          <g key={i}>
            <rect x="40" y={85 + i * 40} width="320" height="34" rx="6" className="fill-slate-700/20" />
            <circle cx="62" cy={104 + i * 40} r="12" className="fill-slate-700 stroke-slate-600" strokeWidth="1" />
            <text x="62" y={108 + i * 40} className="fill-slate-300 text-xs font-bold" fontSize="10" textAnchor="middle">{c.name.charAt(0)}</text>
            <text x="85" y={100 + i * 40} className="fill-slate-100 text-xs font-semibold" fontSize="11">{c.name}</text>
            <text x="85" y={113 + i * 40} className="fill-slate-500 text-[9px]" fontSize="9">Due {c.status}</text>
            <text x="330" y={104 + i * 40} fill={c.color} fontSize="11" fontWeight="bold">{c.due}</text>
          </g>
        ))}
        <rect x="40" y="288" width="320" height="2" className="fill-slate-700" />
        <text x="290" y="310" className="fill-amber-400 text-xs font-bold" fontSize="11">Total Due: ₹12,450</text>
      </svg>
    ),
  },
  {
    id: 'ai',
    title: 'AI Insights',
    subtitle: 'Smart suggestions powered by artificial intelligence',
    desc: 'Let AI analyze your sales data and give you actionable recommendations to grow your business and reduce losses.',
    points: [
      'Predict best-selling products for upcoming season',
      'Smart pricing suggestions to maximize profit',
      'Detect slow-moving stock and suggest discounts',
      'Get daily sales summary & business health score',
    ],
    badge: 'purple' as keyof typeof badgeStyles,
    img: (
      <svg viewBox="0 0 400 320" className="w-full h-auto" fill="none">
        <rect x="20" y="20" width="360" height="280" rx="16" className="fill-slate-800/80 stroke-slate-700" strokeWidth="1.5" />
        <rect x="40" y="40" width="80" height="28" rx="8" className="fill-purple-500/20" />
        <text x="50" y="59" className="fill-purple-400 text-xs font-bold" fontSize="11">AI INSIGHTS</text>
        <rect x="280" y="40" width="80" height="28" rx="20" className="fill-purple-500/20 stroke-purple-500/30" strokeWidth="1" />
        <text x="292" y="59" className="fill-purple-400 text-[9px] font-bold" fontSize="9">LIVE</text>
        <circle cx="354" cy="54" r="3" fill="#a78bfa"><animate attributeName="opacity" values="1;0;1" dur="1.5s" repeatCount="indefinite" /></circle>
        <rect x="40" y="80" width="320" height="55" rx="8" className="fill-slate-700/30" />
        <text x="55" y="100" className="fill-slate-300 text-xs font-bold" fontSize="11">📈 Sales Forecast</text>
        <text x="55" y="120" className="fill-slate-400 text-[10px]" fontSize="10">Expected sales this week: ₹18,500</text>
        <rect x="40" y="145" width="320" height="55" rx="8" className="fill-slate-700/30" />
        <text x="55" y="165" className="fill-slate-300 text-xs font-bold" fontSize="11">📦 Restock Alert</text>
        <text x="55" y="185" className="fill-slate-400 text-[10px]" fontSize="10">Top items to reorder: Rice, Oil, Spices</text>
        <rect x="40" y="210" width="320" height="55" rx="8" className="fill-slate-700/30" />
        <text x="55" y="230" className="fill-slate-300 text-xs font-bold" fontSize="11">💰 Profit Optimizer</text>
        <text x="55" y="250" className="fill-slate-400 text-[10px]" fontSize="10">Increase margin on Atta by 3% for +₹2,400/month</text>
        <rect x="220" y="275" width="140" height="24" rx="6" className="fill-purple-500/20" />
        <text x="235" y="292" className="fill-purple-400 text-[9px] font-bold" fontSize="9">View All Insights →</text>
      </svg>
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Everything You Need
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Powerful tools designed specifically for Indian small businesses and kirana shops.
          </p>
        </div>

        <div className="space-y-24">
          {mainFeatures.map((feature, i) => {
            const s = badgeStyles[feature.badge];
            return (
              <motion.div
                id={feature.id}
                key={feature.id}
                initial={{ y: 60 }}
                whileInView={{ y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className={`flex flex-col ${i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-12 lg:gap-16`}
              >
                <div className="flex-1 w-full max-w-lg lg:max-w-none">
                  <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${s.bg} ${s.border} border`}>
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    <span className={`text-sm font-semibold ${s.text}`}>{feature.title}</span>
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-bold text-slate-50 mt-4 leading-tight">
                    {feature.subtitle}
                  </h3>
                  <p className="text-slate-400 text-base leading-relaxed mt-4 max-w-md">
                    {feature.desc}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {feature.points.map((point, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${s.icon} rounded-full p-0.5`} viewBox="0 0 20 20" fill="white">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        </svg>
                        <span className="text-slate-300 text-sm">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-1 w-full max-w-lg lg:max-w-none">
                  <div className="relative">
                    <div className={`absolute -inset-4 bg-gradient-to-r ${s.glow} rounded-3xl blur-3xl`} />
                    <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900/60 p-2 shadow-2xl backdrop-blur-sm">
                      {feature.img}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
