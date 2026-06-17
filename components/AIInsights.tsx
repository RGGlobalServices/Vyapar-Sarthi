'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import {
  Sparkles, TrendingUp, TrendingDown, Minus,
  AlertTriangle, PackageSearch, Lightbulb,
  RefreshCw, ChevronDown, ChevronUp, BadgeIndianRupee,
  ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface PriceRec {
  product: string;
  currentPrice: number;
  marketPrice: number;
  suggestion: string;
  trend: 'up' | 'down' | 'stable';
}
interface StockAlert {
  product: string;
  stock: number;
  minStock: number;
  urgency: 'critical' | 'low' | 'order_soon';
  message: string;
}
interface ProfitAnalysis {
  yesterday: {
    sales: number;
    cost: number;
    profit: number;
    profitMargin: number;
    status: 'profit' | 'loss';
    summary: string;
  };
}
interface Suggestion {
  title: string;
  detail: string;
  impact: 'high' | 'medium' | 'low';
  category: 'pricing' | 'stock' | 'marketing' | 'operations';
}
interface InsightsData {
  priceRecommendations: PriceRec[];
  stockAlerts: StockAlert[];
  profitAnalysis: ProfitAnalysis;
  suggestions: Suggestion[];
  source?: 'ai' | 'smart';
}

/* ── District list ──────────────────────────────────────────────────────── */
const MH_DISTRICTS = [
  'Pune', 'Mumbai', 'Nashik', 'Aurangabad', 'Nagpur',
  'Kolhapur', 'Solapur', 'Satara', 'Sangli', 'Ahmednagar',
  'Latur', 'Osmanabad', 'Jalgaon', 'Nanded', 'Akola',
];

/* ── Helpers ────────────────────────────────────────────────────────────── */
function TrendIcon({ trend }: { trend: PriceRec['trend'] }) {
  if (trend === 'up')     return <TrendingUp   size={13} className="text-red-400"    />;
  if (trend === 'down')   return <TrendingDown size={13} className="text-emerald-400"/>;
  return                         <Minus        size={13} className="text-slate-400"  />;
}

const urgencyStyle: Record<StockAlert['urgency'], string> = {
  critical:   'bg-red-500/15 text-red-400 border-red-500/30',
  low:        'bg-orange-500/15 text-orange-400 border-orange-500/30',
  order_soon: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
};

const impactDot: Record<Suggestion['impact'], string> = {
  high:   'bg-emerald-500',
  medium: 'bg-yellow-500',
  low:    'bg-slate-500',
};

const categoryIcon: Record<Suggestion['category'], React.ReactNode> = {
  pricing:    <BadgeIndianRupee size={13} />,
  stock:      <PackageSearch    size={13} />,
  marketing:  <TrendingUp       size={13} />,
  operations: <Lightbulb        size={13} />,
};

