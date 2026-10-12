'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  CalendarClock, CheckCircle2, XCircle, Clock, Save, User,
  Calendar as CalendarIcon, FileX, ChevronLeft, Sun, Sunset,
  Moon, Settings2, Lock, Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, Link } from '@/i18n/routing';
import { useBusinessStore } from '@/lib/businessStore';
import { isMillBillingPackage } from '@/lib/config/packageConfig';

type ShiftType = 'morning' | 'afternoon' | 'night' | 'custom';

type AttRec = {
  status: string;
  reason: string;
  shift: ShiftType | null;
  inTime: string;
  outTime: string;
  shiftHours: string; // string for controlled input
};

const SHIFT_DEFAULTS: Record<ShiftType, { inTime: string; outTime: string; shiftHours: string }> = {
  morning:   { inTime: '06:00', outTime: '14:00', shiftHours: '8' },
  afternoon: { inTime: '14:00', outTime: '22:00', shiftHours: '8' },
  night:     { inTime: '22:00', outTime: '06:00', shiftHours: '8' },
  custom:    { inTime: '',      outTime: '',       shiftHours: '' },
};

function calcHours(inTime: string, outTime: string): string {
  if (!inTime || !outTime) return '';
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  let mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60; // overnight shift
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? String(h) : `${h}.${String(Math.round(m / 60 * 10))}`;
}

