'use client';

import { useRef, useState } from 'react';
import { X, Camera, Upload, Loader2, ScanLine, Check, AlertTriangle, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface PartyOption {
  id: string;
  name: string;
  shopName: string | null;
  mobile: string | null;
  totalDue: number | null;
}

interface ScanRow {
  party: string;
  amount: number | null;
  cash: number | null;
  chq: number | null;
  dis: number | null;
  matchedPartyId: string | null;
  matchedPartyName: string | null;
  matchScore: number;
}

interface EditableRow extends ScanRow {
  selected: boolean;
  partyId: string; // '' = no match chosen
  cashInput: string;
  chqInput: string;
}

type Stage = 'pick' | 'preview' | 'scanning' | 'review' | 'applying';

const MATCH_THRESHOLD_DISPLAY = 0.55;

/**
 * Upload/photograph a handwritten collection-round sheet — the same
 * Party/Amt/Cash/Chq/Dis notebook page the "Collection Register" PDF is
 * modeled on — and have AI read it back into editable rows the shopkeeper
 * confirms before anything is written to the ledger. Applying posts one
 * `/crm/payments` call per non-zero Cash/Chq cell against the picked party;
 * `Dis` (discount) is shown but never auto-applied — writing off a debt is
 * an accounting decision, not something a photo scan should do silently.
 */
export default function ScanCollectionModal({
  onClose,
  onApplied,
  // Which ledger side to match scanned rows against. Defaults to 'party'
  // (Udyog wholesale — the original use case) so existing callers keep
  // working with no change; retail Udhar callers pass 'customer' to match
  // rows against Customer rows with customerType='customer' (or null).
  entityType = 'party',
}: {
  onClose: () => void;
  onApplied: () => void;
  entityType?: 'party' | 'customer';
}) {
  const [stage, setStage] = useState<Stage>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError('');
    setStage('preview');
  }

  async function runScan() {
    if (!file) return;
    setStage('scanning');
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post(`/party/scan-collection?entityType=${entityType}`, fd);
      const scannedRows: ScanRow[] = res.data?.rows || [];
      const partyList: PartyOption[] = res.data?.parties || [];
      setParties(partyList);
      setRows(scannedRows.map((r) => ({
        ...r,
        selected: !!r.matchedPartyId,
        partyId: r.matchedPartyId || '',
        cashInput: r.cash ? String(r.cash) : '',
        chqInput: r.chq ? String(r.chq) : '',
      })));
      if (scannedRows.length === 0) {
        setError('No rows were readable in this photo. Try a clearer, well-lit shot with the page flat.');
        setStage('preview');
        return;
      }
      setStage('review');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to scan the photo. Please try again.');
      setStage('preview');
    }
  }

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const selectedCount = rows.filter((r) => r.selected && r.partyId && (Number(r.cashInput) > 0 || Number(r.chqInput) > 0)).length;

  async function applyPayments() {
    setStage('applying');
    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      if (!row.selected || !row.partyId) continue;
      const cash = Number(row.cashInput) || 0;
      const chq = Number(row.chqInput) || 0;
      if (cash <= 0 && chq <= 0) continue;
      try {
        if (cash > 0) {
          await api.post('/crm/payments', {
            entityType, entityId: row.partyId, amount: cash,
            paymentMode: 'Cash', note: `Collection round scan (${row.party})`,
          });
        }
        if (chq > 0) {
          await api.post('/crm/payments', {
            entityType, entityId: row.partyId, amount: chq,
            paymentMode: 'Cheque', note: `Collection round scan (${row.party})`,
          });
        }
        ok++;
      } catch {
        failed++;
      }
    }
    if (ok > 0) onApplied();
    if (failed === 0) {
      toast.success(`Applied payments for ${ok} ${ok === 1 ? 'party' : 'parties'}`);
      onClose();
    } else {
      setStage('review');
      toast.error(`${failed} payment${failed === 1 ? '' : 's'} failed — check the rows and retry.`);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ScanLine size={18} className="text-indigo-500" />
            Scan Collection Sheet
          </h2>
          <button onClick={onClose} disabled={stage === 'scanning' || stage === 'applying'}>
            <X size={20} className="text-slate-400 hover:text-slate-700 transition-colors" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {stage === 'pick' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Photograph or upload your collection round notebook page — AI will read each party&apos;s Cash/Chq amounts so you don&apos;t have to type them in one by one.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  <Camera size={28} />
                  <span className="text-sm font-bold">Take Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Upload size={28} />
                  <span className="text-sm font-bold">Upload Photo</span>
                </button>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
          )}

          {(stage === 'preview' || stage === 'scanning') && previewUrl && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-80 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <img src={previewUrl} alt="Collection sheet preview" className="max-h-80 w-auto object-contain" />
              </div>
              {error && (
                <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={14} /> {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStage('pick'); setFile(null); setPreviewUrl(null); }}
                  disabled={stage === 'scanning'}
                  className="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={runScan}
                  disabled={stage === 'scanning'}
                  className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
                >
                  {stage === 'scanning' ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
                  {stage === 'scanning' ? 'Reading sheet…' : 'Scan Now'}
                </button>
              </div>
            </div>
          )}

          {(stage === 'review' || stage === 'applying') && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Check each row before applying — pick the right party if the match looks wrong, and adjust any Cash/Chq amount AI misread. Unchecked rows are skipped.
              </p>
              <div className="space-y-2">
                {rows.map((row, idx) => {
                  const tone = row.matchScore >= 0.8 ? 'emerald' : row.matchScore >= MATCH_THRESHOLD_DISPLAY ? 'amber' : 'red';
                  return (
                    <div key={idx} className={cn('rounded-xl border p-3 space-y-2', row.selected ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-60')}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={row.selected} onChange={(e) => updateRow(idx, { selected: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-400 truncate" title={row.party}>Scanned: &quot;{row.party}&quot;</p>
                          <select
                            value={row.partyId}
                            onChange={(e) => updateRow(idx, { partyId: e.target.value, selected: true })}
                            className="w-full text-sm font-bold bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none py-0.5"
                          >
                            <option value="">— No match, skip —</option>
                            {parties.map((p) => (
                              <option key={p.id} value={p.id}>{p.shopName || p.name}{p.mobile ? ` (${p.mobile})` : ''}</option>
                            ))}
                          </select>
                        </div>
                        {row.matchedPartyId && (
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                            tone === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : tone === 'amber' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400')}>
                            {Math.round(row.matchScore * 100)}% match
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 pl-6">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Cash</label>
                          <div className="relative">
                            <IndianRupee size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="number" min="0" value={row.cashInput} onChange={(e) => updateRow(idx, { cashInput: e.target.value })}
                              className="w-full h-8 pl-6 pr-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-indigo-500" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Chq</label>
                          <div className="relative">
                            <IndianRupee size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="number" min="0" value={row.chqInput} onChange={(e) => updateRow(idx, { chqInput: e.target.value })}
                              className="w-full h-8 pl-6 pr-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-indigo-500" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase" title="Noted from the photo — not applied automatically">Dis (noted)</label>
                          <div className="h-8 px-2 flex items-center text-sm text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                            {row.dis ? `₹${row.dis.toLocaleString('en-IN')}` : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {error && (
                <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={14} /> {error}
                </p>
              )}
            </div>
          )}
        </div>

        {(stage === 'review' || stage === 'applying') && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 shrink-0">
            <button
              type="button"
              onClick={applyPayments}
              disabled={selectedCount === 0 || stage === 'applying'}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {stage === 'applying' ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {stage === 'applying' ? 'Applying…' : `Apply ${selectedCount} Payment${selectedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
