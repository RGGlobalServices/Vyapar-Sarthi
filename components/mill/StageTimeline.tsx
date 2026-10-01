import React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { stageLabel } from '@/lib/millLabels';
import { Clock } from 'lucide-react';

type Stage = {
  id: string;
  stageName: string;
  sequence: number;
  inputKg: number | null;
  outputKg: number | null;
  wastageKg: number | null;
  operatorName: string | null;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  extras?: { name: string; kg: number }[] | null;
};

type Props = {
  stages: Stage[];
  currentStageId: string;
  onSelectStage: (stageId: string) => void;
};

export default function StageTimeline({ stages, currentStageId, onSelectStage }: Props) {
  const t = useTranslations('Mill');
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('stageTimeline')}</h3>
      <ul className="space-y-1">
        {stages.map((stage) => {
          const isCurrent = stage.stageName === currentStageId;
          const isDone = !!stage.completedAt;
          const status = isDone ? 'COMPLETED' : isCurrent ? 'IN_PROGRESS' : 'PENDING';
          return (
            <li
              key={stage.id}
              className={cn(
                'flex items-center justify-between p-2 rounded cursor-pointer',
                isCurrent ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-white dark:bg-slate-900',
                isDone ? 'border-emerald-300 dark:border-emerald-500/40' : 'border-slate-200 dark:border-slate-800'
              )}
              onClick={() => onSelectStage(stage.id)}
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{stageLabel(t, stage.stageName)}</span>
              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {status}
              </span>
              {isDone && (
                <Clock size={12} className="text-slate-400" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
