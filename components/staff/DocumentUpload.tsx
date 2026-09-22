'use client';

import { useTranslations } from 'next-intl';
import { Check, Eye, FileText, Trash2, UploadCloud } from 'lucide-react';

// Shared upload/view/remove row for one staff document slot (photo, Aadhaar,
// PAN, address proof, etc.) — extracted from staff/new/page.tsx so the
// existing staff profile page can also add/replace documents, which it
// couldn't do before (it could only view/delete ones added at creation time).
export default function DocumentUpload({
  label,
  fileUrl,
  isUploading,
  onUpload,
  onRemove,
  onView,
}: {
  label: string;
  fileUrl?: string | null;
  isUploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const t = useTranslations('Staff');
  const isUploaded = !!fileUrl;

  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isUploaded ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
          {isUploaded ? <Check size={20} /> : <FileText size={20} />}
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white text-sm">{label}</p>
          <p className="text-xs text-slate-500">{isUploaded ? t('uploaded') : t('pending')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isUploaded && (
          <button
            type="button"
            onClick={onView}
            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 transition-colors"
          >
            {t('view')} <Eye size={14} />
          </button>
        )}
        <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${isUploaded ? 'bg-white border-2 border-green-500 text-green-600 dark:bg-slate-800 dark:text-green-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20'}`}>
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : isUploaded ? (
            t('change')
          ) : (
            <>
              <UploadCloud size={16} /> {t('upload')}
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
            disabled={isUploading}
          />
        </label>
        {isUploaded && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isUploading}
            title={t('removeDocumentTitle')}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
