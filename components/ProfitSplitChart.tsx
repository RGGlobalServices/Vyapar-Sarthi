'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IndianRupee } from 'lucide-react';

const COLORS = ['#10B981', '#F59E0B']; // Emerald for Cash, Amber for Udhar

interface Props {
  cashProfit: number;
  udharProfit: number;
}

export default function ProfitSplitChart({ cashProfit, udharProfit }: Props) {
  const data = [
    { name: 'Cash Profit', value: cashProfit },
    { name: 'Udhar Profit (Pending)', value: udharProfit }
  ];

  if (data.every(d => d.value <= 0)) return null;

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-6">
      <CardHeader className="bg-slate-50 dark:bg-slate-800/20 py-4 border-b border-slate-200 dark:border-slate-800/50">
        <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
          <IndianRupee size={16} className="text-emerald-500" /> Cash vs Udhar Profit
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[260px] flex items-center justify-center gap-6 p-4">
        <ResponsiveContainer width="55%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`₹${Math.round(value).toLocaleString('en-IN')}`, 'Profit']}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-4">
          {data.map((d, i) => (
            <div key={d.name} className="flex flex-col text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-slate-600 dark:text-slate-300 font-medium">{d.name}</span>
              </div>
              <span className="text-slate-900 dark:text-white font-black text-lg pl-4.5">
                ₹{Math.round(d.value).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
