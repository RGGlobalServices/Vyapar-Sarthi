function parseFlexibleDate(
  value,
  opts
) {
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

    let day, month;
    if (a > 12 && b <= 12) { day = a; month = b; }          // unambiguously DD-MM
    else if (b > 12 && a <= 12) { day = b; month = a; }     // unambiguously MM-DD
    else { day = a; month = b; }                            // ambiguous → day-first

    const make = (d, mo) => new Date(Date.UTC(year, mo - 1, d, 0, 0, 0));
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

module.exports = { parseFlexibleDate };
