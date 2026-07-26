'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import SmartTranslator from '@/components/SmartTranslator';
import { Loader2, Check, CalendarDays, FileText, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { exportDailyStockRegisterPDF } from '@/lib/pdf/dailyStockRegister';

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
  // Per-row draft edits (received/closing as raw input strings) and per-row save state.
  const [drafts, setDrafts] = useState<Record<string, { received: string; closing: string }>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/stock/daily-register?date=${d}`);
      const data: { rows: RegisterRow[] } = res.data;
      setRows(data.rows || []);
      const nextDrafts: Record<string, { received: string; closing: string }> = {};
      for (const r of data.rows || []) {
        nextDrafts[r.productId] = {
          received: String(r.received ?? 0),
          closing: r.closing == null ? '' : String(r.closing),
        };
      }
      setDrafts(nextDrafts);
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

  function updateDraft(productId: string, field: 'received' | 'closing', value: string) {
    setDrafts(d => ({ ...d, [productId]: { ...d[productId], [field]: value } }));
    setRowStatus(s => ({ ...s, [productId]: 'idle' }));
  }

  async function saveRow(row: RegisterRow) {
    const draft = drafts[row.productId];
    if (!draft) return;
    const received = Number(draft.received) || 0;
    const closing = draft.closing === '' ? null : Number(draft.closing);
    setRowStatus(s => ({ ...s, [row.productId]: 'saving' }));
    try {
      await api.post('/stock/daily-register', {
        date,
        entries: [{ productId: row.productId, openingQty: row.opening, receivedQty: received, closingQty: closing }],
      });
      const total = row.opening + received;
      // Sale stays wired to actual billing (row.sold), independent of the manually entered Close.
      setRows(rs => rs.map(r => r.productId === row.productId
        ? { ...r, received, total, closing, saved: true }
        : r));
      setRowStatus(s => ({ ...s, [row.productId]: 'saved' }));
    } catch {
      setRowStatus(s => ({ ...s, [row.productId]: 'error' }));
    }
  }

  function downloadCSV() {
    if (filteredRows.length === 0) return;
    const headers = ['Product', 'Category', 'Rate', 'Opening', 'Receive', 'Total', 'Close', 'Sale'];
    const csvRows = filteredRows.map(row => {
      const draft = drafts[row.productId] || { received: '0', closing: '' };
      const receivedNum = Number(draft.received) || 0;
      const total = row.opening + receivedNum;
      const closingNum = draft.closing === '' ? '' : Number(draft.closing);
      return [
        `"${(row.name || '').replace(/"/g, '""')}"`,
        `"${(row.category || '').replace(/"/g, '""')}"`,
        row.rate != null ? row.rate.toFixed(2) : '',
        row.opening,
        receivedNum,
        total,
        closingNum,
        row.sold ?? '',
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
      const draft = drafts[row.productId] || { received: '0', closing: '' };
      const receivedNum = Number(draft.received) || 0;
      const total = row.opening + receivedNum;
      const closingNum = draft.closing === '' ? null : Number(draft.closing);
      return { name: row.name, category: row.category, unit: row.unit, rate: row.rate, opening: row.opening, received: receivedNum, total, closing: closingNum, sold: row.sold };
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
                  const draft = drafts[row.productId] || { received: '0', closing: '' };
                  const receivedNum = Number(draft.received) || 0;
                  const total = row.opening + receivedNum;
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
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">{row.opening}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          className="w-20 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          value={draft.received}
                          onChange={e => updateDraft(row.productId, 'received', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">{total}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          placeholder={t('notCountedYet')}
                          className="w-24 text-right bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-[10px]"
                          value={draft.closing}
                          onChange={e => updateDraft(row.productId, 'closing', e.target.value)}
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
