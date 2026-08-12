'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';

interface ConfirmPasswordModalProps {
  open: boolean;
  itemLabel?: string; // e.g. "product" — used in the single-item hint
  itemCount?: number; // >1 renders the bulk-count hint instead
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Password re-verification gate for delete actions across every module —
 * generalized from the one working example of this UX already in the app,
 * Sidebar.tsx's "Confirm Shop Deletion" modal (same POST /auth/verify-pin
 * call, same PIN-falls-back-to-login-password server behavior). Reuse this
 * everywhere a delete needs to be password-gated instead of re-implementing
 * the pin/error/verifying state trio per page.
 */
export function ConfirmPasswordModal({ open, itemLabel = 'item', itemCount = 1, onConfirm, onCancel }: ConfirmPasswordModalProps) {
  const t = useTranslations('Trash');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  if (!open) return null;

  const isBulk = itemCount > 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setVerifying(true);
    setError('');
    try {
      await api.post('/auth/verify-pin', { pin: password });
      setPassword('');
      await onConfirm();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message || t('incorrectPassword'));
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-xl p-6">
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t('confirmTitle')}</h3>
        <p className="text-sm text-slate-500 mb-2">
          {isBulk ? t('confirmHintBulk', { count: itemCount, itemPlural: `${itemLabel}s` }) : t('confirmHintSingle', { item: itemLabel })}
        </p>
        <p className="text-xs text-slate-400 mb-6">{t('deletedGoesToRecycleBin')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white mb-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
            placeholder={t('passwordPlaceholder')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="text-red-500 text-xs font-medium mb-4">{error}</p>}

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!password || verifying}
              className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {verifying ? t('verifying') : t('confirmDelete')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
