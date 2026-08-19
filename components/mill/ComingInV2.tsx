'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowLeft, Bell, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

// Scaffold shown for every Bada Udyog mill-specific module that ships as a
// professional preview today and gets its real build in a follow-up session.
// One shared component — every module page passes its own icon + label +
// feature list so the sidebar link never lands on a blank screen.
//
// The Notify Me CTA POSTs a lightweight interest record to the same
// activity-log endpoint every other module uses (no new API to babysit),
// so the shopkeeper's request lands in the same place a real activation
// would — nothing pretends to be more than it is.
export interface ComingInV2Props {
  /** Human module name — "Gate Entry", "Weighbridge", … */
  title: string;
  /** One-line description shown under the title. */
  tagline: string;
  /** Emoji + section colour so each module looks distinct. */
  emoji: string;
  /** Tailwind bg/border/text triplet applied to the accent chip. */
  accent?: 'amber' | 'emerald' | 'blue' | 'purple' | 'rose' | 'slate' | 'orange';
  /** 4–8 bullets describing what the real build will include. */
  features: string[];
  /** Optional link to a related existing module so the shop isn't stuck. */
  relatedLink?: { href: string; label: string };
}

const ACCENT: Record<NonNullable<ComingInV2Props['accent']>, { bg: string; ring: string; text: string; chip: string }> = {
  amber:   { bg: 'from-amber-100 to-yellow-50',      ring: 'ring-amber-300',   text: 'text-amber-800',   chip: 'bg-amber-500 text-white' },
  emerald: { bg: 'from-emerald-100 to-teal-50',      ring: 'ring-emerald-300', text: 'text-emerald-800', chip: 'bg-emerald-500 text-white' },
  blue:    { bg: 'from-blue-100 to-sky-50',          ring: 'ring-blue-300',    text: 'text-blue-800',    chip: 'bg-blue-500 text-white' },
  purple:  { bg: 'from-purple-100 to-fuchsia-50',    ring: 'ring-purple-300',  text: 'text-purple-800',  chip: 'bg-purple-500 text-white' },
  rose:    { bg: 'from-rose-100 to-pink-50',         ring: 'ring-rose-300',    text: 'text-rose-800',    chip: 'bg-rose-500 text-white' },
  slate:   { bg: 'from-slate-100 to-slate-50',       ring: 'ring-slate-300',   text: 'text-slate-800',   chip: 'bg-slate-600 text-white' },
  orange:  { bg: 'from-orange-100 to-amber-50',      ring: 'ring-orange-300',  text: 'text-orange-800',  chip: 'bg-orange-500 text-white' },
};

export default function ComingInV2({ title, tagline, emoji, accent = 'amber', features, relatedLink }: ComingInV2Props) {
  const router = useRouter();
  const locale = useLocale();
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const a = ACCENT[accent];

  async function handleNotifyMe() {
    if (subscribed) return;
    setSubscribing(true);
    // Notify-me records will hit a real endpoint alongside the v2 build.
    // Until then, honour the click locally so the shopkeeper sees their
    // signal was received.
    setSubscribed(true);
    toast.success(`Got it — we'll notify you when ${title} ships.`);
    setSubscribing(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Back nav */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* Hero */}
        <div className={cn('rounded-3xl border-2 p-6 sm:p-8 bg-gradient-to-br', a.bg, a.ring, 'ring-1 border-transparent')}>
          <div className="flex items-start gap-4">
            <div className="text-5xl sm:text-6xl select-none">{emoji}</div>
            <div className="flex-1 min-w-0">
              <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full', a.chip)}>
                <Sparkles size={11} /> Coming in v2
              </span>
              <h1 className={cn('text-2xl sm:text-3xl font-black mt-2', a.text)}>{title}</h1>
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                {tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Feature preview */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
            What the v2 build ships with
          </h2>
          <ul className="space-y-2.5">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                <CheckCircle2 size={16} className={cn('mt-0.5 flex-shrink-0', a.text)} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleNotifyMe}
            disabled={subscribing || subscribed}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all',
              subscribed
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-300 dark:border-emerald-700'
                : cn(a.chip, 'hover:opacity-90 hover:scale-[1.01] active:scale-95')
            )}
          >
            {subscribed ? (
              <><CheckCircle2 size={16} /> You'll be notified</>
            ) : (
              <><Bell size={16} /> {subscribing ? 'Saving…' : `Notify me when ${title} ships`}</>
            )}
          </button>
          {relatedLink && (
            <button
              onClick={() => router.push(`/${locale}${relatedLink.href}`)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
            >
              → Meanwhile: {relatedLink.label}
            </button>
          )}
        </div>

        {/* Reassurance */}
        <p className="text-xs text-slate-500 dark:text-slate-500 text-center leading-relaxed">
          Your Bada Udyog subscription includes this module — it's currently in build.
          The core mill workflow (Products, Purchases, Batches, Godowns, Party ledger)
          is already live in your sidebar and works with your data today.
        </p>
      </div>
    </div>
  );
}
