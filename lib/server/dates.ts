export function startOfDay(d: Date | string | number = new Date()): Date {
  const date = new Date(d);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedDate = formatter.format(date);
  return new Date(`${formattedDate}T00:00:00+05:30`);
}

export function endOfDay(d: Date | string | number = new Date()): Date {
  const date = new Date(d);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedDate = formatter.format(date);
  return new Date(`${formattedDate}T23:59:59.999+05:30`);
}

export function formatDate(d: Date | string | number = new Date()): string {
  const date = new Date(d);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getDateRange(q: Record<string, string>): { startDate: Date; endDate: Date } {
  const start = q.start_date ? startOfDay(new Date(q.start_date)) : startOfDay(new Date());
  const end = q.end_date ? endOfDay(new Date(q.end_date)) : endOfDay(new Date());
  return { startDate: start, endDate: end };
}

/**
 * Robustly parse a date coming from an imported spreadsheet/AI extraction.
 * Handles: real Date objects, Excel serial numbers, ISO (YYYY-MM-DD),
 * and D-M-Y / D/M/Y with 2- or 4-digit years.
 *
 * DD-MM ambiguity: when one component is > 12 the order is unambiguous; when
 * both are <= 12 it defaults to DAY-first (India's convention).
 *
 * `preferPast` (for sales history, which is always in the past): if the
 * day-first reading lands in the future but swapping day/month yields a past
 * date, the swapped reading is used. This fixes rows like "06-10-2026" that
 * were mis-read as 6-Oct-2026 (future) instead of the intended 10-Jun-2026.
 */
export function parseFlexibleDate(
  value: unknown,
  opts: { preferPast?: boolean } = {}
): Date | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value;

  const raw = String(value).trim();
  if (!raw) return undefined;

  // Excel serial date (days since 1899-12-30). Pure-number cells land here.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = parseFloat(raw);
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? undefined : d;
    }
  }

  // ISO-ish (year first): let the engine handle it.
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(raw)) {
    const p = Date.parse(raw);
    return isNaN(p) ? undefined : new Date(p);
  }

  // D-M-Y or M-D-Y with 1-2 digit parts.
  const m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;

    let day: number, month: number;
    if (a > 12 && b <= 12) { day = a; month = b; }          // unambiguously DD-MM
    else if (b > 12 && a <= 12) { day = b; month = a; }     // unambiguously MM-DD
    else { day = a; month = b; }                            // ambiguous → day-first

    const make = (d: number, mo: number) => new Date(Date.UTC(year, mo - 1, d, 0, 0, 0));
    let result = make(day, month);

    // Sales history can't be in the future — try the swapped reading if it helps.
    if (opts.preferPast && day <= 12 && month <= 12) {
      const tomorrow = Date.now() + 86400 * 1000;
      if (result.getTime() > tomorrow) {
        const swapped = make(month, day);
        if (swapped.getTime() <= tomorrow) result = swapped;
      }
    }
    return isNaN(result.getTime()) ? undefined : result;
  }

  // Anything else: last-resort native parse.
  const p = Date.parse(raw);
  return isNaN(p) ? undefined : new Date(p);
}
