'use client';

import {
  useState, useEffect, useRef, useCallback, useMemo, useTransition,
} from 'react';
import { Bell, Check, CheckCheck, CalendarClock, Package, CreditCard, Zap, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useNotificationStore } from '@/lib/notificationStore';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const SEEN_IDS_KEY = 'ks_seen_notification_ids';
const MAX_TRACKED_IDS = 200;

// Fires a real Android/iOS system notification (shows in the notification
// tray even if the app is backgrounded) for notifications the device hasn't
// already shown — the in-app bell badge alone never touches native APIs.
function fireNativeNotifications(items: Notif[]) {
  if (!Capacitor.isNativePlatform()) return;
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_IDS_KEY) || '[]'); } catch {}
  const seenSet = new Set(seen);

  const fresh = items.filter(n => !n.isRead && !seenSet.has(n.id));
  if (fresh.length > 0) {
    LocalNotifications.schedule({
      notifications: fresh.slice(0, 10).map(n => ({
        id: Math.abs(hashCode(n.id)),
        title: n.title || 'Vyapar Sarthi',
        body: n.message || '',
      })),
    }).catch((e) => console.error('Failed to schedule local notification', e));
  }

  const updatedSeen = [...seen, ...items.map(n => n.id)].slice(-MAX_TRACKED_IDS);
  try { localStorage.setItem(SEEN_IDS_KEY, JSON.stringify(updatedSeen)); } catch {}
}

