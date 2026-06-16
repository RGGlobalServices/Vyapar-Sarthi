'use client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  data: any[];
  title: string;
  salesLabel: string;
  profitLabel: string;
}

export default function ReportsChart({ data, title, salesLabel, profitLabel }: Props) {
  return (
    <Card className="lg:col-span-2 bg-slate-900 border-slate-800 shadow-xl">
      <CardHeader>
        <CardTitle className="text-slate-200 font-bold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `₹${val}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#f1f5f9',
              }}
              itemStyle={{ fontSize: '12px' }}
            />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
            <Bar name={salesLabel} dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
            <Bar name={profitLabel} dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
