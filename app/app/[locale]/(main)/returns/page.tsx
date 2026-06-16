'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  RotateCcw, 
  Search, 
  Package, 
  AlertCircle, 
  CheckCircle,
  ArrowRight,
  History
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ReturnsPage() {
  const t = useTranslations('Returns');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchBill = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      // URL encode to handle special characters like #
      const res = await api.get(`/billing/${encodeURIComponent(searchQuery.trim())}`);
      
      if (!res.data || Array.isArray(res.data)) {
        throw new Error('Invoice not found or invalid response');
      }

      setBill(res.data);
      // Initialize returnable items (quantity 0 initially)
      if (res.data.items) {
        setReturnItems(res.data.items.map((item: any) => ({ ...item, returnQty: 0 })));
      } else {
        setReturnItems([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch bill detail:', err);
      // Better error detail logging
      const errorDetail = {
        status: err.response?.status || err.status,
        data: err.response?.data || err.data,
        message: err.message || (typeof err === 'string' ? err : JSON.stringify(err))
      };
      console.error('Failed to fetch bill detail error detail:', errorDetail);
      alert(`Error: ${errorDetail.data?.detail || errorDetail.message || 'Bill not found or error fetching data'}`);
      setBill(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnSubmit = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQty > 0);
    if (itemsToReturn.length === 0) return;

    setSubmitting(true);
    try {
      await api.post(`/billing/returns`, {
        bill_id: bill.id,
        items: itemsToReturn.map(item => ({
          item_id: item.id,
          quantity: item.returnQty
        }))
      });
      alert('Return processed successfully!');
      setBill(null);
      setReturnItems([]);
      setSearchQuery('');
    } catch (err: any) {
      console.error('Failed to process return detail:', err);
      const errorDetail = {
        status: err.response?.status || err.status,
        data: err.response?.data || err.data,
        message: err.message || (typeof err === 'string' ? err : JSON.stringify(err))
      };
      console.error('Failed to process return error detail:', errorDetail);
      alert(`Error processing return: ${errorDetail.data?.detail || errorDetail.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <RotateCcw className="text-orange-500" /> Returns & Refunds
          </h1>
          <p className="text-slate-500 text-sm font-medium">Process product returns and manage refunds</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Search & Bill Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-200">Find Invoice</CardTitle>
              <CardDescription className="text-xs text-slate-500">Enter Invoice ID to start return</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 transition-all">
                <Search size={18} className="text-slate-500" />
                <input 
                  type="text" 
                  placeholder="INV-XXXXXX"
                  className="bg-transparent border-none text-white text-sm outline-none w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchBill()}
                />
              </div>
              <button 
                onClick={fetchBill}
                disabled={loading || !searchQuery.trim()}
                className="w-full bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Searching...' : 'Search Invoice'}
              </button>
            </CardContent>
          </Card>

          {bill && (
            <Card className="bg-slate-900 border-slate-800 animate-in slide-in-from-left-4">
              <CardHeader className="border-b border-slate-800/50 pb-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold text-slate-200">Invoice Summary</CardTitle>
                  <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {bill.invoice_number || `ID: ${bill.id.substring(0, 8)}`}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="text-slate-200 font-bold">{bill.customer_name || 'Guest'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date</span>
                  <span className="text-slate-200 font-bold">{new Date(bill.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Paid</span>
                  <span className="text-slate-200 font-bold">₹{bill.total_amount.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-800/50 flex justify-between items-center">
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment</span>
                   <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-emerald-500/20">
                     {bill.payment_type}
                   </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Return Items */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
            <CardHeader className="border-b border-slate-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-200">Return Items</CardTitle>
                  <CardDescription className="text-slate-500">Select items and quantity to return</CardDescription>
                </div>
                {bill && (
                   <div className="flex items-center gap-2 text-xs font-bold text-orange-400 bg-orange-400/10 px-3 py-1 rounded-full border border-orange-400/20">
                     <History size={14} /> Ready for Return
                   </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              {!bill ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <Package size={48} className="text-slate-800 mb-4" />
                  <p className="text-slate-500 font-medium">Search for an invoice to start processing a return</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {returnItems.map((item, idx) => (
                    <div key={idx} className="p-6 hover:bg-slate-800/20 transition-colors flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-200">{item.name || `Product #${item.product_id}`}</h4>
                        <p className="text-xs text-slate-500">Price: ₹{item.price_per_unit} | Purchased: {item.quantity}</p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 p-1">
                          <button 
                            onClick={() => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: Math.max(0, it.returnQty - 1) } : it))}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                          >
                            -
                          </button>
                          <span className="w-10 text-center text-sm font-bold text-white">
                            {item.returnQty}
                          </span>
                          <button 
                            onClick={() => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: Math.min(item.quantity, it.returnQty + 1) } : it))}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <div className="w-24 text-right">
                          <p className="text-xs text-slate-500 font-bold uppercase">Return Val</p>
                          <p className="text-sm font-black text-emerald-400">₹{(item.returnQty * item.price_per_unit).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {bill && (
              <div className="p-6 bg-slate-800/30 border-t border-slate-800 mt-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Refund Amount</p>
                    <p className="text-2xl font-black text-white">
                      ₹{returnItems.reduce((acc, item) => acc + (item.returnQty * item.price_per_unit), 0).toLocaleString()}
                    </p>
                  </div>
                  <button 
                    onClick={handleReturnSubmit}
                    disabled={submitting || returnItems.every(i => i.returnQty === 0)}
                    className="bg-orange-500 text-white px-8 py-3 rounded-xl font-black hover:bg-orange-400 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-30 disabled:active:scale-100 shadow-lg shadow-orange-500/20"
                  >
                    {submitting ? 'Processing...' : 'Complete Return'}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                  <AlertCircle size={12} className="mt-0.5" />
                  Processing a return will automatically adjust your inventory levels and record a refund transaction in your ledger.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
