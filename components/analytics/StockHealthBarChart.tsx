'use client';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  data: any[];
  title: string;
}

export default function StockHealthBarChart({ data, title }: Props) {
  return (
    <Card className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl rounded-3xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-900 dark:text-slate-100 font-bold text-lg tracking-tight uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {data.length === 0 ? (
           <div className="h-full flex items-center justify-center text-slate-500">No stock data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => val.length > 10 ? val.substring(0, 10) + '...' : val}
              />
              <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                }}
                itemStyle={{ fontSize: '13px', fontWeight: 600 }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
              <Bar yAxisId="left" name="Sales Velocity (Qty)" dataKey="salesVelocity" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
              <Line yAxisId="right" type="monotone" name="Current Stock" dataKey="currentStock" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
