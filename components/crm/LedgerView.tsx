'use client';

import { useState, useEffect } from 'react';
import { Loader2, ArrowUpRight, ArrowDownLeft, FileText, Calendar } from 'lucide-react';
import api from '@/lib/api';

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
  entityType
}: {
  entityId: string;
  entityType: 'customer' | 'party' | 'supplier';
}) {
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

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {transactions.map((tx) => {
        const dateStr = tx.createdAt || tx.created_at;
        const isCredit = tx.type === 'credit' || tx.type === 'udhar' || tx.type === 'sale';
        
        return (
          <div key={tx.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex items-center p-4 gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              isCredit 
                ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30' 
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30'
            }`}>
              {isCredit ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-slate-900 dark:text-white truncate">
                {tx.type === 'udhar' ? 'Credit Bill' : tx.type === 'payment' ? 'Payment Received' : tx.type}
              </h4>
              <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                {tx.billNumber && <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">{tx.billNumber}</span>}
                {tx.note && <span>{tx.note}</span>}
              </p>
            </div>
            
            <div className="text-right shrink-0">
              <div className={`font-black ${isCredit ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {isCredit ? '+' : '-'}₹{tx.amount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                <Calendar size={10} /> {dateStr ? new Date(dateStr).toLocaleDateString() : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
