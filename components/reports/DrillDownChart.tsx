'use client';

import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

interface DrillDownChartProps {
  type?: 'line' | 'bar' | 'area' | 'pie';
  data: any[];
  xKey: string;
  yKeys: { key: string; label: string; color?: string }[];
  title?: string;
  height?: number;
  formatY?: (value: number) => string;
  onDrillDown?: (item: any) => void;
  currency?: boolean;
}

const defaultFormatY = (v: number) => `₹${v.toLocaleString('en-IN')}`;
const formatCount = (v: number) => v.toLocaleString('en-IN');

export default function DrillDownChart({
  type = 'bar',
  data,
  xKey,
  yKeys,
  title,
  height = 320,
  formatY,
  onDrillDown,
  currency = true,
}: DrillDownChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const formatter = formatY || (currency ? defaultFormatY : formatCount);

  const handleClick = (item: any, index: number) => {
    setActiveIndex(index);
    onDrillDown?.(item);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl border border-slate-700 min-w-[140px]">
        <p className="font-bold text-slate-300 mb-2">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span style={{ color: p.color }} className="font-semibold">{p.name}</span>
            <span className="font-black">{formatter(p.value)}</span>
          </div>
        ))}
        {onDrillDown && <p className="text-slate-500 mt-2 text-[10px]">Click to drill down →</p>}
      </div>
    );
  };

  const commonAxisProps = {
    tick: { fontSize: 11, fill: '#94a3b8' },
    axisLine: { stroke: '#334155' },
    tickLine: false,
  };

  if (type === 'pie') {
    return (
      <div className="w-full" style={{ height }}>
        {title && <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">{title}</h4>}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey={yKeys[0].key}
              nameKey={xKey}
              paddingAngle={3}
              onClick={handleClick}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={activeIndex === null || activeIndex === i ? 1 : 0.5} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => formatter(Number(v))} />
            <Legend formatter={(value) => <span className="text-xs text-slate-600 dark:text-slate-400">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const ChartComponent = type === 'line' ? LineChart : type === 'area' ? AreaChart : BarChart;

  return (
    <div className="w-full" style={{ height }}>
      {title && <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">{title}</h4>}
      <ResponsiveContainer width="100%" height="100%">
        <ChartComponent data={data} onClick={(e: any) => e?.activePayload && handleClick(e.activePayload[0]?.payload, e.activeTooltipIndex)}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis tickFormatter={formatter} {...commonAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(value) => <span className="text-xs text-slate-500 dark:text-slate-400">{value}</span>} />
          {yKeys.map((yk, i) => {
            const color = yk.color || CHART_COLORS[i % CHART_COLORS.length];
            if (type === 'area') {
              return (
                <Area key={yk.key} type="monotone" dataKey={yk.key} name={yk.label} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} dot={{ fill: color, r: 3 }} activeDot={{ r: 5 }} />
              );
            }
            if (type === 'line') {
              return (
                <Line key={yk.key} type="monotone" dataKey={yk.key} name={yk.label} stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 3 }} activeDot={{ r: 5 }} />
              );
            }
            return (
              <Bar key={yk.key} dataKey={yk.key} name={yk.label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
            );
          })}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
