'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import SmartTranslator from '@/components/SmartTranslator';
import { Loader2, Check, CalendarDays, FileText, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { useStockStore } from '@/lib/store';
import { exportDailyStockRegisterPDF } from '@/lib/pdf/dailyStockRegister';

interface RegisterHistoryEntry {
  type: 'receive' | 'close';
  quantity: number;
  note: string | null;
  at: string;
}

interface RegisterRow {
  productId: string;
  name: string | null;
  category: string | null;
  unit: string | null;
  rate: number | null;
  opening: number;
  received: number;
  total: number;
  closing: number | null;
  sold: number | null;
  saved: boolean;
  history: RegisterHistoryEntry[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyStockRegister() {
  const t = useTranslations('Stock');
  const locale = useLocale();
  const { profile } = useBusinessStore();

  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Per-row Opening / Receive / Close drafts (raw input strings) — all three
  // are editable, and Save persists whatever's currently in all of them.
  const [openingDrafts, setOpeningDrafts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [closingDrafts, setClosingDrafts] = useState<Record<string, string>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/stock/daily-register?date=${d}`);
      const data: { rows: RegisterRow[] } = res.data;
      setRows(data.rows || []);
      const nextOpeningDrafts: Record<string, string> = {};
      const nextDrafts: Record<string, string> = {};
      const nextClosingDrafts: Record<string, string> = {};
      for (const r of data.rows || []) {
        nextOpeningDrafts[r.productId] = String(r.opening ?? 0);
        nextDrafts[r.productId] = String(r.received ?? 0);
        nextClosingDrafts[r.productId] = r.closing != null ? String(r.closing) : '';
      }
      setOpeningDrafts(nextOpeningDrafts);
      setDrafts(nextDrafts);
      setClosingDrafts(nextClosingDrafts);
      setRowStatus({});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q));
  }, [rows, search]);

  function updateOpeningDraft(productId: string, value: string) {
    setOpeningDrafts(d => ({ ...d, [productId]: value }));
    setRowStatus(s => ({ ...s, [productId]: 'idle' }));
  }

  function updateDraft(productId: string, value: string) {
    setDrafts(d => {
      const prevReceived = Number(d[productId]) || 0;
      const nextReceived = Number(value) || 0;
      const delta = nextReceived - prevReceived;
      if (delta !== 0) {
        setClosingDrafts(cd => {
          const prevClosing = cd[productId];
          if (prevClosing === undefined || prevClosing === '') return cd;
          const prevClosingNum = Number(prevClosing) || 0;
          return { ...cd, [productId]: String(prevClosingNum + delta) };
        });
      }
      return { ...d, [productId]: value };
    });
    setRowStatus(s => ({ ...s, [productId]: 'idle' }));
  }

  function updateClosingDraft(productId: string, value: string) {
    setClosingDrafts(d => ({ ...d, [productId]: value }));
    setRowStatus(s => ({ ...s, [productId]: 'idle' }));
  }

  async function saveRow(row: RegisterRow) {
    const opening = Number(openingDrafts[row.productId]) || 0;
    const received = Number(drafts[row.productId]) || 0;
    const closingRaw = closingDrafts[row.productId];
    const closingQty = closingRaw === '' || closingRaw === undefined ? null : Number(closingRaw);
    setRowStatus(s => ({ ...s, [row.productId]: 'saving' }));
    try {
      const res = await api.post('/stock/daily-register', {
        date,
        entries: [{ productId: row.productId, openingQty: opening, receivedQty: received, closingQty }],
      });
      const total = opening + received;
      const newHistory: RegisterHistoryEntry[] = res.data?.newHistoryByProduct?.[row.productId] || [];
      setRows(rs => rs.map(r => r.productId === row.productId
        ? { ...r, opening, received, total, closing: closingQty, saved: true, history: [...r.history, ...newHistory] }
        : r));
      setRowStatus(s => ({ ...s, [row.productId]: 'saved' }));
      // Receive/Close here change Product.currentStock server-side — refresh
      // both the "All Stock" list (Zustand) and the Products page (SWR) so
      // they show the new number immediately, without a manual page reload.
      useStockStore.getState().fetchStock();
      import('swr').then(({ mutate }) => {
        mutate(key => typeof key === 'string' && key.startsWith('/products'), undefined, { revalidate: true });
      });
    } catch {
      setRowStatus(s => ({ ...s, [row.productId]: 'error' }));
    }
  }

  function historyLabel(h: RegisterHistoryEntry) {
    const time = formatTime(h.at);
    return h.type === 'receive'
      ? `${time} Received ${h.quantity > 0 ? '+' : ''}${h.quantity}`
      : `${time} Counted ${h.quantity}`;
  }

  function downloadCSV() {
    if (filteredRows.length === 0) return;
    const headers = ['Product', 'Category', 'Rate', 'Opening', 'Receive', 'Total', 'Close', 'Sale', 'Updates (date-time wise)'];
    const csvRows = filteredRows.map(row => {
      const openingNum = Number(openingDrafts[row.productId]) || 0;
      const receivedNum = Number(drafts[row.productId]) || 0;
      const total = openingNum + receivedNum;
      const closingDraft = closingDrafts[row.productId];
      const closingNum = closingDraft === undefined || closingDraft === '' ? '' : Number(closingDraft);
      const updates = (row.history || []).map(historyLabel).join(' | ');
      return [
        `"${(row.name || '').replace(/"/g, '""')}"`,
        `"${(row.category || '').replace(/"/g, '""')}"`,
        row.rate != null ? row.rate.toFixed(2) : '',
        openingNum,
        receivedNum,
        total,
        closingNum,
        row.sold ?? '',
        `"${updates.replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvString = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Daily_Stock_Register_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadPDF() {
    if (filteredRows.length === 0) return;
    const pdfRows = filteredRows.map(row => {
      const openingNum = Number(openingDrafts[row.productId]) || 0;
      const receivedNum = Number(drafts[row.productId]) || 0;
      const total = openingNum + receivedNum;
      const closingDraft = closingDrafts[row.productId];
      const closingNum = closingDraft === undefined || closingDraft === '' ? null : Number(closingDraft);
      return {
        name: row.name, category: row.category, unit: row.unit, rate: row.rate,
        opening: openingNum, received: receivedNum, total, closing: closingNum, sold: row.sold,
        history: row.history || [],
      };
    });
    exportDailyStockRegisterPDF(pdfRows, profile.shopName, date);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-slate-400" />
          <input
            type="date"
            max={todayStr()}
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full sm:w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={downloadPDF}
            disabled={filteredRows.length === 0}
            title={t('downloadPdf')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 whitespace-nowrap">
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={downloadCSV}
            disabled={filteredRows.length === 0}
            title={t('downloadExcel')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 whitespace-nowrap">
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">{t('registerHint')}</p>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">{t('colProduct')}</th>
                  <th className="px-4 py-3 text-right">{t('colRate')}</th>
                  <th className="px-4 py-3 text-right">{t('colOpening')}</th>
                  <th className="px-4 py-3 text-right">{t('colReceived')}</th>
                  <th className="px-4 py-3 text-right">{t('colTotal')}</th>
                  <th className="px-4 py-3 text-right">{t('colClosing')}</th>
                  <th className="px-4 py-3 text-right">{t('colSale')}</th>
                  <th className="px-4 py-3 text-center">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500"><Loader2 className="animate-spin inline-block" size={20} /></td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">{t('noProductsForRegister')}</td></tr>
                ) : filteredRows.map(row => {
                  const openingDraft = openingDrafts[row.productId] ?? '0';
                  const openingNum = Number(openingDraft) || 0;
                  const receivedDraft = drafts[row.productId] ?? '0';
                  const receivedNum = Number(receivedDraft) || 0;
                  const total = openingNum + receivedNum;
                  const closingDraft = closingDrafts[row.productId] ?? '';
                  const sold = row.sold;
                  const status = rowStatus[row.productId] || 'idle';
                  return (
                    <tr key={row.productId} className="text-slate-900 dark:text-slate-200">
                      <td className="px-4 py-2.5">
                        <div className="font-medium"><SmartTranslator text={row.name || ''} locale={locale} /></div>
                        <div className="text-[11px] text-slate-500">
                          <SmartTranslator text={row.category || ''} locale={locale} />
                          {row.unit ? ` · ${row.unit}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{row.rate != null ? `₹${row.rate.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right align-top">
                        <input
                          type="number"
                          className="w-20 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          value={openingDraft}
                          onChange={e => updateOpeningDraft(row.productId, e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right align-top">
                        <input
                          type="number"
                          className="w-20 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          value={receivedDraft}
                          onChange={e => updateDraft(row.productId, e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">{total}</td>
                      <td className="px-4 py-2.5 text-right align-top">
                        <input
                          type="number"
                          placeholder={t('notCountedYet')}
                          className="w-24 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-[10px]"
                          value={closingDraft}
                          onChange={e => updateClosingDraft(row.productId, e.target.value)}
                        />
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-bold', sold == null ? 'text-slate-400' : sold > 0 ? 'text-emerald-500' : sold < 0 ? 'text-red-400' : 'text-slate-400')}>
                        {sold == null ? '—' : sold}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => saveRow(row)}
                          disabled={status === 'saving'}
                          className={cn('px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto transition-colors',
                            status === 'saved' ? 'bg-emerald-500/10 text-emerald-500' :
                            status === 'error' ? 'bg-red-500/10 text-red-400' :
                            'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-500')}
                        >
                          {status === 'saving' ? <Loader2 className="animate-spin" size={12} /> : status === 'saved' ? <Check size={12} /> : null}
                          {status === 'saved' ? t('savedRow') : t('saveRow')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