// Simple deterministic string -> 32-bit int hash (LocalNotifications requires
// a numeric id; notification ids from the API are uuid strings).
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function eventDayLabel(iso: string): string {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((+d - +today) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7)  return `In ${diff} days`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function norm(n: any) {
  return {
    id:        n.id                                         as string,
    title:     (n.title   ?? '')                           as string,
    message:   (n.message ?? '')                           as string,
    isRead:    (n.isRead  ?? n.is_read ?? false)           as boolean,
    type:      (n.notificationType ?? n.notification_type ?? n.type ?? 'default') as string,
    link:      (n.link    ?? null)                         as string | null,
    createdAt: (n.createdAt ?? n.created_at ?? null)       as string | null,
  };
}

type Notif = ReturnType<typeof norm>;

/* ─── Icon map ─────────────────────────────────────────────────── */

function NotifIcon({ type, unread }: { type: string; unread: boolean }) {
  const iconClass = 'w-4 h-4';
  let icon = <Zap className={cn(iconClass, 'text-yellow-400')} />;
  if (type === 'dukandar_stock_alert') icon = <Package className={cn(iconClass, 'text-orange-400')} />;
  else if (type === 'dukandar_credit')  icon = <CreditCard className={cn(iconClass, 'text-emerald-400')} />;
  else if (type === 'udhar_reminder')  icon = <Bell className={cn(iconClass, 'text-purple-400')} />;

  return (
    <span className={cn(
      'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
      unread ? 'bg-sky-500/15' : 'bg-slate-100 dark:bg-slate-800',
    )}>
      {icon}
    </span>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [calendarData, setCalendarData]   = useState<{ upcoming: any[]; pastPending: any[]; recentCompleted: any[] }>({
    upcoming: [], pastPending: [], recentCompleted: [],
  });
  const [showPanel,  setShowPanel]  = useState(false);
  const [, startTransition] = useTransition();

  const panelRef  = useRef<HTMLDivElement>(null);
  const router    = useRouter();
  const locale    = useLocale();

  const setUpcomingEventsCount = useNotificationStore(s => s.setUpcomingEventsCount);
  const setUnreadCount         = useNotificationStore(s => s.setUnreadCount);

  /* ── Data loaders ── */

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications/in-app');
      const items = (res.data.notifications || []).map(norm);
      setNotifications(items);
      setUnreadCount(items.filter((n: Notif) => !n.isRead).length);
      fireNativeNotifications(items);
    } catch { /* silent */ }
  }, [setUnreadCount]);

  const loadEvents = useCallback(async () => {
    try {
      const res  = await api.get('/calendar?bell=1');
      const data = res.data || { upcoming: [], pastPending: [], recentCompleted: [] };
      setCalendarData(data);
      setUpcomingEventsCount(data.upcoming.length + data.pastPending.length);
    } catch { /* silent */ }
  }, [setUpcomingEventsCount]);

  const refresh = useCallback(() => {
    loadNotifications();
    loadEvents();
  }, [loadNotifications, loadEvents]);

  /* ── Realtime + lifecycle ── */

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel('realtime_bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' },    refresh)
      .subscribe();

    // Debounced refresh on tab focus (5 s debounce)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 5000);
    };
    const onFocus   = () => debouncedRefresh();
    const onVisible = () => { if (document.visibilityState === 'visible') debouncedRefresh(); };
    window.addEventListener('focus',            onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus',            onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /* ── Close on outside click / Escape key ── */

  useEffect(() => {
    if (!showPanel) return;
    const onMousedown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPanel(false); };
    document.addEventListener('mousedown',  onMousedown);
    document.addEventListener('keydown',    onKey);
    return () => {
      document.removeEventListener('mousedown',  onMousedown);
      document.removeEventListener('keydown',    onKey);
    };
  }, [showPanel]);

  /* ── Derived state ── */

  const unread = useMemo(() => notifications.filter(n => !n.isRead),  [notifications]);
  const read   = useMemo(() => notifications.filter(n =>  n.isRead).slice(0, 5), [notifications]);
  const badge  = unread.length + calendarData.upcoming.length + calendarData.pastPending.length;

  /* ── Actions ── */

  // Optimistic mark-read: UI updates instantly, API fires in background
  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    api.post(`/notifications/in-app/${id}/read`, {}).catch(() => {});
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    api.post('/notifications/in-app/read-all', {}).catch(() => {});
  }

  // INSTANT navigation — no await, no delay
  function handleNotificationClick(n: Notif) {
    // 1. Immediately close panel & mark read (optimistic, no await)
    setShowPanel(false);
    markRead(n.id);

    // 2. Resolve target URL
    let link = n.link ?? '';
    if (!link) {
      const type  = n.type.toLowerCase();
      const title = n.title.toLowerCase();
      if (type.includes('udhar')        || title.includes('udhar'))        link = '/udhar';
      else if (type.includes('subscription') || title.includes('subscription')) link = '/billing';
      else if (type.includes('billing') || title.includes('billing'))      link = '/billing';
      else if (type.includes('stock')   || title.includes('stock'))        link = '/stock';
    }
    if (!link) return;

    // 3. Prepend locale exactly once
    const alreadyLocale = /^\/(en|hi|mr)(\/|$)/.test(link);
    const target = link.startsWith('/') && !alreadyLocale ? `/${locale}${link}` : link;

    // 4. Use startTransition so React doesn't block the close animation
    startTransition(() => { router.push(target); });
  }

  function dismissEvent(e: any) {
    setCalendarData(prev => ({ ...prev, upcoming: prev.upcoming.filter(ev => ev.id !== e.id) }));
    api.patch(`/calendar/${e.id}`, { notified: true }).catch(() => {});
    setShowPanel(false);
    router.push(`/${locale}/calendar`);
  }

  function markEventCompleted(e: any, done: boolean) {
    setCalendarData(prev => {
      const next = { ...prev };
      next.pastPending = next.pastPending.filter(ev => ev.id !== e.id);
      next.upcoming    = next.upcoming.filter(ev => ev.id !== e.id);
      if (done) {
        next.recentCompleted = [{ ...e, status: 'completed' }, ...next.recentCompleted.filter(ev => ev.id !== e.id)].slice(0, 3);
      }
      return next;
    });
    const payload = done ? { status: 'completed' } : { notified: true };
    api.patch(`/calendar/${e.id}`, payload).catch(() => {});
  }

  function togglePanel() {
    const next = !showPanel;
    setShowPanel(next);
    if (next) refresh();
  }

  const isEmpty = !unread.length && !read.length && !calendarData.upcoming.length && !calendarData.pastPending.length && !calendarData.recentCompleted.length;

  /* ── Render ── */

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={togglePanel}
        aria-label="Notifications"
        aria-expanded={showPanel}
        className={cn(
          'relative p-2.5 rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
          showPanel
            ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-500'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400',
        )}
      >
        <Bell className={cn('w-5 h-5 transition-transform duration-200', showPanel && 'scale-110')} />
        {badge > 0 && (
          <>
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75 pointer-events-none" />
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 shadow-md shadow-red-500/30 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none">
              {badge > 9 ? '9+' : badge}
            </span>
          </>
        )}
      </button>

      {/* Dropdown panel */}
      {showPanel && (
        <div
          className={cn(
            'absolute right-0 top-[calc(100%+8px)] w-80 sm:w-[22rem]',
            'bg-white dark:bg-slate-900',
            'border border-slate-200 dark:border-slate-800',
            'rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/50',
            'z-50 overflow-hidden',
            // CSS-only instant fade + slide (no JS animation library needed)
            'animate-in fade-in slide-in-from-top-2 duration-150 origin-top-right',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
              {badge > 0 && (
                <span className="bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                  {badge} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> All read
                </button>
              )}
              <button
                onClick={() => setShowPanel(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[28rem] overflow-y-auto overscroll-contain">

            {/* Empty state */}
            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
                <span className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-1">
                  <CheckCheck className="w-5 h-5 text-emerald-500" />
                </span>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">All caught up!</p>
                <p className="text-xs text-slate-400">No new notifications right now.</p>
              </div>
            )}

            {/* ── Past-due calendar events ── */}
            {calendarData.pastPending.length > 0 && (
              <section className="border-b border-slate-100 dark:border-slate-800">
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">Past Due</p>
                {calendarData.pastPending.map((e: any) => (
                  <div key={e.id} className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 last:border-none">
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                        <CalendarClock className="w-4 h-4 text-amber-500" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          Yesterday — <span className="font-bold">{e.title}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 mb-2">Did you complete it?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => markEventCompleted(e, true)}
                            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg active:scale-95 transition-all"
                          >
                            Yes, done ✓
                          </button>
                          <button
                            onClick={() => markEventCompleted(e, false)}
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                          >
                            Still pending
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* ── Upcoming calendar events ── */}
            {calendarData.upcoming.length > 0 && (
              <section className="border-b border-slate-100 dark:border-slate-800">
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-sky-500">Upcoming</p>
                {calendarData.upcoming.slice(0, 5).map((e: any) => (
                  <div
                    key={e.id}
                    className="group flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/50 last:border-none hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors active:bg-slate-100 dark:active:bg-slate-800"
                    onClick={() => { setShowPanel(false); startTransition(() => router.push(`/${locale}/calendar`)); }}
                  >
                    <span className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                      <CalendarClock className="w-4 h-4 text-sky-500" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{e.title}</p>
                      <p className="text-xs text-slate-500">
                        {eventDayLabel(e.eventDate)}
                        {e.amount != null ? ` · ₹${Number(e.amount).toLocaleString('en-IN')}` : ''}
                        {e.customerName ? ` · ${e.customerName}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={ev => { ev.stopPropagation(); markEventCompleted(e, true); }}
                      className="opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all active:scale-90"
                      title="Mark done"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </section>
            )}

            {/* ── Caught-up banner ── */}
            {!isEmpty && unread.length === 0 && calendarData.upcoming.length === 0 && calendarData.pastPending.length === 0 && (
              <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-center">
                  ✓ You're all caught up!
                </p>
              </div>
            )}

            {/* ── Unread notifications ── */}
            {unread.slice(0, 20).map(n => (
              <NotifRow
                key={n.id}
                n={n}
                unread
                onMarkRead={() => markRead(n.id)}
                onClick={() => handleNotificationClick(n)}
              />
            ))}

            {/* ── Read notifications ── */}
            {read.map(n => (
              <NotifRow
                key={n.id}
                n={n}
                unread={false}
                onMarkRead={() => {}}
                onClick={() => handleNotificationClick(n)}
              />
            ))}

            {/* ── Recently completed events ── */}
            {calendarData.recentCompleted.length > 0 && (
              <section className="border-t border-slate-100 dark:border-slate-800 opacity-50">
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Completed</p>
                {calendarData.recentCompleted.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/50 last:border-none">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <CheckCheck className="w-4 h-4 text-emerald-500" />
                    </span>
                    <p className="text-sm font-medium text-slate-500 line-through truncate">{e.title}</p>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Notification Row ─────────────────────────────────────────── */

function NotifRow({
  n, unread, onMarkRead, onClick,
}: {
  n: Notif;
  unread: boolean;
  onMarkRead: () => void;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={cn(
        'group flex items-start gap-3 px-4 py-3',
        'border-b border-slate-100 dark:border-slate-800/50 last:border-none',
        'cursor-pointer transition-colors duration-100 select-none',
        // Active/hover feedback
        'hover:bg-slate-50 dark:hover:bg-slate-800/60',
        'active:bg-slate-100 dark:active:bg-slate-800',
        // Unread highlight
        unread && 'bg-sky-50/60 dark:bg-sky-500/10 hover:bg-sky-50 dark:hover:bg-sky-500/15',
      )}
    >
      <NotifIcon type={n.type} unread={unread} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm leading-snug truncate',
            unread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-600 dark:text-slate-300',
          )}>
            {n.title}
          </p>
          {/* Unread dot */}
          {unread && <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-1" />}
        </div>
        <p className={cn(
          'text-xs mt-0.5 line-clamp-2',
          unread ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500',
        )}>
          {n.message}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
          {relativeTime(n.createdAt)}
        </p>
      </div>

      {/* Mark-read button (unread only, on hover) */}
      {unread && (
        <button
          onClick={e => { e.stopPropagation(); onMarkRead(); }}
          className="opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-all shrink-0 active:scale-90"
          title="Mark as read"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
