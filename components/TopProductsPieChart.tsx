'use client';
import { useState, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Sector
} from 'recharts';
import { X, TrendingUp, Package, BarChart3, IndianRupee, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PieItem {
  name: string;
  value: number;
  percentage: number;
  qty?: number;
  profit?: number;
  revenue?: number;
  category?: string;
  detail?: string;
}

interface TopProductsPieChartProps {
  items: PieItem[];
  total: number;
  currency?: boolean;
  title?: string;
  valueLabel?: string;
  emptyMessage?: string;
}

const PALETTE = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1',
];

function fmt(val: number, currency = true) {
  if (currency) return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return val.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

// Active (hovered) slice render
function renderActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 10}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 14} outerRadius={outerRadius + 18}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
}

export default function TopProductsPieChart({
  items, total, currency = true, title = 'Top Products', valueLabel = 'Revenue', emptyMessage
}: TopProductsPieChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<PieItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const onPieEnter = useCallback((_: any, index: number) => setActiveIndex(index), []);
  const onPieLeave = useCallback(() => setActiveIndex(null), []);

  const onPieClick = useCallback((data: any, index: number) => {
    if (selectedIndex === index) {
      setSelected(null);
      setSelectedIndex(null);
    } else {
      setSelected(items[index]);
      setSelectedIndex(index);
    }
  }, [items, selectedIndex]);

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
        <BarChart3 size={40} className="opacity-30" />
        <p className="text-sm">{emptyMessage ?? 'No sales data yet'}</p>
      </div>
    );
  }

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => {
    if (items[index]?.percentage < 5) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight="bold">
        {items[index].percentage}%
      </text>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full">
      {/* Pie Chart */}
      <div className="flex-shrink-0 flex flex-col items-center">
        <ResponsiveContainer width={280} height={280}>
          <PieChart>
            <Pie
              data={items}
              cx="50%" cy="50%"
              innerRadius={60} outerRadius={120}
              dataKey="value"
              // @ts-ignore
              activeIndex={activeIndex ?? undefined}
              activeShape={renderActiveShape}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
              onClick={onPieClick}
              labelLine={false}
              label={renderCustomLabel}
              paddingAngle={2}
              style={{ cursor: 'pointer' }}
            >
              {items.map((_, i) => (
                <Cell
                  key={i}
                  fill={PALETTE[i % PALETTE.length]}
                  opacity={selectedIndex !== null && selectedIndex !== i ? 0.45 : 1}
                  stroke={selectedIndex === i ? '#fff' : 'transparent'}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
              formatter={(val: any) => [fmt(val, currency), valueLabel]}
              labelFormatter={(label: any) => `${label}`}
            />
          </PieChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 -mt-2">
          Total: <span className="text-slate-900 dark:text-slate-300 font-bold">{fmt(total, currency)}</span>
        </p>
      </div>

      {/* Right: ranked list + detail panel */}
      <div className="flex-1 min-w-0 space-y-2 overflow-y-auto max-h-72">
        {selected ? (
          /* Product Detail Panel */
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3 relative">
            <button onClick={() => { setSelected(null); setSelectedIndex(null); }}
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PALETTE[(selectedIndex ?? 0) % PALETTE.length]} } />
              <p className="font-black text-slate-900 dark:text-slate-100 text-base truncate">{selected.name}</p>
            </div>
            {selected.category && (
              <p className="text-xs text-slate-500 uppercase tracking-widest">{selected.category}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-900 shadow-sm rounded-xl p-3 border border-slate-200 dark:border-slate-800/0">
                <p className="text-[10px] text-slate-500 uppercase font-bold">{valueLabel}</p>
                <p className="text-lg font-black text-emerald-500 dark:text-emerald-400">{fmt(selected.value, currency)}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 shadow-sm rounded-xl p-3 border border-slate-200 dark:border-slate-800/0">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Share</p>
                <p className="text-lg font-black text-blue-500 dark:text-blue-400">{selected.percentage}%</p>
              </div>
              {selected.qty !== undefined && (
                <div className="bg-white dark:bg-slate-900 shadow-sm rounded-xl p-3 border border-slate-200 dark:border-slate-800/0">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Qty Sold</p>
                  <p className="text-lg font-black text-amber-500 dark:text-amber-400">{selected.qty}</p>
                </div>
              )}
              {selected.profit !== undefined && selected.profit > 0 && (
                <div className="bg-white dark:bg-slate-900 shadow-sm rounded-xl p-3 border border-slate-200 dark:border-slate-800/0">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Profit</p>
                  <p className="text-lg font-black text-violet-500 dark:text-violet-400">{fmt(selected.profit, true)}</p>
                </div>
              )}
            </div>
            {/* Bar showing share of total */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Share of total {valueLabel.toLowerCase()}</span>
                <span>{selected.percentage}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${selected.percentage}%`, background: PALETTE[(selectedIndex ?? 0) % PALETTE.length] }} />
              </div>
            </div>
          </div>
        ) : (
          /* Ranked list */
          items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setSelected(item); setSelectedIndex(i); }}
              className={cn(
                'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left hover:bg-slate-50 dark:hover:bg-slate-800',
                selectedIndex === i && 'bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-600'
              )}
            >
              <span className="text-xs text-slate-400 dark:text-slate-600 font-black w-4 text-right flex-shrink-0">#{i + 1}</span>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 truncate">{item.name}</p>
                <p className="text-[10px] text-slate-500">{item.detail ?? ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-slate-900 dark:text-slate-100">{fmt(item.value, currency)}</p>
                <p className="text-[10px] text-slate-500">{item.percentage}%</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
