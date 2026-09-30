'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';

/**
 * In-app replacement for window.confirm(). Browser confirm popups are silently suppressed in embedded browsers and
 * desktop shells (they return "No" without showing anything), which made buttons look dead. Usage:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   ...
 *   if (!(await confirm('Sure?', { okLabel: 'Yes, save' }))) return;
 *   ...
 *   return (<>...{confirmDialog}</>);
 */
export function useConfirm(): [
  (message: string, opts?: { okLabel?: string; cancelLabel?: string; title?: string }) => Promise<boolean>,
  ReactNode,
] {
  const [state, setState] = useState<null | { message: string; okLabel: string; cancelLabel: string; title: string }>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, opts?: { okLabel?: string; cancelLabel?: string; title?: string }) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ message, okLabel: opts?.okLabel || 'OK', cancelLabel: opts?.cancelLabel || 'Cancel', title: opts?.title || 'Please confirm' });
    });
  }, []);

  const close = (v: boolean) => {
    setState(null);
    resolver.current?.(v);
    resolver.current = null;
  };

  const dialog = state ? (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="font-black text-slate-900 dark:text-white">{state.title}</h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{state.message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => close(false)} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{state.cancelLabel}</button>
          <button type="button" autoFocus onClick={() => close(true)} className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500 text-slate-900 hover:bg-emerald-400">{state.okLabel}</button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, dialog];
}
