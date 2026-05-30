'use client';

export default function NotFoundPage() {
  return (
    <div suppressHydrationWarning className="flex flex-col items-center justify-center min-h-[50vh] text-slate-200">
      <h1 className="text-4xl font-black text-emerald-500 mb-2">404</h1>
      <p className="text-slate-400">Page not found</p>
    </div>
  );
}
