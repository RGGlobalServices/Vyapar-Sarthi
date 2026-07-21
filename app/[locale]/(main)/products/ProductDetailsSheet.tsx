'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  X, Package, RefreshCw, Loader2, ArrowRightLeft,
  TrendingDown, MapPin, CheckCircle, Edit, Hash,
  IndianRupee, TrendingUp, Warehouse, ArrowUp, ArrowDown,
  Tag, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import useSWR, { useSWRConfig } from 'swr';
import ReceiveDrawer from '../stock/ReceiveDrawer';

const fetcher = (url: string | string[]) => {
  const target = Array.isArray(url) ? url[0] : url;
  return api.get(target).then(res => res.data);
};
import { useBusinessStore } from '@/lib/businessStore';

export default function ProductDetailsSheet({
  productId,
  onClose,
  onEdit,
  onDelete
}: {
  productId: string;
  onClose: () => void;
  onEdit: (product: any) => void;
  onDelete?: (productId: string) => void;
}) {
  const t = useTranslations('ProductDetails');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  
  const { mutate } = useSWRConfig();
  
  const { activeShopId } = useBusinessStore();
  const [showReceive, setShowReceive] = useState(false);
  const { data: godowns = [] } = useSWR(activeShopId ? ['/godowns', activeShopId] : null, fetcher);

  useEffect(() => {
    if (productId) fetchDetails();
  }, [productId]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/products/${productId}/erp-details`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isInflow = (type: string) =>
    type === 'purchase' || type === 'transfer_in' || type === 'return';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Package size={20} className="text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                {data?.product?.name || (loading ? t('loading') : '—')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                <Tag size={10} />
                {data?.product?.barcode || data?.product?.sku || t('noSku')}
                {data?.product?.category && (
                  <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                    {data.product.category}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              disabled={loading}
              onClick={() => setShowReceive(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-40"
            >
              <Package size={13} /> Receive Stock
            </button>
            {onDelete && (
              <button
                disabled={loading}
                onClick={() => {
                  if (confirm(t('confirmDelete') || 'Are you sure you want to delete this product?')) {
                    onDelete(productId);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors disabled:opacity-40"
              >
                <Trash2 size={13} /> {t('delete') || 'Delete'}
              </button>
            )}
            <button
              disabled={loading}
              onClick={() => onEdit(data?.product)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
            >
              <Edit size={13} /> {t('edit')}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-transparent">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="text-sm">{t('loadingDetails')}</span>
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 dark:text-slate-500">
              <Package size={40} className="text-slate-300 dark:text-slate-700" />
              <span className="text-sm">{t('failedToLoad')}</span>
            </div>
          ) : (
            <div className="p-5 space-y-5">

              {/* ── Stat Cards ── */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Hash size={14} className="text-blue-500 dark:text-blue-400" />}
                  label={t("totalStock")}
                  value={`${data.totalStock}${data.product.baseUnit ? ' ' + data.product.baseUnit : ''}`}
                  valueClass="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  icon={<IndianRupee size={14} className="text-emerald-500 dark:text-emerald-400" />}
                  label={t("stockValue")}
                  value={`₹${data.stockValue.toLocaleString('en-IN')}`}
                  valueClass="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  icon={<TrendingDown size={14} className="text-slate-500 dark:text-slate-400" />}
                  label={t("costPrice")}
                  value={`₹${(data.product.wholesaleCost || 0).toLocaleString('en-IN')}`}
                  valueClass="text-slate-900 dark:text-white"
                />
                <StatCard
                  icon={<TrendingUp size={14} className="text-emerald-500 dark:text-emerald-400" />}
                  label={t("sellingPrice")}
                  value={`₹${(data.product.sellingPrice || 0).toLocaleString('en-IN')}`}
                  valueClass="text-emerald-600 dark:text-emerald-400"
                />
              </div>

              {/* ── Active Batches ── */}
              <Section
                icon={<CheckCircle size={14} className="text-emerald-500 dark:text-emerald-400" />}
                title={t("activeBatches")}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[420px]">
                    <thead>
                      <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                        <th className="px-4 py-2.5 font-semibold">{t("batchNo")}</th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("qty")}</th>
                        <th className="px-4 py-2.5 font-semibold">{t("expiry")}</th>
                        <th className="px-4 py-2.5 font-semibold">{t("added")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.batches.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-500 dark:text-slate-500 text-sm">
                            {t("noActiveBatches")}
                          </td>
                        </tr>
                      ) : data.batches.map((b: any) => (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                            {b.batchNumber || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                              {b.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                            {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-500">
                            {new Date(b.createdAt).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Stock by Warehouse ── */}
              <Section
                icon={<Warehouse size={14} className="text-blue-500 dark:text-blue-400" />}
                title={t("stockByWarehouse")}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[280px]">
                    <thead>
                      <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                        <th className="px-4 py-2.5 font-semibold">
                          <span className="flex items-center gap-1"><MapPin size={11} /> {t("warehouse")}</span>
                        </th>
                        <th className="px-4 py-2.5 font-semibold text-right">{t("quantity")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.warehouses.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-slate-500 dark:text-slate-500 text-sm">
                            {t("notAssigned")}
                          </td>
                        </tr>
                      ) : data.warehouses.map((w: any) => (
                        <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{w.name}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                              {w.quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Recent Movements ── */}
              <Section
                icon={<RefreshCw size={14} className="text-purple-500 dark:text-purple-400" />}
                title={t("recentMovements")}
              >
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.movements.length === 0 ? (
                    <p className="px-4 py-6 text-center text-slate-500 dark:text-slate-500 text-sm">
                      {t("noRecentMovements")}
                    </p>
                  ) : data.movements.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border',
                          isInflow(m.type)
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                            : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20'
                        )}>
                          {isInflow(m.type)
                            ? <ArrowDown size={13} />
                            : <ArrowUp size={13} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize leading-tight">
                            {m.type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                            {new Date(m.created_at).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        'font-mono font-bold text-sm flex-shrink-0',
                        isInflow(m.type) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                      )}>
                        {isInflow(m.type) ? '+' : '-'}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

            </div>
          )}
        </div>
      </div>
      
      {showReceive && data?.product && (
        <ReceiveDrawer 
          product={data.product}
          godowns={godowns}
          onClose={() => setShowReceive(false)}
          onSuccess={() => {
            setShowReceive(false);
            fetchDetails(); // refresh stock
            mutate('/products'); // refresh background table
          }}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({
  icon, label, value, valueClass
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-500 text-xs font-medium uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className={cn('text-xl font-bold leading-tight truncate', valueClass)}>
        {value}
      </p>
    </div>
  );
}

function Section({
  icon, title, children
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/80">
        {icon}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}
