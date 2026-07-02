'use client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  data: any[];
  title: string;
  salesLabel: string;
  profitLabel: string;
}

export default function SalesAnalyticsChart({ data, title, salesLabel, profitLabel }: Props) {
  return (
    <Card className="w-full bg-white dark:bg-slate-950 border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-slate-900 dark:text-slate-100 font-bold text-xl tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[450px] px-0 pb-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
              tickMargin={12}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `₹${val}`}
              tickMargin={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                color: '#f8fafc',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                padding: '12px 16px'
              }}
              itemStyle={{ fontSize: '14px', fontWeight: 600, padding: '4px 0' }}
              labelStyle={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}
            />
            <Legend 
              iconType="circle" 
              wrapperStyle={{ paddingTop: '24px', fontSize: '13px' }} 
            />
            <Area 
              type="monotone" 
              name={salesLabel} 
              dataKey="sales" 
              stroke="#10b981" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorSales)" 
              activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
            />
            <Area 
              type="monotone" 
              name={profitLabel} 
              dataKey="profit" 
              stroke="#3b82f6" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorProfit)" 
              activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
