import { ApiError } from '@/lib/server/http';

// The Profile page's admin/staff toggle (useAuthStore's `role`, carried here
// via the x-ui-role header — see lib/api.ts) used to be purely cosmetic:
// nothing server-side ever enforced it, so any account switched to "staff
// mode" could still open another staff member's salary/payment/advance
// history in full. This is the actual enforcement point.
//
// There's no link today between a logged-in User and a specific Staff row,
// so this can't yet scope down to "your own record only" — it blocks
// payroll data uniformly for every staff-mode session. If a shop wants a
// trusted staff member to run payroll on others' behalf, they switch back
// to admin mode (already PIN-gated) to do it.
export function assertCanViewStaffPayroll(req: Request) {
  const uiRole = req.headers.get('x-ui-role');
  if (uiRole === 'staff') {
    throw new ApiError(403, 'Salary and payment details are only visible in admin mode.');
  }
}

// Same enforcement point, for read APIs that must not hand profit / money-flow figures to a staff-mode session just
// because the client hides the card. Uses the existing x-ui-role header - no new permission model.
export function isStaffUiRole(req: Request): boolean {
  return req.headers.get('x-ui-role') === 'staff';
}
