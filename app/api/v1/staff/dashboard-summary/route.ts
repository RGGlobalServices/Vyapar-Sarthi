import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { startOfDay, endOfDay, formatDate } from '@/lib/server/dates';
import { getMonthRangeUTC } from '@/lib/attendance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One aggregated read for the Staff Management dashboard's KPI row — avoids
// the list page having to fetch every staff member's attendance/payroll
// individually (an N+1 that would otherwise scale with headcount).
export const GET = handle(async (req) => {
  const { shop } = await requireShop(req);

  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const currentMonthYear = formatDate().slice(0, 7); // "YYYY-MM"
  const { start: monthStart, end: monthEnd } = getMonthRangeUTC(currentMonthYear);

  const [
    statusGroups,
    todayAttendance,
    monthlyActiveStaff,
    monthPayments,
  ] = await Promise.all([
    prisma.staff.groupBy({
      by: ['status'],
      where: { shopId: shop.id },
      _count: { id: true },
    }),
    prisma.attendance.findMany({
      where: { staff: { shopId: shop.id }, date: { gte: todayStart, lte: todayEnd } },
      select: { status: true },
    }),
    // Only monthly-salary staff have a well-defined "expected this month"
    // figure — daily-wage pay depends on attendance, so it's excluded from
    // payroll_due/total_monthly_payroll rather than guessed at.
    prisma.staff.findMany({
      where: { shopId: shop.id, salaryType: 'monthly', status: 'active' },
      select: { id: true, salaryAmount: true },
    }),
    prisma.salaryPayment.findMany({
      where: { staff: { shopId: shop.id }, monthYear: currentMonthYear },
      select: { staffId: true, netAmount: true },
    }),
  ]);

  const totalStaff = statusGroups.reduce((sum, g) => sum + g._count.id, 0);
  const activeStaff = statusGroups.find(g => g.status === 'active')?._count.id || 0;
  const onLeaveStatus = statusGroups.find(g => g.status === 'on_leave')?._count.id || 0;

  let presentToday = 0, absentToday = 0, onLeaveToday = 0;
  for (const a of todayAttendance) {
    const s = (a.status || '').toLowerCase();
    if (s === 'present' || s === 'half day') presentToday++;
    else if (s === 'absent') absentToday++;
    else if (s === 'leave') onLeaveToday++;
  }

  const paidStaffIds = new Set(monthPayments.map(p => p.staffId));
  const totalMonthlyPayroll = monthlyActiveStaff.reduce((sum, s) => sum + (s.salaryAmount || 0), 0);
  const payrollPaid = monthPayments.reduce((sum, p) => sum + (p.netAmount || 0), 0);
  const payrollDue = monthlyActiveStaff
    .filter(s => !paidStaffIds.has(s.id))
    .reduce((sum, s) => sum + (s.salaryAmount || 0), 0);

  return json({
    total_staff: totalStaff,
    active_staff: activeStaff,
    present_today: presentToday,
    absent_today: absentToday,
    on_leave_today: onLeaveToday,
    on_leave_status: onLeaveStatus,
    total_monthly_payroll: totalMonthlyPayroll,
    payroll_paid: payrollPaid,
    payroll_due: payrollDue,
    month_year: currentMonthYear,
  });
});
