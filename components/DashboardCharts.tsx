'use client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444'];

interface Props {
  salesData: { date: string; total: number }[];
  categoryDist: { name: string; value: number }[];
  timeRange: string;
  salesLabel: string;
  categoryLabel: string;
}

export default function DashboardCharts({
  salesData,
  categoryDist,
  timeRange,
  salesLabel,
  categoryLabel,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-200 flex items-center justify-between">
            {timeRange === 'weekly'
              ? salesLabel
              : `${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} Sales Performance`}
            <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full uppercase tracking-tighter transition-all">
              {timeRange}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none' }} />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-200">{categoryLabel}</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px] flex items-center justify-center gap-6">
          <ResponsiveContainer width="55%" height="100%">
            <PieChart>
              <Pie
                data={categoryDist}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {categoryDist.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {categoryDist.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-slate-300">{d.name}</span>
                <span className="text-slate-500 text-xs ml-auto">{d.value}</span>
              </div>
            ))}
            {categoryDist.length === 0 && (
              <p className="text-slate-500 text-xs text-center w-full">No products</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
