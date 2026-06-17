'use client';
import { useMemo } from 'react';
import { AlertTriangle, Clock, CheckCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStockStore } from '@/lib/store';
import { getExpiryInfo } from '@/components/ExpiryDateField';
import { useBusinessStore } from '@/lib/businessStore';

interface ExpiryProduct {
  id: string | number;
  name: string;
  expiry_date?: string;
  current?: number;
  unit?: string;
}

interface ExpiryAlertBannerProps {
  products: ExpiryProduct[];
}

export default function ExpiryAlertBanner({ products }: ExpiryAlertBannerProps) {
  const { profile } = useBusinessStore();
  const config = { hasExpiry: true }; // Only rendered for businesses with expiry

  const withExpiry = useMemo(() => {
    return products
      .filter(p => p.expiry_date)
      .map(p => ({ ...p, info: getExpiryInfo(p.expiry_date) }))
      .filter(p => p.info && (p.info.status === 'expired' || p.info.status === 'urgent' || p.info.status === 'soon'))
      .sort((a, b) => (a.info?.daysLeft ?? 0) - (b.info?.daysLeft ?? 0));
  }, [products]);

  if (withExpiry.length === 0) return null;

  const expired = withExpiry.filter(p => p.info?.status === 'expired');
  const urgent  = withExpiry.filter(p => p.info?.status === 'urgent');
  const soon    = withExpiry.filter(p => p.info?.status === 'soon');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-orange-500/5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-400" />
          <p className="text-sm font-bold text-orange-400">Expiry Alerts</p>
          <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{withExpiry.length}</span>
        </div>
        <p className="text-xs text-slate-500">Next {withExpiry.length} product{withExpiry.length > 1 ? 's' : ''} expiring</p>
      </div>

      <div className="divide-y divide-slate-800/50">
        {/* Expired */}
        {expired.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">🔴 Expired ({expired.length})</p>
            <div className="space-y-1.5">
              {expired.map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={12} className="text-slate-500" />
                    <span className="text-sm text-slate-200">{p.name}</span>
                    {p.current !== undefined && (
                      <span className="text-xs text-slate-500">{p.current} {p.unit}</span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                    {p.info?.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Urgent (≤30 days) */}
        {urgent.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2">🟠 Expires Soon — within 30 days ({urgent.length})</p>
            <div className="space-y-1.5">
              {urgent.map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={12} className="text-slate-500" />
                    <span className="text-sm text-slate-200">{p.name}</span>
                  </div>
                  <span className="text-xs font-bold text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full">
                    {p.info?.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Soon (31–180 days) */}
        {soon.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest mb-2">🟡 Expiring in 1–6 months ({soon.length})</p>
            <div className="space-y-1.5">
              {soon.map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={12} className="text-slate-500" />
                    <span className="text-sm text-slate-300">{p.name}</span>
                  </div>
                  <span className="text-xs font-bold text-yellow-500 bg-yellow-500/15 px-2 py-0.5 rounded-full">
                    {p.info?.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
