import { Package, Clock, Activity, ArrowRightLeft, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function WholesaleWidgets({ data }: { data: any }) {
  const t = useTranslations('Dashboard');
  if (!data) return null;
  const { inventoryValue, expiringBatches, recentFeeds } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6">
      <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 dark:border-emerald-400/10 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Package size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Inventory Value</h3>
              <p className="text-xs text-slate-500">Based on wholesale cost</p>
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">
            ₹{Math.round(inventoryValue || 0).toLocaleString('en-IN')}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <CardHeader className="bg-amber-50 dark:bg-amber-500/10 py-4 flex flex-row items-center justify-between border-b border-amber-100 dark:border-amber-500/20">
          <CardTitle className="text-sm font-bold text-amber-700 dark:text-amber-500 flex items-center gap-2">
            <Clock size={16} /> Expiring Batches (30 Days)
          </CardTitle>
          <Link href="/stock" className="text-xs font-bold text-amber-600 hover:text-amber-700">View All</Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {expiringBatches?.length > 0 ? expiringBatches.map((b: any) => (
              <div key={b.id} className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{b.product.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Batch: {b.batchNumber || '-'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-500">{new Date(b.expiryDate).toLocaleDateString()}</p>
                  <p className="text-[10px] text-slate-500">{b.quantity} left</p>
                </div>
              </div>
            )) : (
              <div className="py-8 text-center text-slate-500 text-sm">No batches expiring soon</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <CardHeader className="bg-blue-50 dark:bg-blue-500/10 py-4 flex flex-row items-center justify-between border-b border-blue-100 dark:border-blue-500/20">
          <CardTitle className="text-sm font-bold text-blue-700 dark:text-blue-500 flex items-center gap-2">
            <Activity size={16} /> Recent Stock Activity
          </CardTitle>
          <Link href="/stock" className="text-xs font-bold text-blue-600 hover:text-blue-700">Ledger</Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentFeeds?.length > 0 ? recentFeeds.map((m: any) => (
              <div key={m.id} className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{m.product_name}</p>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 font-medium capitalize">
                    {m.type === 'purchase' || m.type === 'transfer_in' || m.type === 'return' 
                      ? <ArrowRightLeft size={10} className="text-emerald-500 rotate-90" />
                      : <TrendingDown size={10} className="text-rose-500" />}
                    {m.type.replace('_', ' ')}
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-sm font-black font-mono",
                    m.type === 'purchase' || m.type === 'transfer_in' || m.type === 'return' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                  )}>
                    {m.type === 'purchase' || m.type === 'transfer_in' || m.type === 'return' ? '+' : '-'}{m.quantity}
                  </p>
                  <p className="text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
              </div>
            )) : (
              <div className="py-8 text-center text-slate-500 text-sm">No recent activity</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
