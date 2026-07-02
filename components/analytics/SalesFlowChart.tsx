'use client';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  data: { name: string, value: number }[];
  title: string;
}

const PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function SalesFlowChart({ data, title }: Props) {
  return (
    <Card className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl rounded-3xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-900 dark:text-slate-100 font-bold text-lg tracking-tight uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {data.length === 0 ? (
           <div className="h-full flex items-center justify-center text-slate-500">No payment data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                }}
                itemStyle={{ fontSize: '14px', fontWeight: 600 }}
                formatter={(val: any) => `₹${Number(val).toLocaleString('en-IN')}`}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
