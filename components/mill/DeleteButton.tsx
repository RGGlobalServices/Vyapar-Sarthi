'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';

/**
 * A small trash button for the mill lists (Bada Udyog): asks first, calls DELETE on `url`, and shows the server's own reason when it
 * refuses (for example "this lot was already used in production"). `name` is what the user sees in the question ("Gate entry GE-…").
 */
export default function DeleteButton({ url, name, extra, onDone, className }: { url: string; name: string; extra?: string; onDone: () => void; className?: string }) {
  const t = useTranslations('Mill');
  const [confirm, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm([t('pe_confirmGeneric', { name }), extra].filter(Boolean).join('\n\n'), { title: t('pe_delete'), okLabel: t('pe_delete'), cancelLabel: t('pe_cancel') });
    if (!ok) return;
    setBusy(true);
    try {
      await api.delete(url);
      toast.success(t('pe_removed', { name }));
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || err?.message || t('pe_failed'), { duration: 8000 });
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={run} disabled={busy} title={t('pe_delete')} aria-label={t('pe_delete')}
        className={className || 'h-7 w-7 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50'}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
      {dialog}
    </>
  );
}
