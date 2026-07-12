'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, CheckCircle2, XCircle, Clock, Save, User, Calendar as CalendarIcon, FileX, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, Link } from '@/i18n/routing';

export default function AttendancePage() {
  const t = useTranslations('Dashboard');
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, { status: string, reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [date]);

  async function loadData() {
    setLoading(true);
    try {
      const [staffRes, attRes] = await Promise.all([
        api.get('/staff'),
        api.get(`/staff/attendance?date=${date}`),
      ]);
      setStaffList(staffRes.data);
      
      const attMap: Record<string, { status: string, reason: string }> = {};
      attRes.data.forEach((a: any) => {
        attMap[a.staffId] = { status: a.status, reason: a.reason || '' };
      });
      // Pre-fill missing with 'present' as default or just leave blank? Better leave blank so user actively marks.
      setAttendance(attMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function markAllPresent() {
    const newAtt = { ...attendance };
    staffList.forEach(s => {
      newAtt[s.id] = { status: 'present', reason: '' };
    });
    setAttendance(newAtt);
  }

  function updateAtt(staffId: string, status: string, reason = '') {
    setAttendance(prev => ({
      ...prev,
      [staffId]: { status, reason: status === 'present' ? '' : (prev[staffId]?.reason || reason) }
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const records = Object.keys(attendance).map(staffId => ({
        staffId,
        status: attendance[staffId].status,
        reason: attendance[staffId].reason
      }));
      await api.post('/staff/attendance', { date, records });
      alert('Attendance saved successfully');
      router.push('/staff');
    } catch (e) {
      alert('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/staff" className="w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-500 transition-colors shadow-sm shrink-0">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <CalendarClock className="text-indigo-500" size={32} />
              Daily Attendance
            </h1>
            <p className="text-slate-500 font-medium mt-1">Track presence, absences, and leaves.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 shadow-sm">
          <CalendarIcon size={18} className="text-slate-400" />
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent border-none outline-none font-bold text-slate-900 dark:text-white"
          />
        </div>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 dark:text-slate-300">Staff List</h2>
          <button 
            onClick={markAllPresent}
            className="text-xs font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
          >
            <CheckCircle2 size={14} /> Mark All Present
          </button>
        </div>

        {loading ? (
           <div className="p-12 flex justify-center">
             <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
           </div>
        ) : staffList.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p>No staff members found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {staffList.map(staff => {
              const current = attendance[staff.id] || { status: '', reason: '' };
              return (
                <div key={staff.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {staff.photoUrl ? (
                        <img src={staff.photoUrl} alt={staff.name} className="w-full h-full object-cover" />
                      ) : (
                        <User size={20} className="text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{staff.name}</h3>
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{staff.salaryType}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:w-[60%]">
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => updateAtt(staff.id, 'present')}
                        className={cn("flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border", 
                          current.status === 'present' ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-500/50"
                        )}
                      >
                        <CheckCircle2 size={14} /> Present
                      </button>
                      <button 
                        onClick={() => updateAtt(staff.id, 'half_day')}
                        className={cn("flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border", 
                          current.status === 'half_day' ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-amber-500/50"
                        )}
                      >
                        <Clock size={14} /> Half Day
                      </button>
                      <button 
                        onClick={() => updateAtt(staff.id, 'leave')}
                        className={cn("flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border", 
                          current.status === 'leave' ? "bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/20" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-sky-500/50"
                        )}
                      >
                        <FileX size={14} /> Leave
                      </button>
                      <button 
                        onClick={() => updateAtt(staff.id, 'absent')}
                        className={cn("flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border", 
                          current.status === 'absent' ? "bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-red-500/50"
                        )}
                      >
                        <XCircle size={14} /> Absent
                      </button>
                    </div>

                    {/* Reason input for non-present */}
                    {['half_day', 'absent', 'leave'].includes(current.status) && (
                      <input 
                        type="text" 
                        placeholder="Reason (Optional)"
                        value={current.reason}
                        onChange={(e) => updateAtt(staff.id, current.status, e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-3">
        <Link
          href="/staff"
          className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-6 py-3 rounded-xl font-black hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        >
          <ChevronLeft size={20} /> Back
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || staffList.length === 0}
          className="flex items-center gap-2 bg-indigo-500 text-white px-6 py-3 rounded-xl font-black hover:bg-indigo-600 transition-colors shadow-xl shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
          Save Attendance
        </button>
      </div>
    </div>
  );
}
