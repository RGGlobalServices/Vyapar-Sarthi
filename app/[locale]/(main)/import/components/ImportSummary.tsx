'use client';
import { useLocale } from 'next-intl';
import {
  CheckCircle2, RefreshCcw, SkipForward, XCircle,
  Clock, Package, ChevronDown, ChevronUp, ArrowRight,
  Download, AlertTriangle
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportSummaryData {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  totalRows: number;
  processingMs: number;
  errors: { productName: string; reason: string }[];
}

interface ImportSummaryProps {
  data: ImportSummaryData;
  importName: string;
  onClose: () => void;
  onViewProducts: () => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl p-4 gap-1',
        color
      )}
    >
      <div className="mb-1">{icon}</div>
      <span className="text-2xl font-extrabold leading-none">{value}</span>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-80 text-center">
        {label}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportSummary({
  data,
  importName,
  onClose,
  onViewProducts,
}: ImportSummaryProps) {
  const locale = useLocale();
  const [showErrors, setShowErrors] = useState(false);

  const { importedCount, updatedCount, skippedCount, failedCount, totalRows, processingMs, errors } = data;
  const successCount = importedCount + updatedCount;
  const successRate = totalRows > 0 ? Math.round((successCount / totalRows) * 100) : 0;

  // Download error report as CSV
  const handleDownloadErrors = () => {
    if (errors.length === 0) return;
    const header = 'Product Name,Reason\n';
    const rows = errors
      .map((e) => `"${e.productName.replace(/"/g, '""')}","${e.reason.replace(/"/g, '""')}"`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">

        {/* ── Header ── */}
        <div className={cn(
          'px-6 py-5 flex items-center gap-4',
          successRate === 100
            ? 'bg-emerald-500/10 border-b border-emerald-500/20'
            : failedCount > 0
            ? 'bg-amber-500/10 border-b border-amber-500/20'
            : 'bg-blue-500/10 border-b border-blue-500/20'
        )}>
          <div className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0',
            successRate === 100 ? 'bg-emerald-500' : failedCount > 0 ? 'bg-amber-500' : 'bg-blue-500'
          )}>
            {successRate === 100
              ? <CheckCircle2 size={24} className="text-white" />
              : failedCount > 0
              ? <AlertTriangle size={24} className="text-white" />
              : <CheckCircle2 size={24} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
              Import Complete
            </p>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 truncate">
              {importName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Clock size={11} />
              {processingMs > 1000
                ? `${(processingMs / 1000).toFixed(1)}s`
                : `${processingMs}ms`}
              &nbsp;·&nbsp;{totalRows} total rows processed
            </p>
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Package size={20} className="text-emerald-500" />}
            label="Imported"
            value={importedCount}
            color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            icon={<RefreshCcw size={20} className="text-blue-500" />}
            label="Updated"
            value={updatedCount}
            color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
          <StatCard
            icon={<SkipForward size={20} className="text-slate-500" />}
            label="Skipped"
            value={skippedCount}
            color="bg-slate-500/10 text-slate-600 dark:text-slate-400"
          />
          <StatCard
            icon={<XCircle size={20} className="text-red-500" />}
            label="Failed"
            value={failedCount}
            color={failedCount > 0
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}
          />
        </div>

        {/* ── Success Rate Bar ── */}
        <div className="px-6 pb-2">
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Success Rate</span>
            <span>{successRate}%</span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                successRate === 100 ? 'bg-emerald-500' : successRate >= 80 ? 'bg-blue-500' : 'bg-amber-500'
              )}
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>

        {/* ── Error Report (collapsible) ── */}
        {errors.length > 0 && (
          <div className="px-6 pt-2 pb-1">
            <button
              onClick={() => setShowErrors((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 hover:bg-red-500/15 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <XCircle size={13} /> {errors.length} row{errors.length > 1 ? 's' : ''} failed — view details
              </span>
              {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showErrors && (
              <div className="mt-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
                  {errors.map((e, i) => (
                    <div key={i} className="px-3 py-2 flex gap-3 items-start">
                      <span className="text-red-400 shrink-0 mt-0.5"><XCircle size={12} /></span>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{e.productName}</p>
                        <p className="text-xs text-slate-500">{e.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2">
                  <button
                    onClick={handleDownloadErrors}
                    className="text-xs text-blue-500 flex items-center gap-1 hover:underline font-semibold"
                  >
                    <Download size={11} /> Download Error Report (CSV)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="px-6 py-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm"
          >
            Import More
          </button>
          <button
            onClick={() => {
              onClose();
              window.location.href = `/${locale}/products`;
            }}
            className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <span>View Products</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
