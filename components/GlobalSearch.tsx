'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Package, Users, ShoppingCart, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';

export default function GlobalSearch({ locale }: { locale: string }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ products: any[], suppliers: any[], customers: any[] } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { profile } = useBusinessStore();
  const isWholesale = profile?.packageType === 'wholesale';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setIsOpen(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        setResults(res.data);
      } catch (e: any) {
        if (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED') {
          return; // Ignore aborts
        }
        console.error(e);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (url: string) => {
    router.push(`/${locale}${url}`);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-full max-w-md hidden md:block" ref={wrapperRef}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input 
          type="text"
          placeholder={`Search products, suppliers, ${isWholesale ? 'parties' : 'customers'} (Cmd+K)`}
          className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900 dark:text-slate-100"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setIsOpen(true)}
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />}
      </div>

      {isOpen && results && (
        <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-xl overflow-hidden z-50">
          <div className="max-h-96 overflow-y-auto p-2 space-y-4">
            
            {/* Products */}
            {results.products?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 flex items-center gap-2"><Package size={12}/> Products</h3>
                <div className="space-y-1">
                  {results.products.map(p => (
                    <button key={p.id} onClick={() => handleSelect(`/products/${p.id}`)} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex justify-between items-center group">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-500 transition-colors">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">SKU: {p.sku || p.barcode || 'N/A'}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-500">₹{p.sellingPrice}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Suppliers */}
            {results.suppliers?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 flex items-center gap-2"><Users size={12}/> Suppliers</h3>
                <div className="space-y-1">
                  {results.suppliers.map(s => (
                    <button key={s.id} onClick={() => handleSelect('/suppliers')} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-500 transition-colors">{s.name}</p>
                      <p className="text-[10px] text-slate-500">{s.contact || s.mobile || 'No contact info'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customers */}
            {results.customers?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 flex items-center gap-2">
                  <User size={12}/> {isWholesale ? 'Parties' : 'Customers'}
                </h3>
                <div className="space-y-1">
                  {results.customers.map(c => (
                    <button key={c.id} onClick={() => handleSelect('/udhar')} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-500 transition-colors">{c.name}</p>
                      <p className="text-[10px] text-slate-500">{c.mobile || 'No phone'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {results.products?.length === 0 && results.suppliers?.length === 0 && results.customers?.length === 0 && (
              <div className="p-4 text-center text-slate-500 text-sm">
                No results found for "{query}"
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
