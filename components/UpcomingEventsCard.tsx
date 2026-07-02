'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { CalendarDays, ArrowDownLeft, ArrowUpRight, Bell, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

type EventType = 'payment_in' | 'payment_out' | 'reminder' | 'event' | 'udhar_reminder';

interface CalEvent {
  id: string;
  title: string;
  eventDate: string;
  eventType: EventType;
  amount?: number | null;
  customerName?: string | null;
}

const META: Record<EventType, { chip: string; icon: any }> = {
  payment_in:     { chip: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', icon: ArrowDownLeft },
  payment_out:    { chip: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',          icon: ArrowUpRight },
  reminder:       { chip: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',       icon: Bell },
  event:          { chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',             icon: CalendarDays },
  udhar_reminder: { chip: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',    icon: Bell },
};

function dayLabel(iso: string) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((+d - +today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function UpcomingEventsCard() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/calendar?upcoming=14');
        setEvents(res.data || []);
      } catch { setEvents([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="h-28 bg-slate-100 dark:bg-slate-900/50 rounded-2xl animate-pulse border border-slate-200 dark:border-slate-800" />;
  if (events.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <CalendarDays size={16} className="text-sky-500 dark:text-sky-400" /> Upcoming Events
        </h3>
        <button onClick={() => router.push(`/${locale}/calendar`)}
          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium">
          View all <ChevronRight size={13} />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {events.slice(0, 6).map(e => {
          const Icon = META[e.eventType]?.icon || CalendarDays;
          return (
            <button key={e.id} onClick={() => router.push(`/${locale}/calendar`)}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-left transition-all">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1', META[e.eventType]?.chip)}>
                <Icon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{e.title}</p>
                <p className="text-[11px] text-slate-500">
                  {dayLabel(e.eventDate)}
                  {e.amount != null ? ` · ₹${Number(e.amount).toLocaleString('en-IN')}` : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
