'use client';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw, Home, Terminal } from 'lucide-react';
import { Link } from '@/i18n/routing';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service in a real SaaS
    console.error('Vyapar Sarthi Global Error Boundary caught an error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
        
        {/* Error Header */}
        <div className="bg-red-500/10 border-b border-red-500/20 px-8 py-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 text-red-500 mb-6 shadow-[0_0_40px_rgba(239,68,68,0.4)]">
            <AlertTriangle size={40} className="animate-pulse" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">
            Oops! Something went wrong.
          </h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium text-lg max-w-lg mx-auto">
            We've encountered an unexpected issue while loading this section. Our team has been notified.
          </p>
        </div>

        {/* Error Details */}
        <div className="p-8 space-y-8">
          <div className="bg-slate-50 dark:bg-slate-950/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-800/60 font-mono text-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-3">
              <Terminal size={14} />
              <span className="font-bold uppercase tracking-wider text-[10px]">Error Details (For Support)</span>
            </div>
            <div className="text-red-500 dark:text-red-400 font-medium break-words">
              {error.message || "An unknown rendering error occurred."}
            </div>
            {error.digest && (
              <div className="text-slate-500 mt-2 text-xs">
                Digest ID: {error.digest}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <button
              onClick={() => reset()}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-95 shadow-lg shadow-slate-900/20 dark:shadow-white/20"
            >
              <RefreshCcw size={18} />
              Try Again
            </button>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <Home size={18} />
              Return Home
            </Link>
          </div>
        </div>

      </div>

      <p className="mt-10 text-sm font-medium text-slate-400">
        Powered by Vyapar Sarthi v2.0
      </p>
    </div>
  );
}