/* ── Section toggle ─────────────────────────────────────────────────────── */
function Section({
  title, icon, count, color, children,
}: {
  title: string; icon: React.ReactNode; count?: number;
  color: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
      >
        <div className={cn('flex items-center gap-2 text-sm font-semibold', color)}>
          {icon} {title}
          {count !== undefined && (
            <span className="ml-1 bg-slate-700 text-slate-300 text-xs px-1.5 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {open && <div className="divide-y divide-slate-800/60">{children}</div>}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function AIInsights({ products }: { products: object[] }) {
  const locale = useLocale();
  const [district, setDistrict] = useState('Pune');
  const [data, setData]         = useState<InsightsData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [lastFetched, setLastFetched] = useState('');

  async function fetchInsights() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, district, locale }),
      });
      if (!res.ok) throw new Error('Server error');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }

  const pa = data?.profitAnalysis?.yesterday;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-slate-200 flex items-center gap-2 text-base">
          <Sparkles size={16} className="text-violet-400" />
          AI Business Insights
          <div className="ml-auto flex items-center gap-2">
            {data?.source && (
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
                data.source === 'ai'
                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              )}>
                {data.source === 'ai' ? '✦ Gemini AI' : '⚡ Smart Engine'}
              </span>
            )}
            {lastFetched && (
              <span className="text-[10px] text-slate-500 font-normal">Updated {lastFetched}</span>
            )}
          </div>
        </CardTitle>

        {/* District selector + refresh */}
        <div className="flex items-center gap-2 mt-2">
          <select
            value={district}
            onChange={e => setDistrict(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            {MH_DISTRICTS.map(d => (
              <option key={d} value={d}>{d} District</option>
            ))}
          </select>
          <button
            onClick={fetchInsights}
            disabled={loading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
              loading
                ? 'bg-violet-500/20 text-violet-300 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            )}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Analyzing…' : data ? 'Refresh' : 'Get AI Insights'}
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-5">

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Placeholder when not yet fetched */}
        {!data && !loading && !error && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Sparkles size={32} className="text-violet-400 opacity-40" />
            <p className="text-slate-400 text-sm">
              Select your district and click <span className="text-violet-400 font-semibold">Get AI Insights</span>
            </p>
            <p className="text-slate-600 text-xs">
              Powered by Gemini AI · Price data · Profit analysis · Sales tips
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[80, 60, 90, 70].map((w, i) => (
              <div key={i} className="h-3 bg-slate-800 rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ── Profit / Loss ─────────────────────────────────────── */}
            {pa && (
              <div className={cn(
                'rounded-xl border px-4 py-4',
                pa.status === 'profit'
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              )}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Yesterday</span>
                  <div className={cn('flex items-center gap-1.5 text-sm font-black',
                    pa.status === 'profit' ? 'text-emerald-400' : 'text-red-400')}>
                    {pa.status === 'profit'
                      ? <ArrowUpCircle   size={16} />
                      : <ArrowDownCircle size={16} />}
                    {pa.status === 'profit' ? 'PROFIT' : 'LOSS'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-slate-500">Sales</p>
                    <p className="text-sm font-bold text-slate-200">₹{pa.sales.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Cost</p>
                    <p className="text-sm font-bold text-slate-200">₹{pa.cost.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Net</p>
                    <p className={cn('text-sm font-bold',
                      pa.status === 'profit' ? 'text-emerald-400' : 'text-red-400')}>
                      ₹{pa.profit.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{pa.summary}</p>
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        pa.status === 'profit' ? 'bg-emerald-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(pa.profitMargin, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Margin: {pa.profitMargin.toFixed(1)}%</p>
                </div>
              </div>
            )}

            {/* ── Price Recommendations ─────────────────────────────── */}
            <Section
              title="Market Price Guide"
              icon={<BadgeIndianRupee size={14} />}
              count={data.priceRecommendations.length}
              color="text-blue-400"
            >
              {data.priceRecommendations.map((p, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <TrendIcon trend={p.trend} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{p.product}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.suggestion}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-slate-500">Market</p>
                    <p className={cn('text-xs font-bold',
                      p.marketPrice > p.currentPrice ? 'text-emerald-400' : 'text-orange-400')}>
                      ₹{p.marketPrice}
                    </p>
                    <p className="text-[10px] text-slate-600">vs ₹{p.currentPrice} yours</p>
                  </div>
                </div>
              ))}
            </Section>

            {/* ── Stock Alerts ──────────────────────────────────────── */}
            <Section
              title="Stock Alerts"
              icon={<AlertTriangle size={14} />}
              count={data.stockAlerts.length}
              color="text-orange-400"
            >
              {data.stockAlerts.map((a, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{a.product}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{a.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', urgencyStyle[a.urgency])}>
                      {a.urgency === 'critical' ? 'CRITICAL' : a.urgency === 'low' ? 'LOW' : 'ORDER SOON'}
                    </span>
                    <span className="text-[10px] text-slate-500">{a.stock} / min {a.minStock}</span>
                  </div>
                </div>
              ))}
            </Section>

            {/* ── Suggestions ──────────────────────────────────────── */}
            <Section
              title="Suggestions to Grow"
              icon={<Lightbulb size={14} />}
              count={data.suggestions.length}
              color="text-violet-400"
            >
              {data.suggestions.map((s, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className={cn('mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0', impactDot[s.impact])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-slate-500">{categoryIcon[s.category]}</span>
                      <p className="text-xs font-semibold text-slate-200">{s.title}</p>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{s.detail}</p>
                  </div>
                  <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
                    s.impact === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                    s.impact === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-slate-700 text-slate-400')}>
                    {s.impact}
                  </span>
                </div>
              ))}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
