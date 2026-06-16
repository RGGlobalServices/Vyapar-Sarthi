export function startOfDay(d: Date | string | number): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(d: Date | string | number): Date {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function formatDate(d: Date | string | number): string {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRange(q: Record<string, string>): { startDate: Date; endDate: Date } {
  const start = q.start_date ? startOfDay(new Date(q.start_date)) : startOfDay(new Date());
  const end = q.end_date ? endOfDay(new Date(q.end_date)) : endOfDay(new Date());
  return { startDate: start, endDate: end };
}
