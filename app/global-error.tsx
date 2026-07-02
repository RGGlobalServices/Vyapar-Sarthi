'use client';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Vyapar Sarthi Root Error:', error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-white">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Critical System Error</h1>
          <p className="text-slate-400 mb-6">A critical error occurred while initializing the application. Our technical team has been notified.</p>
          <div className="bg-black/50 rounded-lg p-4 text-left text-sm font-mono text-red-400 mb-6 overflow-hidden text-ellipsis">
            {error.message || "Unknown root rendering error"}
          </div>
          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-colors w-full"
          >
            Attempt Recovery
          </button>
        </div>
      </body>
    </html>
  );
}
