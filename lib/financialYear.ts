/**
 * Indian Financial Year (Apr 1 – Mar 31) helpers. Pure date math, no I/O —
 * safe to import from both server routes and client components (the FY
 * picker computes a from/to range client-side and sends it as the same
 * `start_date`/`end_date` query params every report route already reads via
 * lib/server/dates.ts's getDateRange(), so no server-side FY parsing is
 * needed to wire this in.
 *
 * Dates are constructed as IST midnight/end-of-day, matching the IST
 * boundary convention lib/server/dates.ts already uses for every report.
 */

export interface FinancialYear {
  fyStartYear: number; // e.g. 2025 for "FY 2025-26"
  from: Date;           // Apr 1, fyStartYear, 00:00:00 IST
  to: Date;             // Mar 31, fyStartYear+1, 23:59:59.999 IST
  label: string;        // "FY 2025-26"
}

function istDate(year: number, month: number /* 1-12 */, day: number, endOfDay = false): Date {
  const time = endOfDay ? 'T23:59:59.999+05:30' : 'T00:00:00+05:30';
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${time}`);
}

/** IST-midnight and IST-23:59:59.999 timestamps straddle different UTC
 *  calendar days (IST is UTC+5:30, not a whole-day offset) — plain
 *  `date.toISOString().slice(0,10)` silently reads the wrong day for a
 *  start-of-day IST timestamp (e.g. Apr 1 00:00 IST → Mar 31 18:30 UTC).
 *  Every caller that needs a "YYYY-MM-DD" string for an `<input type=date>`
 *  or a `start_date`/`end_date` query param from one of this file's Date
 *  values MUST go through this instead of toISOString(). */
export function toIsoDateIST(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function getFinancialYearRange(fyStartYear: number): FinancialYear {
  return {
    fyStartYear,
    from: istDate(fyStartYear, 4, 1),
    to: istDate(fyStartYear + 1, 3, 31, true),
    label: `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`,
  };
}

/** The FY containing "now" (IST) — Jan-Mar counts as the PREVIOUS calendar
 *  year's FY, e.g. Feb 2026 falls in FY 2025-26. */
export function currentFinancialYear(): FinancialYear {
  const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = nowIst.getFullYear();
  const fyStartYear = nowIst.getMonth() + 1 >= 4 ? y : y - 1; // getMonth() is 0-based
  return getFinancialYearRange(fyStartYear);
}

/** Most recent `count` financial years, newest first — for a dropdown. */
export function listRecentFinancialYears(count = 5): FinancialYear[] {
  const current = currentFinancialYear();
  return Array.from({ length: count }, (_, i) => getFinancialYearRange(current.fyStartYear - i));
}

/** The 12 month buckets of a financial year in Apr→Mar order, each with the
 *  IST from/to range for that calendar month — used by monthly GST/report
 *  breakdowns so every caller buckets months identically. */
export function financialYearMonths(fyStartYear: number): { label: string; from: Date; to: Date }[] {
  const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  return months.map((label, i) => {
    const year = i < 9 ? fyStartYear : fyStartYear + 1; // Apr(0)..Dec(8) in fyStartYear, Jan(9)..Mar(11) in fyStartYear+1
    const month = ((i + 3) % 12) + 1; // i=0 -> April(4), i=9 -> January(1)
    const lastDay = new Date(year, month, 0).getDate();
    return { label, from: istDate(year, month, 1), to: istDate(year, month, lastDay, true) };
  });
}
