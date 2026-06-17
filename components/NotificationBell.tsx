'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, Check, CheckCheck, CalendarClock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

function eventDayLabel(iso: string) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((+d - +today) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `In ${diff} days`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Normalize an API notification (camelCase from Prisma, snake_case legacy fallback).
function norm(n: any) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    isRead: n.isRead ?? n.is_read ?? false,
    type: n.notificationType ?? n.notification_type ?? n.type ?? 'default',
    link: n.link ?? null,
    createdAt: n.createdAt ?? n.created_at ?? null,
  };
}

const TYPE_ICON: Record<string, string> = {
  expiry: '🔴', warning: '⚠️', promotion: '🎉', update: '📢',
  dukandar_stock_alert: '📦', dukandar_credit: '💰', udhar_reminder: '🔔',
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<ReturnType<typeof norm>[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications/in-app');
      setNotifications((res.data.notifications || []).map(norm));
    } catch { /* silent */ }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.get('/calendar?upcoming=7&hideNotified=1');
      setEvents(res.data || []);
    } catch { /* silent */ }
  }, []);

  const refresh = useCallback(() => { loadNotifications(); loadEvents(); }, [loadNotifications, loadEvents]);

  // Poll + refetch on tab focus/visibility for a near-real-time bell.
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 20000);
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Only unread notifications are "new" and shown in the bell.
  const unread = useMemo(() => notifications.filter((n) => !n.isRead), [notifications]);
  const badge = unread.length + events.length;

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try { await api.post(`/notifications/in-app/${id}/read`, {}); } catch {}
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try { await api.post('/notifications/in-app/read-all', {}); } catch {}
  }

  function handleNotificationClick(n: ReturnType<typeof norm>) {
    markRead(n.id);
    const link = n.link || (n.type === 'dukandar_stock_alert' ? '/dukandar-alerts' : null);
    if (link) router.push(link);
    setShowDropdown(false);
  }

  async function dismissEvent(e: any) {
    setEvents((prev) => prev.filter((ev) => ev.id !== e.id));
    try { await api.patch(`/calendar/${e.id}`, { notified: true }); } catch {}
    router.push('/calendar');
    setShowDropdown(false);
  }

  function toggleDropdown() {
    const next = !showDropdown;
    setShowDropdown(next);
    if (next) refresh(); // fetch latest the moment the bell is opened
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={toggleDropdown} className="relative p-2 rounded-xl hover:bg-slate-800 transition-all">
        <Bell className="w-5 h-5 text-slate-400" />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {/* Upcoming calendar events */}
            {events.length > 0 && (
              <div className="border-b border-slate-800">
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">Upcoming</p>
                {events.slice(0, 5).map((e: any) => (
                  <div key={e.id} onClick={() => dismissEvent(e)}
                    className="p-3 border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/50 transition-all">
                    <div className="flex items-start gap-3">
                      <CalendarClock className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-semibold truncate">{e.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {eventDayLabel(e.eventDate)}
                          {e.amount != null ? ` · ₹${Number(e.amount).toLocaleString('en-IN')}` : ''}
                          {e.customerName ? ` · ${e.customerName}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Unread notifications only */}
            {unread.length === 0 && events.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Check className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <p className="text-sm">No new notifications</p>
                <p className="text-xs text-slate-600 mt-0.5">You&apos;re all caught up</p>
              </div>
            ) : (
              unread.slice(0, 20).map((n) => (
                <div key={n.id} onClick={() => handleNotificationClick(n)}
                  className="p-3 border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/50 transition-all bg-slate-800/30">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{TYPE_ICON[n.type] || '💡'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-semibold">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-slate-600 mt-1">
                        {n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      className="p-1 hover:bg-slate-700 rounded" title="Mark as read">
                      <Check className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
