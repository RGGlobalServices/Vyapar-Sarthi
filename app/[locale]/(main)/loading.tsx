import { Loader2 } from 'lucide-react';

// Shown instantly by Next.js during client-side navigation between any (main)
// section while the destination page loads — makes sidebar switches feel
// immediate instead of leaving a blank/frozen screen.
export default function Loading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 w-full">
      {/* Skeleton header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="h-9 w-48 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-4 w-32 bg-slate-200/60 dark:bg-slate-800/60 rounded-lg mt-2 animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 bg-slate-200/60 dark:bg-slate-800/60 rounded-xl animate-pulse" />
          <div className="h-12 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Skeleton toolbar (search/filter) */}
      <div className="flex gap-4">
        <div className="h-12 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
        <div className="h-12 w-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse flex-shrink-0" />
      </div>

      {/* Skeleton main content (table/list style) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="bg-slate-50 dark:bg-slate-800/50 flex px-6 py-4 gap-4">
          <div className="h-4 w-1/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-1/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-1/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-1/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        
        {/* Table Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/50 p-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex px-4 py-5 gap-4 items-center">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-slate-200/60 dark:bg-slate-800/60 rounded animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="h-6 w-20 bg-slate-200/60 dark:bg-slate-800/60 rounded-full animate-pulse" />
              </div>
              <div className="flex-1 flex justify-end gap-2">
                <div className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                <div className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
