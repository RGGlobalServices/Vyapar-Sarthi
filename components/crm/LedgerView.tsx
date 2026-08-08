'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ArrowUpRight, ArrowDownLeft, FileText, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { ExportButton } from '@/lib/hooks/useExport';

type Transaction = {
  id: string;
  type: string;
  amount: number;
  note: string;
  billNumber: string;
  createdAt: string;
  created_at?: string;
};

export default function LedgerView({
  entityId,
  entityType,
  entityName
}: {
  entityId: string;
  entityType: 'customer' | 'party' | 'supplier';
  entityName?: string;
}) {
  const t = useTranslations('LedgerView');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const res = await api.get(`/crm/ledger?entityType=${entityType}&entityId=${entityId}`);
        setTransactions(res.data);
      } catch (e) {
        console.error('Failed to load ledger', e);
      } finally {
        setLoading(false);
      }
    };
    if (entityId) fetchLedger();
  }, [entityId, entityType]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Credit = money the party/customer owes (a bill on account); Payment =
  // money they actually handed over. Reused for both the on-screen +/- glyph
  // and the exported "Direction" column so the two can never disagree.
  const isCredit = (tx: Transaction) => tx.type === 'credit' || tx.type === 'udhar' || tx.type === 'sale';
  const totalCredit = transactions.filter(isCredit).reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalPayments = transactions.filter(tx => !isCredit(tx)).reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const typeLabel = (tx: Transaction) => tx.type === 'udhar' ? t('creditBill') : tx.type === 'payment' ? t('paymentReceived') : tx.type;

  const exportData = transactions.map(tx => ({
    date: tx.createdAt || tx.created_at,
    type: typeLabel(tx),
    direction: isCredit(tx) ? 'Credit' : 'Payment',
    billNumber: tx.billNumber || '',
    amount: tx.amount,
    note: tx.note || '',
  }));

  const exportColumns = [
    { key: 'date', label: 'Date', type: 'date' as const },
    { key: 'type', label: 'Type' },
    { key: 'direction', label: 'Direction' },
    { key: 'billNumber', label: 'Bill Number' },
    { key: 'amount', label: 'Amount', type: 'currency' as const },
    { key: 'note', label: 'Note' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-medium text-slate-500">
          {transactions.length} {transactions.length === 1 ? t('transaction') || 'transaction' : t('transactions') || 'transactions'}
        </p>
        <ExportButton
          filename={`ledger-${(entityName || entityType).toString().trim().replace(/\s+/g, '-').toLowerCase()}`}
          title={`${entityName || 'Account'} — Ledger`}
          summary={[
            { label: 'Total Credit', value: `₹${totalCredit.toLocaleString('en-IN')}` },
            { label: 'Total Payments', value: `₹${totalPayments.toLocaleString('en-IN')}` },
          ]}
          columns={exportColumns}
          data={exportData}
        />
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>{t('noTransactionsFound')}</p>
        </div>
      ) : (
        transactions.map((tx) => {
          const dateStr = tx.createdAt || tx.created_at;
          const credit = isCredit(tx);

          return (
            <div key={tx.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex items-center p-4 gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                credit
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30'
                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30'
              }`}>
                {credit ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 dark:text-white truncate">
                  {typeLabel(tx)}
                </h4>
                <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                  {tx.billNumber && <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">{tx.billNumber}</span>}
                  {tx.note && <span>{tx.note}</span>}
                </p>
              </div>

              <div className="text-right shrink-0">
                <div className={`font-black ${credit ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {credit ? '+' : '-'}₹{tx.amount.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                  <Calendar size={10} /> {dateStr ? new Date(dateStr).toLocaleDateString() : ''}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
