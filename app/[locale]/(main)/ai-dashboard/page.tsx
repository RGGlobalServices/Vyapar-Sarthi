'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Sparkles, Loader2, RefreshCw, TrendingUp, Package, Users,
  Zap, AlertTriangle, ShoppingCart, BarChart3, ChevronRight,
  CheckCircle2, ArrowUpRight, IndianRupee, Brain,
} from 'lucide-react';
import api from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';

const DrillDownChart = dynamic(() => import('@/components/reports/DrillDownChart'), { ssr: false });

function KPICard({ label, value, sub, icon: Icon, color = 'emerald' }: any) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-500 font-medium mt-1">{sub}</p>}
    </div>
  );
}

function ScoreMeter({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? 'emerald' : score >= 50 ? 'amber' : 'rose';
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-500',
    amber: 'text-amber-600 bg-amber-500',
    rose: 'text-rose-600 bg-rose-500',
  };
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" strokeWidth="10" stroke="currentColor" fill="none" className="text-slate-200 dark:text-slate-800" />
          <circle cx="50" cy="50" r="40" strokeWidth="10" fill="none"
            stroke="currentColor"
            strokeDasharray={`${2 * Math.PI * 40}`}
            strokeDashoffset={`${2 * Math.PI * 40 * (1 - score / 100)}`}
            className={`${colorMap[color].split(' ')[0]} transition-all duration-1000`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-black ${colorMap[color].split(' ')[0]}`}>{score}</span>
        </div>
      </div>
      <p className="text-xs font-bold text-slate-500 mt-2 text-center">{label}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action, iconColor = 'indigo' }: any) {
  const iconColorMap: Record<string, string> = {
    indigo: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20',
    emerald: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    amber: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
    rose: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20',
    purple: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconColorMap[iconColor]}`}>
            <Icon size={16} />
          </div>
          <h3 className="font-black text-sm text-slate-700 dark:text-slate-200 uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

type AutomationSuggestion = {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  actionLabel: string;
  actionPath?: string;
};

const PRIORITY_COLOR: Record<string, string> = {
  high: 'border-l-rose-500 bg-rose-50 dark:bg-rose-900/10',
  medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-900/10',
  low: 'border-l-slate-300 dark:border-l-slate-700 bg-slate-50 dark:bg-slate-800/30',
};
const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function AIDashboardPage() {
  const router = useRouter();
  const locale = useLocale();

  const [insightsReport, setInsightsReport] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [inventory, setInventory] = useState<any>(null);
  const [crm, setCrm] = useState<any>(null);
  const [automation, setAutomation] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [invRes, crmRes, autoRes] = await Promise.all([
        api.get('/ai/inventory'),
        api.get('/ai/crm'),
        api.get('/ai/automation'),
      ]);
      setInventory(invRes.data);
      setCrm(crmRes.data);
      setAutomation(autoRes.data);
    } catch (e) {
      console.error('AI Dashboard load error:', e);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadInsights = useCallback(async () => {
    if (insightsLoading) return;
    setInsightsLoading(true);
    try {
      const res = await api.post('/ai/insights', { locale });
      setInsightsReport(res.data.report || '');
    } catch {
      setInsightsReport('Unable to generate report. Please try again.');
    } finally {
      setInsightsLoading(false);
    }
  }, [locale, insightsLoading]);

  useEffect(() => {
    loadData();
    loadInsights();
  }, []);

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const overallScore = dataLoading ? 0 : Math.round(
    ((inventory?.summary?.inventoryHealthScore || 0) + (crm?.summary?.crmHealthScore || 0)) / 2
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-200 dark:border-indigo-800">
            <Brain size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">AI Dashboard</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Business intelligence powered by Vyapar Guru</p>
          </div>
        </div>
        <button onClick={() => { loadData(); loadInsights(); }} disabled={dataLoading || insightsLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white text-sm font-bold rounded-xl hover:bg-indigo-400 disabled:opacity-50 transition-colors shadow-sm">
          <RefreshCw size={15} className={dataLoading || insightsLoading ? 'animate-spin' : ''} />
          Refresh Analysis
        </button>
      </div>

      {/* Health Score + KPIs */}
      {!dataLoading && inventory && crm && (
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex gap-8">
              <ScoreMeter score={overallScore} label="Business Health" />
              <ScoreMeter score={inventory.summary.inventoryHealthScore || 0} label="Inventory" />
              <ScoreMeter score={crm.summary.crmHealthScore || 0} label="CRM" />
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-black">{inventory.summary.lowStockCount}</p>
                <p className="text-xs text-white/70 font-semibold mt-0.5">Low Stock</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-black">{inventory.summary.deadStockCount}</p>
                <p className="text-xs text-white/70 font-semibold mt-0.5">Dead Stock</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-black">{crm.summary.inactiveCount}</p>
                <p className="text-xs text-white/70 font-semibold mt-0.5">Inactive Customers</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-black">{fmt(crm.summary.totalOutstanding)}</p>
                <p className="text-xs text-white/70 font-semibold mt-0.5">Outstanding</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {dataLoading && (
        <div className="bg-slate-100 dark:bg-slate-800/50 rounded-3xl h-40 animate-pulse" />
      )}

      {/* AI Daily Report */}
      <SectionCard title="AI Business Report" icon={Sparkles} iconColor="indigo"
        action={
          <button onClick={loadInsights} disabled={insightsLoading}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-400 disabled:opacity-50 transition-colors">
            <RefreshCw size={12} className={insightsLoading ? 'animate-spin' : ''} />
            Regenerate
          </button>
        }>
        {insightsLoading ? (
          <div className="flex items-center gap-3 py-6">
            <Loader2 size={24} className="animate-spin text-indigo-400" />
            <p className="text-sm text-slate-500">Vyapar Guru is analyzing your business…</p>
          </div>
        ) : insightsReport ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
              {insightsReport}
            </pre>
          </div>
        ) : (
          <button onClick={loadInsights}
            className="w-full flex items-center justify-center gap-2 py-6 text-sm font-bold text-indigo-500 hover:text-indigo-400 transition-colors">
            <Sparkles size={16} />
            Generate Business Report
          </button>
        )}
      </SectionCard>

      {/* Automation Suggestions */}
      {automation && (
        <SectionCard title="Action Suggestions" icon={Zap} iconColor="amber"
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full">
                {automation.summary?.highPriority || 0} urgent
              </span>
            </div>
          }>
          {(automation.suggestions || []).length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-emerald-600">
              <CheckCircle2 size={20} />
              <span className="text-sm font-semibold">No urgent actions — business is running well!</span>
            </div>
          ) : (
            <div className="space-y-3">
              {(automation.suggestions as AutomationSuggestion[]).map((s) => (
                <div key={s.id} className={`border-l-4 rounded-xl p-4 ${PRIORITY_COLOR[s.priority]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${PRIORITY_BADGE[s.priority]}`}>
                          {s.priority}
                        </span>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">{s.title}</p>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{s.description}</p>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{s.impact}</p>
                    </div>
                    {s.actionPath && (
                      <button onClick={() => router.push(s.actionPath as any)}
                        className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-400 whitespace-nowrap transition-colors shrink-0">
                        {s.actionLabel} <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Two-column: Inventory + CRM */}
      {!dataLoading && inventory && crm && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inventory Intelligence */}
          <SectionCard title="Inventory Intelligence" icon={Package} iconColor="rose"
            action={<button onClick={() => router.push('/stock' as any)} className="text-xs font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1">View Stock <ArrowUpRight size={12} /></button>}>
            <div className="space-y-4">
              {/* Reorder Suggestions */}
              {inventory.reorderSuggestions?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Reorder Now</p>
                  <div className="space-y-2">
                    {inventory.reorderSuggestions.slice(0, 4).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-200 dark:border-rose-800">
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-white">{r.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {r.currentStock} left • {r.daysRemaining !== null ? `${r.daysRemaining}d remaining` : 'No sales data'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-rose-600">Suggest: {r.suggestedQty} {r.unit}</p>
                          <p className="text-[10px] text-slate-500">~{fmt(r.estimatedCost)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Fast Moving */}
              {inventory.fastMoving?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Fast Moving (30d)</p>
                  <div className="space-y-1.5">
                    {inventory.fastMoving.slice(0, 4).map((p: any, i: number) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="text-xs font-black text-slate-400 w-5">#{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{p.name}</p>
                            <p className="text-xs font-black text-emerald-600">{fmt(p.revenue30d)}</p>
                          </div>
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1">
                            <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (p.soldQty30d / (inventory.fastMoving[0]?.soldQty30d || 1)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* CRM Intelligence */}
          <SectionCard title="CRM Intelligence" icon={Users} iconColor="purple"
            action={<button onClick={() => router.push('/customers' as any)} className="text-xs font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1">View Customers <ArrowUpRight size={12} /></button>}>
            <div className="space-y-4">
              {/* Credit Risk */}
              {crm.creditRisk?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <AlertTriangle size={11} className="text-rose-500" /> Credit Risk
                  </p>
                  <div className="space-y-2">
                    {crm.creditRisk.slice(0, 3).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-200 dark:border-rose-800">
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-white">{c.name}</p>
                          <p className="text-[11px] text-slate-500">{c.mobile}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-rose-600">{c.utilization}% used</p>
                          <p className="text-[10px] text-slate-500">{fmt(c.outstanding)} / {fmt(c.creditLimit)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Customers */}
              {crm.topCustomers?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Top Customers (90d)</p>
                  <div className="space-y-1.5">
                    {crm.topCustomers.slice(0, 4).map((c: any, i: number) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="text-xs font-black text-slate-400 w-5">#{i + 1}</span>
                        <div className="flex-1 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{c.name}</p>
                            <p className="text-[10px] text-slate-400">{c.billCount} bills</p>
                          </div>
                          <p className="text-xs font-black text-emerald-600">{fmt(c.totalSpent)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive Customers */}
              {crm.inactiveCustomers?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Inactive (No purchase in 30d)</p>
                  <div className="flex flex-wrap gap-2">
                    {crm.inactiveCustomers.slice(0, 6).map((c: any) => (
                      <div key={c.id} className="text-xs bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
                        <p className="font-bold text-slate-700 dark:text-slate-300">{c.name}</p>
                        {c.outstanding > 0 && <p className="text-[10px] text-rose-500 font-bold">{fmt(c.outstanding)} due</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Dead Stock Alert */}
      {!dataLoading && inventory?.deadStock?.length > 0 && (
        <SectionCard title="Dead Stock — Capital at Risk" icon={AlertTriangle} iconColor="amber">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {inventory.deadStock.slice(0, 6).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">{p.name}</p>
                  <p className="text-[11px] text-slate-500">{p.currentStock} {p.unit || 'units'} · No sales in 30d</p>
                </div>
                <p className="text-xs font-black text-amber-700 dark:text-amber-400">{fmt(p.tiedValue)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Total capital tied in dead stock: <span className="font-black text-amber-600">
              {fmt(inventory.deadStock.reduce((a: number, p: any) => a + p.tiedValue, 0))}
            </span>
          </p>
        </SectionCard>
      )}
    </div>
  );
}
