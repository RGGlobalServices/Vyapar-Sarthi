import { Loader2 } from 'lucide-react';

// Shown instantly by Next.js during client-side navigation between any (main)
// section while the destination page loads — makes sidebar switches feel
// immediate instead of leaving a blank/frozen screen.
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
