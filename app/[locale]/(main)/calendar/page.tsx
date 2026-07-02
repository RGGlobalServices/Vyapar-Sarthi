'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil, Check,
  CalendarDays, Bell, ArrowDownLeft, ArrowUpRight, Loader2, IndianRupee, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type EventType = 'payment_in' | 'payment_out' | 'reminder' | 'event' | 'udhar_reminder';

interface CalEvent {
  id: string;
  title: string;
  description?: string | null;
  eventDate: string;
  eventType: EventType;
  amount?: number | null;
  customerName?: string | null;
  status: string;
  reminderDays: number;
}

export default function CalendarPage() {
  const t = useTranslations('Calendar');

  const TYPES: Record<EventType, { label: string; dot: string; chip: string; icon: any }> = {
    payment_in:  { label: t('paymentIn') || 'Payment to receive', dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', icon: ArrowDownLeft },
    payment_out: { label: t('paymentOut') || 'Payment to pay',     dot: 'bg-rose-500',    chip: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',          icon: ArrowUpRight },
    reminder:    { label: t('reminder') || 'Reminder',           dot: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',       icon: Bell },
    event:       { label: t('event') || 'Event',              dot: 'bg-sky-500',  chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',    icon: CalendarDays },
    udhar_reminder: { label: t('udharReminder') || 'Udhar Reminder', dot: 'bg-orange-500', chip: 'bg-orange-500/15 text-orange-400 ring-orange-500/30', icon: Bell },
  };

  const WEEKDAYS = [t('weekSun'), t('weekMon'), t('weekTue'), t('weekWed'), t('weekThu'), t('weekFri'), t('weekSat')];
  const MONTHS = [t('monthJan'), t('monthFeb'), t('monthMar'), t('monthApr'), t('monthMay'), t('monthJun'), t('monthJul'), t('monthAug'), t('monthSep'), t('monthOct'), t('monthNov'), t('monthDec')];

  const today = new Date();

  const inp = 'w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500';

  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
  const emptyForm = (date?: string) => ({
    id: '' as string,
    title: '',
    description: '',
    eventDate: date || ymd(new Date()),
    eventType: 'payment_in' as EventType,
    amount: '',
    customerName: '',
    reminderDays: 1,
  });

  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(false);

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/calendar?month=${monthKey}`);
      setEvents(res.data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => { load(); }, [load]);

  // Map events by YYYY-MM-DD
  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const e of events) {
      const k = ymd(new Date(e.eventDate));
      (m[k] ||= []).push(e);
    }
    return m;
  }, [events]);

  const upcoming = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return [...events]
      .filter(e => e.status === 'pending' && new Date(e.eventDate) >= now)
      .sort((a, b) => +new Date(a.eventDate) - +new Date(b.eventDate))
      .slice(0, 8);
  }, [events]);

  // Build the grid (6 weeks)
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay();
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  function openAdd(date?: string) {
    setForm(emptyForm(date));
    setEditing(false);
    setModalOpen(true);
  }
  function openEdit(e: CalEvent) {
    setForm({
      id: e.id,
      title: e.title,
      description: e.description || '',
      eventDate: ymd(new Date(e.eventDate)),
      eventType: e.eventType,
      amount: e.amount != null ? String(e.amount) : '',
      customerName: e.customerName || '',
      reminderDays: e.reminderDays ?? 1,
    });
    setEditing(true);
    setModalOpen(true);
  }

  // Optimistic: the event appears/updates instantly; the server syncs in the
  // background and we roll back only if it fails. No blocking refetch/spinner.
  async function save() {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title,
      description: form.description,
      eventDate: form.eventDate,
      eventType: form.eventType,
      amount: form.amount,
      customerName: form.customerName,
      reminderDays: form.reminderDays,
    };
    const optimisticFields = {
      title: form.title,
      description: form.description,
      eventDate: form.eventDate,
      eventType: form.eventType,
      amount: form.amount ? Number(form.amount) : null,
      customerName: form.customerName,
      reminderDays: form.reminderDays,
    };
    setModalOpen(false);
    const prev = events;
    if (editing && form.id) {
      setEvents((evs) => evs.map((e) => (e.id === form.id ? { ...e, ...optimisticFields } : e)));
      try { await api.patch(`/calendar/${form.id}`, payload); }
      catch { setEvents(prev); }
    } else {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const optimistic: CalEvent = { id: tempId, status: 'pending', ...optimisticFields };
      setEvents((evs) => [...evs, optimistic]);
      try {
        const res = await api.post('/calendar', payload);
        const realId = res.data?.id;
        if (realId) setEvents((evs) => evs.map((e) => (e.id === tempId ? { ...e, id: realId } : e)));
      } catch { setEvents((evs) => evs.filter((e) => e.id !== tempId)); }
    }
  }

  async function remove(id: string) {
    const prev = events;
    setEvents((evs) => evs.filter((e) => e.id !== id));
    try { await api.delete(`/calendar/${id}`); }
    catch { setEvents(prev); }
  }
  async function toggleDone(e: CalEvent) {
    const next = e.status === 'completed' ? 'pending' : 'completed';
    const prev = events;
    setEvents((evs) => evs.map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    try { await api.patch(`/calendar/${e.id}`, { status: next }); }
    catch { setEvents(prev); }
  }

  const isToday = (d: Date) => ymd(d) === ymd(today);
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-sky-500/30 flex items-center justify-center text-white transform -rotate-3 hover:rotate-0 transition-transform duration-300">
            <CalendarDays className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">{t('title') || 'Calendar'}</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">{t('paymentsEvents') || 'Payments, reminders & events — never miss a date'}</p>
          </div>
        </div>
        <button onClick={() => openAdd()}
          className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-xl shadow-sky-500/25 hover:shadow-sky-500/40 hover:-translate-y-0.5 transition-all duration-300">
          <Plus size={18} strokeWidth={3} /> {t('addEvent') || 'Add Event'}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Calendar grid */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="p-2 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-400"><ChevronLeft size={18} /></button>
              <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-300">{t('today') || 'Today'}</button>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="p-2 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-400"><ChevronRight size={18} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 py-2">{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="h-[460px] flex items-center justify-center text-sky-500"><Loader2 className="animate-spin w-10 h-10" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {cells.map((d, i) => {
                const key = ymd(d);
                const dayEvents = byDay[key] || [];
                const isTodayD = isToday(d);
                const inMonthD = inMonth(d);
                return (
                  <button key={i} onClick={() => openAdd(key)}
                    className={cn(
                      'min-h-[80px] sm:min-h-[100px] rounded-2xl border p-2 text-left flex flex-col gap-1.5 transition-all duration-300 group overflow-hidden relative',
                      inMonthD 
                        ? 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl hover:shadow-sky-500/5 hover:-translate-y-1 hover:border-sky-500/30' 
                        : 'bg-transparent border-transparent opacity-40 hover:opacity-80 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      isTodayD && 'bg-sky-50/50 dark:bg-sky-500/5 border-sky-500/30 ring-1 ring-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.1)]',
                    )}>
                    <div className="flex justify-between items-start w-full">
                      <span className={cn(
                        'text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full transition-colors', 
                        isTodayD 
                          ? 'bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-md shadow-sky-500/40' 
                          : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 group-hover:bg-slate-100 dark:group-hover:bg-slate-700'
                      )}>
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 w-full flex-1">
                      {dayEvents.slice(0, 3).map(e => (
                        <span key={e.id} onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          className={cn('flex items-center gap-1.5 text-[10px] font-semibold leading-tight truncate rounded-md px-1.5 py-1 transition-transform hover:scale-[1.02] active:scale-95 shadow-sm',
                            TYPES[e.eventType]?.chip, 'ring-1 border border-transparent hover:border-current/20', e.status === 'completed' && 'line-through opacity-50 grayscale')}>
                          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 shadow-sm', TYPES[e.eventType]?.dot)} />
                          <span className="truncate">{e.title}</span>
                        </span>
                      ))}
                      {dayEvents.length > 3 && <span className="text-[10px] font-bold text-slate-400 pl-1 group-hover:text-sky-500 transition-colors">+{dayEvents.length - 3} {t('moreEvents', { count: '' }).replace('+{count} ', '') || 'more'}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            {Object.entries(TYPES).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className={cn('w-2 h-2 rounded-full', v.dot)} /> {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* Upcoming panel */}
        <div className="bg-gradient-to-b from-white to-slate-50 dark:from-slate-900/80 dark:to-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 h-fit shadow-xl shadow-slate-200/50 dark:shadow-none">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center ring-1 ring-amber-500/20">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">{t('upcoming') || 'Upcoming'}</h2>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{t('nextEvents', { count: upcoming.length }) || `NEXT ${upcoming.length} EVENTS`}</p>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center opacity-60">
              <CalendarDays className="w-12 h-12 text-slate-400 mb-3" />
              <p className="text-sm font-semibold text-slate-500">{t('noUpcoming') || 'No upcoming events this month.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(e => {
                const Icon = TYPES[e.eventType]?.icon || CalendarDays;
                const d = new Date(e.eventDate);
                return (
                  <div key={e.id} className="group flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 hover:border-sky-500/30 dark:hover:border-sky-500/30 hover:shadow-lg hover:shadow-sky-500/5 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer" onClick={() => openEdit(e)}>
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 shadow-sm transition-transform group-hover:scale-110', TYPES[e.eventType]?.chip)}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-500 transition-colors">{e.title}</p>
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-0.5">
                        <span className="text-slate-700 dark:text-slate-300">{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        {e.amount != null && <><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" /><span className="text-emerald-500 font-bold">{inr(e.amount)}</span></>}
                        {e.customerName && <><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" /><span className="truncate">{e.customerName}</span></>}
                      </div>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-500/10 rounded-lg transition-all active:scale-95"><Pencil size={15} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">{editing ? (t('editEvent') || 'Edit Event') : (t('newEvent') || 'New Event')}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelTitle') || 'TITLE'}</label>
                <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder={t('placeholderTitle') || 'e.g. Collect from Sharma Stores'} className={inp + ' mt-1'} />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelType') || 'TYPE'}</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {(Object.keys(TYPES) as EventType[]).map(k => {
                    const Icon = TYPES[k].icon;
                    const active = form.eventType === k;
                    return (
                      <button key={k} type="button" onClick={() => setForm({ ...form, eventType: k })}
                        className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ring-1 transition-all',
                          active ? TYPES[k].chip : 'bg-slate-100 dark:bg-slate-800/ text-slate-400 ring-slate-700 hover:ring-slate-600')}>
                        <Icon size={14} /> {TYPES[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelDate') || 'DATE'}</label>
                  <input type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value })} className={inp + ' mt-1'} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelAmount') || 'AMOUNT (OPTIONAL)'}</label>
                  <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className={inp + ' mt-1'} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelCustomer') || 'CUSTOMER (OPTIONAL)'}</label>
                  <input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder={t('placeholderCustomer') || 'Name'} className={inp + ' mt-1'} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelRemind') || 'REMIND (DAYS BEFORE)'}</label>
                  <input type="number" min={0} value={form.reminderDays} onChange={e => setForm({ ...form, reminderDays: parseInt(e.target.value) || 0 })} className={inp + ' mt-1'} />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('labelNote') || 'NOTE (OPTIONAL)'}</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder={t('placeholderNote') || 'Details…'} className={inp + ' mt-1 resize-none'} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-200 dark:border-slate-800">
              {editing ? (
                <button onClick={() => { remove(form.id); setModalOpen(false); }}
                  className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 text-sm font-medium px-3 py-2 rounded-lg hover:bg-rose-500/10">
                  <Trash2 size={15} /> {t('delete') || 'Delete'}
                </button>
              ) : <span />}
              <button onClick={save} disabled={saving || !form.title.trim()}
                className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 dark:text-white text-sm font-semibold px-5 py-2 rounded-lg">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {editing ? (t('save') || 'Save') : (t('addEvent') || 'Add Event')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
