'use client';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { AlertTriangle, Calendar, CheckCircle, Clock } from 'lucide-react';

interface ExpiryDateFieldProps {
  value: string;            // YYYY-MM-DD
  onChange: (val: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
}

export interface ExpiryInfo {
  daysLeft: number;
  status: 'safe' | 'soon' | 'urgent' | 'expired';
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

type ExpiryT = ReturnType<typeof useTranslations<'Products'>>;

export function getExpiryInfo(dateStr: string | null | undefined, t?: ExpiryT): ExpiryInfo | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  if (isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return {
    daysLeft, status: 'expired',
    label: t ? t('expiredDaysAgo', { days: Math.abs(daysLeft) }) : `Expired ${Math.abs(daysLeft)} days ago`,
    color: 'text-red-400', bgColor: 'bg-red-500/15 border-red-500/30',
    icon: <AlertTriangle size={12} className="text-red-400" />,
  };
  if (daysLeft <= 30) return {
    daysLeft, status: 'urgent',
    label: t ? t('expiresInDays', { days: daysLeft }) : `Expires in ${daysLeft} days`,
    color: 'text-orange-400', bgColor: 'bg-orange-500/15 border-orange-500/30',
    icon: <AlertTriangle size={12} className="text-orange-400" />,
  };
  if (daysLeft <= 180) return {
    daysLeft, status: 'soon',
    label: t ? t('expiresInMonths', { months: Math.round(daysLeft / 30) }) : `Expires in ${Math.round(daysLeft / 30)} months`,
    color: 'text-yellow-400', bgColor: 'bg-yellow-500/15 border-yellow-500/30',
    icon: <Clock size={12} className="text-yellow-400" />,
  };
  return {
    daysLeft, status: 'safe',
    label: t ? t('expiresInMonths', { months: Math.round(daysLeft / 30) }) : `Expires in ${Math.round(daysLeft / 30)} months`,
    color: 'text-emerald-400', bgColor: 'bg-emerald-500/15 border-emerald-500/30',
    icon: <CheckCircle size={12} className="text-emerald-400" />,
  };
}

export default function ExpiryDateField({ value, onChange, required, label, className }: ExpiryDateFieldProps) {
  const t = useTranslations('Products');
  const info = getExpiryInfo(value, t);
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
        <Calendar size={12} className="text-slate-500" />
        {label ?? t('expiryDateLabel')}{required && <span className="text-red-400">*</span>}
      </label>
      <input
        type="date"
        required={required}
        value={value}
        min={today}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent cursor-pointer"
      />
      {info && (
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium',
          info.bgColor, info.color
        )}>
          {info.icon}
          {info.label}
        </div>
      )}
    </div>
  );
}

/** Compact expiry badge for table display */
export function ExpiryBadge({ date }: { date: string | null | undefined }) {
  const t = useTranslations('Products');
  if (!date) return <span className="text-slate-600 text-xs">—</span>;
  const info = getExpiryInfo(date, t);
  if (!info) return <span className="text-slate-400 text-xs">{date}</span>;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
      info.bgColor, info.color
    )}>
      {info.icon}
      {info.status === 'expired' ? t('expiredAllCaps') : info.daysLeft <= 30 ? `${info.daysLeft}d` : date}
    </span>
  );
}