export default function AttendancePage() {
  const t = useTranslations('Staff');
  const router = useRouter();
  const { profile } = useBusinessStore();
  const isBadaUdyog = isMillBillingPackage(profile?.packageType);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttRec>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [date]);

  async function loadData() {
    setLoading(true);
    try {
      const [staffRes, attRes] = await Promise.all([
        api.get('/staff'),
        api.get(`/staff/attendance?date=${date}`),
      ]);
      setStaffList(staffRes.data);
      const attMap: Record<string, AttRec> = {};
      attRes.data.forEach((a: any) => {
        attMap[a.staffId] = {
          status: a.status,
          reason: a.reason || '',
          shift: a.shift || null,
          inTime: a.inTime || '',
          outTime: a.outTime || '',
          shiftHours: a.shiftHours != null ? String(a.shiftHours) : '',
        };
      });
      setAttendance(attMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function markAllPresent() {
    const next = { ...attendance };
    staffList.forEach(s => {
      next[s.id] = { ...next[s.id], status: 'Present', reason: '', shift: next[s.id]?.shift || null, inTime: next[s.id]?.inTime || '', outTime: next[s.id]?.outTime || '', shiftHours: next[s.id]?.shiftHours || '' };
    });
    setAttendance(next);
  }

  function updateStatus(staffId: string, status: string) {
    setAttendance(prev => ({
      ...prev,
      [staffId]: {
        status,
        reason: status === 'Present' ? '' : (prev[staffId]?.reason || ''),
        shift: prev[staffId]?.shift || null,
        inTime: prev[staffId]?.inTime || '',
        outTime: prev[staffId]?.outTime || '',
        shiftHours: prev[staffId]?.shiftHours || '',
      },
    }));
  }

  function updateReason(staffId: string, reason: string) {
    setAttendance(prev => ({ ...prev, [staffId]: { ...prev[staffId], reason } }));
  }

  function pickShift(staffId: string, shift: ShiftType) {
    const defaults = SHIFT_DEFAULTS[shift];
    setAttendance(prev => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        shift,
        inTime: defaults.inTime,
        outTime: defaults.outTime,
        shiftHours: shift !== 'custom' ? defaults.shiftHours : (prev[staffId]?.shiftHours || ''),
      },
    }));
  }

  function updateTime(staffId: string, field: 'inTime' | 'outTime', val: string) {
    setAttendance(prev => {
      const rec = { ...prev[staffId], [field]: val };
      const auto = calcHours(
        field === 'inTime' ? val : rec.inTime,
        field === 'outTime' ? val : rec.outTime,
      );
      if (auto) rec.shiftHours = auto;
      return { ...prev, [staffId]: rec };
    });
  }

  function setDuration(staffId: string, hrs: string) {
    setAttendance(prev => ({ ...prev, [staffId]: { ...prev[staffId], shiftHours: hrs } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const records = Object.keys(attendance).map(staffId => ({
        staffId,
        status: attendance[staffId].status,
        reason: attendance[staffId].reason,
        shift: attendance[staffId].shift || null,
        inTime: attendance[staffId].inTime || null,
        outTime: attendance[staffId].outTime || null,
        shiftHours: attendance[staffId].shiftHours ? parseFloat(attendance[staffId].shiftHours) : null,
      }));
      await api.post('/staff/attendance', { date, records });
      alert(t('attendanceSavedSuccess'));
      router.push('/staff');
    } catch {
      alert(t('failedToSaveAttendance'));
    } finally {
      setSaving(false);
    }
  }

  const SHIFTS: { key: ShiftType; icon: React.ReactNode; color: string }[] = [
    { key: 'morning',   icon: <Sun size={13} />,     color: 'amber' },
    { key: 'afternoon', icon: <Sunset size={13} />,  color: 'orange' },
    { key: 'night',     icon: <Moon size={13} />,    color: 'indigo' },
    { key: 'custom',    icon: <Settings2 size={13} />, color: 'slate' },
  ];

  const shiftColor = (key: ShiftType, active: boolean) => {
    if (!active) return 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400';
    const map: Record<ShiftType, string> = {
      morning:   'bg-amber-500 text-white border-amber-500',
      afternoon: 'bg-orange-500 text-white border-orange-500',
      night:     'bg-indigo-600 text-white border-indigo-600',
      custom:    'bg-slate-600 text-white border-slate-600',
    };
    return map[key];
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/staff"
            className="w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-500 transition-colors shadow-sm shrink-0"
          >
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <CalendarClock className="text-indigo-500" size={32} />
              {t('dailyAttendanceTitle')}
            </h1>
            <p className="text-slate-500 font-medium mt-1">{t('trackPresenceHint')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 shadow-sm">
          <CalendarIcon size={18} className="text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-transparent border-none outline-none font-bold text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Bada Udyog shift banner */}
      {isBadaUdyog && (
        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-4 py-3">
          <Timer size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            {t('shiftTracking')} — {t('shiftBadaUdyogBadge')} ✓
          </p>
        </div>
      )}

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 dark:text-slate-300">{t('staffListTitle')}</h2>
          <button
            onClick={markAllPresent}
            className="text-xs font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
          >
            <CheckCircle2 size={14} /> {t('markAllPresentBtn')}
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : staffList.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p>{t('noStaffFound')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {staffList.map(staff => {
              const rec = attendance[staff.id] || { status: '', reason: '', shift: null, inTime: '', outTime: '', shiftHours: '' };
              const showShift = isBadaUdyog && (rec.status === 'Present' || rec.status === 'Half Day');

              return (
                <div key={staff.id} className="p-4 space-y-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  {/* Staff info + status buttons */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        {staff.photoUrl
                          ? <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
                          : <User size={20} className="text-slate-400" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{staff.name}</h3>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{staff.salaryType}</p>
                      </div>
                    </div>

                    {/* Status buttons */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'Present',  icon: <CheckCircle2 size={13} />, label: t('presentBtn'),  on: 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-500/20' },
                        { key: 'Half Day', icon: <Clock size={13} />,        label: t('halfDayBtn'),  on: 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20' },
                        { key: 'Leave',    icon: <FileX size={13} />,        label: t('leaveBtn'),    on: 'bg-sky-500 text-white border-sky-500 shadow-sm shadow-sky-500/20' },
                        { key: 'Absent',   icon: <XCircle size={13} />,      label: t('absentBtn'),   on: 'bg-red-500 text-white border-red-500 shadow-sm shadow-red-500/20' },
                      ].map(btn => (
                        <button
                          key={btn.key}
                          onClick={() => updateStatus(staff.id, btn.key)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
                            rec.status === btn.key
                              ? btn.on
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400',
                          )}
                        >
                          {btn.icon} {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reason (for non-present statuses) */}
                  {['Half Day', 'Absent', 'Leave'].includes(rec.status) && (
                    <input
                      type="text"
                      placeholder={t('reasonOptionalPlaceholder')}
                      value={rec.reason}
                      onChange={e => updateReason(staff.id, e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                    />
                  )}

                  {/* ── Shift Section (Bada Udyog only) ── */}
                  {showShift && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 space-y-3 border border-slate-200 dark:border-slate-700">
                      {/* Shift picker */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider w-full">{t('choosePaali')}</span>
                        {SHIFTS.map(s => (
                          <button
                            key={s.key}
                            onClick={() => pickShift(staff.id, s.key)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                              shiftColor(s.key, rec.shift === s.key),
                            )}
                          >
                            {s.icon}
                            {t(`shift${s.key.charAt(0).toUpperCase() + s.key.slice(1)}` as any)}
                          </button>
                        ))}
                      </div>

                      {/* Time inputs */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            {t('inTimeLabel')}
                          </label>
                          <input
                            type="time"
                            value={rec.inTime}
                            onChange={e => updateTime(staff.id, 'inTime', e.target.value)}
                            className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            {t('outTimeLabel')}
                          </label>
                          <input
                            type="time"
                            value={rec.outTime}
                            onChange={e => updateTime(staff.id, 'outTime', e.target.value)}
                            className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                        {/* Duration */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            {t('shiftDuration')}
                          </label>
                          <div className="flex gap-1">
                            {['8', '12'].map(h => (
                              <button
                                key={h}
                                onClick={() => setDuration(staff.id, h)}
                                className={cn(
                                  'flex-1 text-xs font-bold py-2 rounded-lg border transition-all',
                                  rec.shiftHours === h
                                    ? 'bg-indigo-500 text-white border-indigo-500'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400',
                                )}
                              >
                                {h}{t('hoursShort')}
                              </button>
                            ))}
                            <input
                              type="number"
                              min="1"
                              max="24"
                              placeholder={t('hoursPlaceholder')}
                              value={['8', '12', ''].includes(rec.shiftHours) ? '' : rec.shiftHours}
                              onChange={e => setDuration(staff.id, e.target.value)}
                              className={cn(
                                'w-14 text-xs text-center px-1 py-2 bg-white dark:bg-slate-900 border rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white',
                                !['8', '12', ''].includes(rec.shiftHours)
                                  ? 'border-indigo-500'
                                  : 'border-slate-200 dark:border-slate-700',
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Auto-calc hint */}
                      {rec.inTime && rec.outTime && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Timer size={10} />
                          {t('autoCalcHint')}: <strong>{rec.shiftHours} {t('hoursShort')}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Locked state for non-Bada Udyog users (only show if present) */}
                  {!isBadaUdyog && (rec.status === 'Present' || rec.status === 'Half Day') && (
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl px-3 py-2 border border-dashed border-slate-300 dark:border-slate-600">
                      <Lock size={13} className="text-slate-400 shrink-0" />
                      <p className="text-[11px] text-slate-500">{t('shiftBadaUdyogHint')}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Footer actions */}
      <div className="flex justify-end gap-3">
        <Link
          href="/staff"
          className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-6 py-3 rounded-xl font-black hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        >
          <ChevronLeft size={20} /> {t('backBtn')}
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || staffList.length === 0}
          className="flex items-center gap-2 bg-indigo-500 text-white px-6 py-3 rounded-xl font-black hover:bg-indigo-600 transition-colors shadow-xl shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Save size={20} />}
          {t('saveAttendanceBtn')}
        </button>
      </div>
    </div>
  );
}
