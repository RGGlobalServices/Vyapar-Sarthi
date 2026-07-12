'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Package, FileSpreadsheet, ShoppingCart, Users, Truck, BookOpen, Calculator, Sparkles, UploadCloud, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import ImportWizard from './ImportWizard';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

type ImportType = 'product' | 'purchase' | 'stock' | 'suppliers' | 'customers' | 'sales' | 'ledger' | null;

export default function WholesaleImport() {
  const t = useTranslations('Import');
  const { profile } = useBusinessStore();
  const isUdyog = profile?.packageType === 'wholesale';
  const [selectedType, setSelectedType] = useState<ImportType>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = () => {
    setLoadingHistory(true);
    api.get('/activity?action=import_completed&take=10')
      .then(res => setHistory(res.data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => { loadHistory(); }, []);

  if (selectedType) {
    return <ImportWizard importType={selectedType} onBack={() => { setSelectedType(null); loadHistory(); }} />;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Sparkles size={32} className="text-slate-900" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Enterprise Data Import</h1>
          <p className="text-sm text-slate-500 mt-1">
            Smart AI-powered data ingestion for wholesalers, distributors, and multi-warehouse operations.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        <ImportCard 
          icon={<Package className="text-blue-500" size={32} />}
          title="Product Catalog"
          desc="Bulk-add products from Excel/CSV, or upload PDFs/photos for AI extraction. New products get their stock set in one go."
          onClick={() => setSelectedType('product')}
        />

        {isUdyog && (
          <ImportCard
            icon={<ShoppingCart className="text-emerald-500" size={32} />}
            title="Purchase Invoice"
            desc="Upload vendor bills (PDF/Image) for AI extraction and automatic inventory updates."
            onClick={() => setSelectedType('purchase')}
          />
        )}

        <ImportCard
          icon={<FileSpreadsheet className="text-purple-500" size={32} />}
          title="Opening Stock"
          desc="Bulk-add products with their starting stock quantity — creates the product if it doesn't exist yet."
          onClick={() => setSelectedType('stock')}
        />

        {isUdyog && (
          <ImportCard
            icon={<Truck className="text-orange-500" size={32} />}
            title="Suppliers"
            desc="Bulk import vendor and supplier details from Excel."
            onClick={() => setSelectedType('suppliers')}
          />
        )}

        <ImportCard 
          icon={<Users className="text-indigo-500" size={32} />}
          title="Customers"
          desc="Import your entire customer base quickly."
          onClick={() => setSelectedType('customers')}
        />

        <ImportCard 
          icon={<Calculator className="text-pink-500" size={32} />}
          title="Sales History"
          desc="Import old sales invoices for reporting and analytics."
          onClick={() => setSelectedType('sales')}
        />

        <ImportCard 
          icon={<BookOpen className="text-amber-500" size={32} />}
          title="Ledger / Udhar"
          desc="Import opening balances for customers and suppliers."
          onClick={() => setSelectedType('ledger')}
        />

      </div>

      {/* Recent Imports */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
          <UploadCloud size={20} className="text-slate-400" /> Recent Imports
        </h2>
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
            {loadingHistory ? (
              <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
            ) : history.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">No imports yet.</p>
            ) : (
              history.map((log) => {
                const d = log.details || {};
                const hasErrors = (d.errorCount || 0) > 0;
                return (
                  <div key={log.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      {hasErrors ? (
                        <XCircle size={18} className="text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{d.importType || 'Unknown'} Import</p>
                        <p className="text-xs text-slate-500">
                          {d.created || 0} created · {d.updated || 0} updated
                          {d.skipped ? ` · ${d.skipped} skipped` : ''}
                          {hasErrors ? ` · ${d.errorCount} failed` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-400 shrink-0">
                      {new Date(log.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ImportCard({ icon, title, desc, onClick }: { icon: any, title: string, desc: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-left hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 transition-all group"
    >
      <div className="bg-slate-50 dark:bg-slate-800 w-16 h-16 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{desc}</p>
    </button>
  );
}
