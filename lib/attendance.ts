// Canonical attendance status values. The bulk "Daily Attendance" page
// (app/[locale]/(main)/staff/attendance/page.tsx) used to write lowercase
// snake_case ('present', 'half_day') while the per-staff "Quick Mark Today"
// UI (staff/[id]/page.tsx) wrote Title Case ('Present', 'Half Day') — same
// four states, two different spellings for the same free-text DB column.
// Everything now writes and compares against these Title Case values;
// normalizeAttendanceStatus() maps old records (already saved with the
// other casing) back onto them so nothing already in the database goes
// invisible.
export const ATTENDANCE_STATUSES = ['Present', 'Half Day', 'Absent', 'Leave'] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

const STATUS_ALIASES: Record<string, AttendanceStatus> = {
  present: 'Present',
  'half day': 'Half Day',
  half_day: 'Half Day',
  halfday: 'Half Day',
  half: 'Half Day',
  absent: 'Absent',
  leave: 'Leave',
};

export function normalizeAttendanceStatus(raw: string | null | undefined): AttendanceStatus | null {
  if (!raw) return null;
  return STATUS_ALIASES[raw.trim().toLowerCase()] || null;
}

// UTC-midnight month boundaries, matching how attendance dates are written
// (date.setUTCHours(0,0,0,0) at insert time) — building the range from
// local-time `new Date(year, month-1, 1)` instead would shift by the
// server's UTC offset and can silently drop the first/last day of a month.
export function getMonthRangeUTC(monthYear: string): { start: Date; end: Date } {
  const [year, month] = monthYear.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

export function daysInMonthUTC(monthYear: string): number {
  const [year, month] = monthYear.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Summarizes a month's attendance rows into day counts for payroll —
// "1 day" of pay-weight per Present, "0.5 day" per Half Day, Absent/Leave
// contribute 0 but are still counted/shown separately.
export function summarizeAttendance(records: { status: string | null }[]) {
  let present = 0, halfDay = 0, absent = 0, leave = 0;
  for (const r of records) {
    const status = normalizeAttendanceStatus(r.status);
    if (status === 'Present') present++;
    else if (status === 'Half Day') halfDay++;
    else if (status === 'Absent') absent++;
    else if (status === 'Leave') leave++;
  }
  const payableDays = present + halfDay * 0.5;
  return { present, halfDay, absent, leave, marked: present + halfDay + absent + leave, payableDays };
}
