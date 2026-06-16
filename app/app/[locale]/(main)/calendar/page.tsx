'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil, Check,
  CalendarDays, Bell, ArrowDownLeft, ArrowUpRight, Loader2, IndianRupee, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type EventType = 'payment_in' | 'payment_out' | 'reminder' | 'event';

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

const TYPES: Record<EventType, { label: string; dot: string; chip: string; icon: any }> = {
  payment_in:  { label: 'Payment to receive', dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', icon: ArrowDownLeft },
  payment_out: { label: 'Payment to pay',     dot: 'bg-rose-500',    chip: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',          icon: ArrowUpRight },
  reminder:    { label: 'Reminder',           dot: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',       icon: Bell },
  event:       { label: 'Event',              dot: 'bg-sky-500',  chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',    icon: CalendarDays },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const inp = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500';

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function inr(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

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

export default function CalendarPage() {
  const today = new Date();
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

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        eventDate: form.eventDate,
        eventType: form.eventType,
        amount: form.amount,
        customerName: form.customerName,
        reminderDays: form.reminderDays,
      };
      if (editing && form.id) await api.patch(`/calendar/${form.id}`, payload);
      else await api.post('/calendar', payload);
      setModalOpen(false);
      await load();
    } catch {} finally { setSaving(false); }
  }

  async function remove(id: string) {
    try { await api.delete(`/calendar/${id}`); await load(); } catch {}
  }
  async function toggleDone(e: CalEvent) {
    try { await api.patch(`/calendar/${e.id}`, { status: e.status === 'done' ? 'pending' : 'done' }); await load(); } catch {}
  }

  const isToday = (d: Date) => ymd(d) === ymd(today);
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 ring-1 ring-sky-500/30 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Calendar</h1>
            <p className="text-xs text-slate-500">Payments, reminders &amp; events — never miss a date</p>
          </div>
        </div>
        <button onClick={() => openAdd()}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-sky-500/25 transition-all">
          <Plus size={16} /> Add Event
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Calendar grid */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><ChevronLeft size={18} /></button>
              <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-slate-800 text-slate-300">Today</button>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><ChevronRight size={18} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-600 py-1">{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="h-[460px] flex items-center justify-center text-slate-600"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                const key = ymd(d);
                const dayEvents = byDay[key] || [];
                return (
                  <button key={i} onClick={() => openAdd(key)}
                    className={cn(
                      'min-h-[68px] sm:min-h-[80px] rounded-lg border p-1.5 text-left flex flex-col gap-1 transition-all',
                      inMonth(d) ? 'bg-slate-800/40 border-slate-800 hover:border-sky-500/40' : 'bg-transparent border-transparent opacity-40 hover:opacity-70',
                      isToday(d) && 'ring-1 ring-sky-500 border-sky-500/50',
                    )}>
                    <span className={cn('text-xs font-semibold', isToday(d) ? 'text-sky-400' : 'text-slate-400')}>{d.getDate()}</span>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map(e => (
                        <span key={e.id} onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          className={cn('flex items-center gap-1 text-[10px] leading-tight truncate rounded px-1 py-0.5',
                            TYPES[e.eventType]?.chip, 'ring-1', e.status === 'done' && 'line-through opacity-60')}>
                          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', TYPES[e.eventType]?.dot)} />
                          <span className="truncate">{e.title}</span>
                        </span>
                      ))}
                      {dayEvents.length > 3 && <span className="text-[9px] text-slate-500 pl-1">+{dayEvents.length - 3} more</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-800">
            {Object.entries(TYPES).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className={cn('w-2 h-2 rounded-full', v.dot)} /> {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* Upcoming panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-white">Upcoming</h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No upcoming events this month.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(e => {
                const Icon = TYPES[e.eventType]?.icon || CalendarDays;
                const d = new Date(e.eventDate);
                return (
                  <div key={e.id} className="group flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1', TYPES[e.eventType]?.chip)}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{e.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {e.amount != null ? ` · ${inr(e.amount)}` : ''}
                        {e.customerName ? ` · ${e.customerName}` : ''}
                      </p>
                    </div>
                    <button onClick={() => openEdit(e)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-300"><Pencil size={13} /></button>
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
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="font-bold text-white">{editing ? 'Edit Event' : 'New Event'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Title</label>
                <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Collect from Sharma Stores" className={inp + ' mt-1'} />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Type</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {(Object.keys(TYPES) as EventType[]).map(k => {
                    const Icon = TYPES[k].icon;
                    const active = form.eventType === k;
                    return (
                      <button key={k} type="button" onClick={() => setForm({ ...form, eventType: k })}
                        className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ring-1 transition-all',
                          active ? TYPES[k].chip : 'bg-slate-800/40 text-slate-400 ring-slate-700 hover:ring-slate-600')}>
                        <Icon size={14} /> {TYPES[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date</label>
                  <input type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value })} className={inp + ' mt-1'} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount (optional)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className={inp + ' mt-1'} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Customer (optional)</label>
                  <input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="Name" className={inp + ' mt-1'} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Remind (days before)</label>
                  <input type="number" min={0} value={form.reminderDays} onChange={e => setForm({ ...form, reminderDays: parseInt(e.target.value) || 0 })} className={inp + ' mt-1'} />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Note (optional)</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Details…" className={inp + ' mt-1 resize-none'} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-800">
              {editing ? (
                <button onClick={() => { remove(form.id); setModalOpen(false); }}
                  className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 text-sm font-medium px-3 py-2 rounded-lg hover:bg-rose-500/10">
                  <Trash2 size={15} /> Delete
                </button>
              ) : <span />}
              <button onClick={save} disabled={saving || !form.title.trim()}
                className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {editing ? 'Save' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
