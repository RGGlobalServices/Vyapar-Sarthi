'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Package, FileSpreadsheet, ShoppingCart, Users, Truck, BookOpen, Calculator, Sparkles } from 'lucide-react';
import ImportWizard from './ImportWizard';

type ImportType = 'product' | 'purchase' | 'stock' | 'suppliers' | 'customers' | 'sales' | 'ledger' | null;

export default function WholesaleImport() {
  const t = useTranslations('Import');
  const [selectedType, setSelectedType] = useState<ImportType>(null);

  if (selectedType) {
    return <ImportWizard importType={selectedType} onBack={() => setSelectedType(null)} />;
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
          desc="Import thousands of products from Excel/CSV without creating stock entries."
          onClick={() => setSelectedType('product')}
        />

        <ImportCard 
          icon={<ShoppingCart className="text-emerald-500" size={32} />}
          title="Purchase Invoice"
          desc="Upload vendor bills (PDF/Image) for AI extraction and automatic inventory updates."
          onClick={() => setSelectedType('purchase')}
        />

        <ImportCard 
          icon={<FileSpreadsheet className="text-purple-500" size={32} />}
          title="Opening Stock"
          desc="Set initial inventory levels across warehouses for existing products."
          onClick={() => setSelectedType('stock')}
        />

        <ImportCard 
          icon={<Truck className="text-orange-500" size={32} />}
          title="Suppliers"
          desc="Bulk import vendor and supplier details from Excel."
          onClick={() => setSelectedType('suppliers')}
        />

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
