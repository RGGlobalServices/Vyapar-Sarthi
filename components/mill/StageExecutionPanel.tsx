import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { cn } from '@/lib/utils';
import api, { downloadBlob } from '@/lib/api';
import {
  Loader2,
  CheckCircle2,
  X,
  Clock,
  Download,
  Plus,
  AlertTriangle,
  Layers,
  Scale,
  ShieldCheck,
  Cpu,
  User,
  Trash2,
  Check,
  Info,
} from 'lucide-react';
import DynamicExecutionFields from './DynamicExecutionFields';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

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
  status?: string | null;
  extras?: { name: string; kg: number }[] | null;
};

type Batch = {
  id: string;
  batchNumber: string;
  batchType?: string | null;
  rejectionLotId?: string | null;
  status: 'open' | 'in_progress' | 'closed';
  currentStage: string;
  startedAt: string;
  inputKg: number | null;
  outputKg: number | null;
  wastageKg: number | null;
  stages: Stage[];
  rawLot?: {
    id: string;
    lotNumber?: string | null;
    availableKg?: number | null;
    remainingQuantity?: number | null;
    product?: { name: string } | null;
  } | null;
  outputProduct?: { id: string; name: string } | null;
};

type ProductOption = { id: string; name: string; millCategory?: string | null; baseUnit?: string | null };

type Props = {
  batch: Batch;
  stageId: string;
  products: ProductOption[];
  onStageUpdated: () => void;
};

export default function StageExecutionPanel({ batch, stageId, products, onStageUpdated }: Props) {
  const t = useTranslations('Mill');
  const stage = batch.stages.find((s) => s.id === stageId);

  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showStageInfo, setShowStageInfo] = useState(false);

  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Modals for adding Input & Output
  const [showAddInputModal, setShowAddInputModal] = useState(false);
  const [showAddOutputModal, setShowAddOutputModal] = useState(false);

  // Form State
  const [form, setForm] = useState({
    inputKg: '',
    outputKg: '',
    wastageKg: '',
    operatorName: '',
    machineId: '',
    notes: '',
  });

  // New Input Form State
  const [newInputForm, setNewInputForm] = useState({
    inputType: 'RAW_MATERIAL',
    productId: '',
    sourceLotId: '',
    wipLotId: '',
    rejectionLotId: '',
    quantity: '',
    unit: 'kg',
    notes: '',
  });

  // New Output Form State
  const [newOutputForm, setNewOutputForm] = useState({
    outputType: 'FINISHED_GOOD',
    productId: '',
    quantity: '',
    unit: 'kg',
    notes: '',
  });

  // SWR Fetches
  const { data: rawInputs, mutate: mutateInputs } = useSWR<any[]>(
    stage ? `/mill/batches/${batch.id}/stages/${stage.id}/inputs` : null,
    fetcher
  );
  const inputs: any[] = Array.isArray(rawInputs) ? rawInputs : [];

  const { data: rawOutputs, mutate: mutateOutputs } = useSWR<any[]>(
    stage ? `/mill/batches/${batch.id}/stages/${stage.id}/outputs` : null,
    fetcher
  );
  const outputs: any[] = Array.isArray(rawOutputs) ? rawOutputs : [];

  const { data: rawQuality, mutate: mutateQuality } = useSWR<any[]>(
    stage ? `/mill/batches/${batch.id}/stages/${stage.id}/quality` : null,
    fetcher
  );
  const quality: any[] = Array.isArray(rawQuality) ? rawQuality : [];

  const { data: reportSummary, mutate: mutateReport } = useSWR<any>(
    stage ? `/mill/batches/${batch.id}/stages/${stage.id}/report?format=json` : null,
    fetcher
  );

  const { data: machinesData } = useSWR<any[]>('/mill/machines', fetcher);
  const machines: any[] = Array.isArray(machinesData) ? machinesData : [];

  const { data: rawLotsData } = useSWR<any[]>('/mill/raw-lots', fetcher);
  const rawLots: any[] = Array.isArray(rawLotsData) ? rawLotsData : [];

  const { data: wipLotsRes } = useSWR<any>('/mill/wip', fetcher);
  const { data: rejectionsRes } = useSWR<any>('/mill/rejections', fetcher);

  const wipLots = useMemo(() => wipLotsRes?.items || (Array.isArray(wipLotsRes) ? wipLotsRes : []), [wipLotsRes]);
  const rejectionLots = useMemo(() => rejectionsRes?.items || (Array.isArray(rejectionsRes) ? rejectionsRes : []), [rejectionsRes]);

  const { mutate: globalMutate } = useSWRConfig();

  const refreshAll = () => {
    mutateInputs();
    mutateOutputs();
    mutateQuality();
    mutateReport();
    globalMutate(
      (key: any) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/mill/batches'),
      undefined,
      { revalidate: true }
    );
  };

  useEffect(() => {
    if (!stage) return;
    setForm({
      inputKg: stage.inputKg?.toString() ?? '',
      outputKg: stage.outputKg?.toString() ?? '',
      wastageKg: stage.wastageKg?.toString() ?? '',
      operatorName: stage.operatorName ?? '',
      machineId: '',
      notes: stage.notes ?? '',
    });
  }, [stage]);

  if (!stage) return null;

  const isCompleted = Boolean(stage.completedAt);

  // Calculate Real-time Mass Balance Metrics
  const calculatedMetrics = useMemo(() => {
    const totalInput = inputs.reduce((acc, item) => acc + (Number(item.actualQuantity) || 0), 0) || Number(form.inputKg) || 0;
    const totalOutput = outputs.reduce((acc, item) => acc + (Number(item.actualQuantity) || 0), 0) || Number(form.outputKg) || 0;
    const wastage = Number(form.wastageKg) || 0;

    const usableOutputs = outputs
      .filter((o) => ['FINISHED_GOOD', 'WIP', 'FINISHED'].includes(String(o.outputType).toUpperCase()))
      .reduce((acc, item) => acc + (Number(item.actualQuantity) || 0), 0) || totalOutput;

    const unaccounted = Math.max(0, totalInput - totalOutput - wastage);
    const yieldPct = totalInput > 0 ? ((usableOutputs / totalInput) * 100).toFixed(1) : '0';
    const recoveryPct = totalInput > 0 ? (((totalOutput + wastage) / totalInput) * 100).toFixed(1) : '0';

    let balanceStatus = 'PASS';
    if (totalInput > 0 && Math.abs(totalInput - (totalOutput + wastage)) > 0.01) {
      balanceStatus = Math.abs(totalInput - (totalOutput + wastage)) <= totalInput * 0.05 ? 'WARNING' : 'FAIL';
    }

    return {
      totalInput,
      totalOutput,
      wastage,
      unaccounted,
      yieldPct,
      recoveryPct,
      balanceStatus,
    };
  }, [inputs, outputs, form.inputKg, form.outputKg, form.wastageKg]);

  // Handle Stage Start
  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      await api.post(`/mill/batches/${batch.id}/stages/${stage.id}/start`, {});
      onStageUpdated();
      refreshAll();
    } catch (err: any) {
      setError(err?.response?.data?.error || t('failedToStartStage'));
    } finally {
      setStarting(false);
    }
  };

  // Save Stage (Without completing)
  const handleSaveStage = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      // 1. Update basic stage fields
      const payload = {
        inputKg: Number(form.inputKg) || calculatedMetrics.totalInput || null,
        outputKg: Number(form.outputKg) || calculatedMetrics.totalOutput || null,
        wastageKg: Number(form.wastageKg) || null,
        operatorName: form.operatorName.trim() || null,
        notes: form.notes.trim() || null,
      };
      await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}`, payload);

      onStageUpdated();
      refreshAll();
      setSuccessMsg('Stage execution details saved successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || t('failedToUpdateStage'));
    } finally {
      setSaving(false);
    }
  };

  // Mark as Completed Workflow
  const handleCompleteStage = async () => {
    setCompleting(true);
    setError('');
    setSuccessMsg('');

    try {
      // First save current values and mark legacy stage as completed
      const patchPayload = {
        completed: true,
        inputKg: Number(form.inputKg) || calculatedMetrics.totalInput || null,
        outputKg: Number(form.outputKg) || calculatedMetrics.totalOutput || null,
        wastageKg: Number(form.wastageKg) || null,
        operatorName: form.operatorName.trim() || null,
        notes: form.notes.trim() || null,
      };
      await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}`, patchPayload);

      // Attempt snapshot complete endpoint if active
      try {
        await api.post(`/mill/batches/${batch.id}/stages/${stage.id}/complete`, {});
      } catch (completeErr: any) {
        console.warn('Snapshot completion endpoint fallback used:', completeErr);
      }

      onStageUpdated();
      refreshAll();
      setSuccessMsg('🎉 Stage marked as COMPLETED successfully!');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || t('failedToCompleteStage'));
    } finally {
      setCompleting(false);
    }
  };

  // Download PDF Report — generated client-side from already-loaded reportSummary
  const handleDownloadReportPdf = async () => {
    setDownloadingPdf(true);
    setError('');
    try {
      const data = reportSummary;
      if (!data) throw new Error('Report data not loaded yet. Please wait a moment and try again.');

      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new (jsPDF as any)({ orientation: 'portrait' });

      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;

      // Header
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text('Stage Execution Report', 105, 18, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`${data.shop?.name || ''}`, 105, 25, { align: 'center' });
      doc.text(`Date: ${dateStr}`, 105, 31, { align: 'center' });

      // Batch info
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('BATCH DETAILS', 14, 42);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const b = data.batch || {};
      const s = data.stage || {};
      doc.text(`Batch: ${b.batchNumber || '-'}   Stage: ${s.stageName || '-'}   Status: ${s.status || '-'}`, 14, 48);
      doc.text(`Product: ${b.productName || '-'}   Workflow: ${b.workflowName || '-'}   Started: ${s.startedAt ? new Date(s.startedAt).toLocaleDateString('en-IN') : '-'}`, 14, 54);
      if (s.operatorName) doc.text(`Operator: ${s.operatorName}   Machine: ${s.machineName || '-'}   Duration: ${s.durationMinutes ? s.durationMinutes + ' min' : '-'}`, 14, 60);

      let y = 62;

      // Mass Balance
      if (data.balance) {
        const mb = data.balance;
        const an = data.analytics || {};
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('MASS BALANCE & YIELD', 14, y); y += 6;
        (autoTable as any)(doc, {
          startY: y,
          head: [['Total Input', 'Total Output', 'Loss/Waste', 'Difference', 'Yield %', 'Recovery %', 'Status']],
          body: [[
            `${mb.totalInputKg ?? 0} kg`, `${mb.totalOutputKg ?? 0} kg`,
            `${mb.wastageKg ?? 0} kg`, `${mb.differenceKg ?? 0} kg`,
            `${an.yieldPercent ?? 0}%`, `${an.recoveryPercent ?? 0}%`,
            mb.balanceStatus || '-',
          ]],
          styles: { fontSize: 8 }, headStyles: { fillColor: [30, 60, 80] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // Inputs
      if (data.inputs?.length) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('INPUTS', 14, y); y += 4;
        (autoTable as any)(doc, {
          startY: y,
          head: [['Source Lot', 'Product', 'Type', 'Qty', 'Unit', 'Notes']],
          body: data.inputs.map((i: any) => [i.sourceLotNumber || '-', i.productName || '-', i.inputType || '-', i.quantity ?? '-', i.unit || 'kg', i.notes || '-']),
          styles: { fontSize: 8 }, headStyles: { fillColor: [60, 90, 50] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // Outputs
      if (data.outputs?.length) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('OUTPUTS', 14, y); y += 4;
        (autoTable as any)(doc, {
          startY: y,
          head: [['Product', 'Type', 'Qty', 'Unit', 'WIP Lot', 'Notes']],
          body: data.outputs.map((o: any) => [o.productName || '-', o.outputType || '-', o.quantity ?? '-', o.unit || 'kg', o.wipLotNumber || '-', o.notes || '-']),
          styles: { fontSize: 8 }, headStyles: { fillColor: [80, 50, 30] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // Quality
      if (data.quality?.length) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('QUALITY TESTS', 14, y); y += 4;
        (autoTable as any)(doc, {
          startY: y,
          head: [['Parameter', 'Actual Value', 'Unit', 'Target', 'Result', 'Critical']],
          body: data.quality.map((q: any) => [q.parameterName || '-', q.actualValue ?? '-', q.unit || '-', q.targetValue || '-', q.result || '-', q.isCritical ? 'Yes' : 'No']),
          styles: { fontSize: 8 }, headStyles: { fillColor: [70, 30, 80] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // Execution Fields
      if (data.executionFields?.length) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('EXECUTION DATA', 14, y); y += 4;
        (autoTable as any)(doc, {
          startY: y,
          head: [['Field', 'Value', 'Unit']],
          body: data.executionFields.map((f: any) => [f.fieldName || '-', f.actualValue ?? '-', f.unit || '-']),
          styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 80] },
          margin: { left: 14, right: 14 },
        });
      }

      doc.save(`Stage_Report_${batch.batchNumber}_${stage.stageName}.pdf`);
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF report');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Add Input Lot Handler
  const handleAddInputLot = async () => {
    setError('');
    try {
      const payload: any = {
        inputType: newInputForm.inputType,
        productId: newInputForm.productId || undefined,
        actualQuantity: Number(newInputForm.quantity),
        actualUnit: newInputForm.unit,
        notes: newInputForm.notes,
      };

      if (newInputForm.inputType === 'RAW_MATERIAL') payload.sourceLotId = newInputForm.sourceLotId;
      if (newInputForm.inputType === 'WIP') payload.wipLotId = newInputForm.wipLotId;
      if (newInputForm.inputType === 'REPROCESS') payload.rejectionLotId = newInputForm.rejectionLotId;

      await api.post(`/mill/batches/${batch.id}/stages/${stage.id}/inputs`, payload);
      setShowAddInputModal(false);
      setNewInputForm({ inputType: 'RAW_MATERIAL', productId: '', sourceLotId: '', wipLotId: '', rejectionLotId: '', quantity: '', unit: 'kg', notes: '' });
      refreshAll();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to add input lot');
    }
  };

  // Add Output Item Handler
  const handleAddOutputItem = async () => {
    setError('');
    try {
      const payload = {
        outputType: newOutputForm.outputType,
        productId: newOutputForm.productId || undefined,
        actualQuantity: Number(newOutputForm.quantity),
        actualUnit: newOutputForm.unit,
        notes: newOutputForm.notes,
      };

      await api.post(`/mill/batches/${batch.id}/stages/${stage.id}/outputs`, payload);
      setShowAddOutputModal(false);
      setNewOutputForm({ outputType: 'FINISHED_GOOD', productId: '', quantity: '', unit: 'kg', notes: '' });
      refreshAll();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to add stage output');
    }
  };

  // Stage info lookup — common mill process stage descriptions with Marathi examples
  const stageInfoMap: Record<string, { desc: string; example: string }> = {
    cleaning: { desc: 'Raw material madhe alelya kachara, dagad, dharatura, dagad, itar bhajipala kadha. He stage la material saaf keli jate.', example: 'Udaharana: 100 kg dhaan madhun 3 kg kacharaa kadha → 97 kg saaf dhaan' },
    husking: { desc: 'Dhanyacha upari sahvara (husk) kadhanyachi process. Husker machine vaparun husk aani brown rice vegale kele jate.', example: 'Udaharana: 97 kg dhaan → 65 kg brown rice + 32 kg husk' },
    milling: { desc: 'Brown rice la machine madhe process karun white rice banvaychi process. Bran layer kadhaychi jate.', example: 'Udaharana: 65 kg brown rice → 55 kg white rice + 10 kg bran' },
    whitening: { desc: 'Rice la white ani shiny karaychi process. Polishing machine vaparun bran kadhali jate.', example: 'Udaharana: 55 kg rice → 52 kg polished rice + 3 kg bran/dust' },
    polishing: { desc: 'Rice la extra shiny finish dyaychi process. Water polishing keli jate jevha glossy look haviasa aasato.', example: 'Udaharana: 52 kg rice → 51 kg polished rice + 1 kg dust' },
    sorting: { desc: 'Rice madhe todlele, chote kinalele (broken) daane vegale karaychi process. Color sorter machine vaparun keli jate.', example: 'Udaharana: 51 kg → 46 kg whole rice + 5 kg broken rice' },
    grading: { desc: 'Rice la size ane quality nusaar vegale group madhe divide karaychi process.', example: 'Udaharana: 46 kg → 30 kg long grain + 16 kg short grain' },
    packaging: { desc: 'Final product la bag/packet madhe bharaychi process. Sealing ani labeling pun ya stage la hoito.', example: 'Udaharana: 46 kg rice → 4 bags of 10 kg + 1 bag of 6 kg' },
    drying: { desc: 'Material madhe jastacha ola/moisture kadhaychi process. Sun drying kiva machine drying vaapartaat.', example: 'Udaharana: 100 kg ola dhaan (15% moisture) → 90 kg dry dhaan (12% moisture)' },
    boiling: { desc: 'Parboiled rice/ukda tandul banvaychi process. Dhaan paanati ubhvun nanttar valavata kele jate.', example: 'Udaharana: 100 kg dhaan → steam process → 98 kg parboiled dhaan' },
    tempering: { desc: 'Boiling nanttar dhaan vaaluvatat thevaychi process. Bran layer crack honar naahi ashi kaijgi ghyaychi process.', example: 'Udaharana: Boiled dhaan 8-12 taas rest → even moisture distribution' },
    weighing: { desc: 'Material kiva product weigh karaychi process. Record keeping ani quality check sathi vaapartat.', example: 'Udaharana: Each lot weighing → 100 kg input record + 95 kg output record' },
  };

  const getStageInfo = (name: string) => {
    const key = name.toLowerCase().replace(/[\s_-]/g, '');
    for (const [k, v] of Object.entries(stageInfoMap)) {
      if (key.includes(k) || k.includes(key)) return v;
    }
    return {
      desc: `"${name}" stage la material process keli jate. Ya stage la input material ata aani processed output record kara.`,
      example: 'Input Qty nondava → process kara → Output Qty ani Wastage nondava.',
    };
  };

  const stageInfo = stage ? getStageInfo(stage.stageName) : null;

  return (
    <div className="space-y-4 font-sans text-slate-800 dark:text-slate-100">
      {/* --- A. STAGE HEADER BAR --- */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-extrabold text-lg border border-indigo-400/30">
            #{stage.sequence.toString().padStart(2, '0')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">{stage.stageName}</h2>
              <button
                type="button"
                onClick={() => setShowStageInfo((v) => !v)}
                title="Stage baddal mahiti"
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full border transition-colors',
                  showStageInfo
                    ? 'bg-indigo-400 border-indigo-300 text-white'
                    : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300 hover:bg-indigo-400/30'
                )}
              >
                <Info size={13} />
              </button>
              <span
                className={cn(
                  'px-2.5 py-0.5 text-[11px] font-extrabold rounded-full uppercase tracking-wider',
                  isCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                )}
              >
                {isCompleted ? 'COMPLETED' : 'IN PROGRESS'}
              </span>
              {batch.batchType === 'REPROCESSING' && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-500/30 text-purple-200 border border-purple-400/30 uppercase">
                  REPROCESSING
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-1">
              <span>
                Batch: <strong className="text-white">{batch.batchNumber}</strong>
              </span>
              <span>
                Product: <strong className="text-white">{batch.outputProduct?.name || 'Raw Product'}</strong>
              </span>
              <span>
                Input Total: <strong className="text-indigo-300">{calculatedMetrics.totalInput} kg</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stage.status === 'PENDING' && (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition shadow"
            >
              {starting ? <Loader2 className="animate-spin" size={16} /> : <Clock size={16} />}
              Start Stage
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadReportPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 border border-slate-700 shadow-sm transition"
          >
            {downloadingPdf ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />} Download Stage Report
          </button>
        </div>
      </div>

      {/* Stage Info Popover */}
      {showStageInfo && stageInfo && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4 flex gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
            <Info size={15} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-1">
              {stage.stageName} — Ya Stage la Kay Hote?
            </p>
            <p className="text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed">{stageInfo.desc}</p>
            <div className="mt-2 rounded-lg bg-white/60 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-500/20 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-0.5">Udaharana (Example)</p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300">{stageInfo.example}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStageInfo(false)}
            className="flex-shrink-0 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Alert Messages */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-sm border border-red-200 dark:border-red-800 flex items-center gap-2" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-sm border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* --- B. REAL-TIME MASS BALANCE & ANALYTICS HEADER CARD --- */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-3 border-b pb-2">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <Scale className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Real-Time Mass Balance & Yield Analytics</h3>
          </div>
          <span
            className={cn(
              'px-2.5 py-0.5 text-xs font-extrabold rounded-full uppercase',
              calculatedMetrics.balanceStatus === 'PASS'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                : calculatedMetrics.balanceStatus === 'WARNING'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300'
            )}
          >
            Balance: {calculatedMetrics.balanceStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Input</span>
            <span className="font-bold text-base text-slate-800 dark:text-slate-100">{calculatedMetrics.totalInput} Kg</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Output</span>
            <span className="font-bold text-base text-indigo-600 dark:text-indigo-400">{calculatedMetrics.totalOutput} Kg</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Loss / Waste</span>
            <span className="font-bold text-base text-amber-600 dark:text-amber-400">{calculatedMetrics.wastage} Kg</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Unaccounted</span>
            <span className="font-bold text-base text-slate-700 dark:text-slate-300">{calculatedMetrics.unaccounted} Kg</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Yield %</span>
            <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">{calculatedMetrics.yieldPct}%</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Recovery %</span>
            <span className="font-bold text-base text-blue-600 dark:text-blue-400">{calculatedMetrics.recoveryPct}%</span>
          </div>
        </div>
      </div>

      {/* --- C. INPUT MATERIAL SECTION (MULTI-LOT SUPPORT) --- */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Input Material (Source Lots)
            </h3>
          </div>
          {!isCompleted && (
            <button
              type="button"
              onClick={() => setShowAddInputModal(true)}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
            >
              <Plus size={14} /> Add Source Lot
            </button>
          )}
        </div>

        {inputs.length === 0 && !batch.rawLot ? (
          <div className="text-center py-4 text-xs text-slate-400 italic">No source material lots assigned to this stage yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 border-b">
                  <th className="p-2 text-left">Source Type</th>
                  <th className="p-2 text-left">Lot Number</th>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-right">Available Qty</th>
                  <th className="p-2 text-right">Assigned Qty</th>
                  <th className="p-2 text-center">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {batch.rawLot && (
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-2 font-semibold text-slate-600 dark:text-slate-400">RAW_MATERIAL</td>
                    <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{batch.rawLot.lotNumber || 'Lot'}</td>
                    <td className="p-2 text-slate-600 dark:text-slate-300">{batch.rawLot.product?.name || 'Raw Grain'}</td>
                    <td className="p-2 text-right font-medium">{batch.rawLot.availableKg ?? batch.rawLot.remainingQuantity ?? '—'}</td>
                    <td className="p-2 text-right font-bold text-indigo-600">{form.inputKg || calculatedMetrics.totalInput}</td>
                    <td className="p-2 text-center font-mono">kg</td>
                  </tr>
                )}

                {inputs.map((inp) => {
                  const lotNum = inp.sourceLot?.lotNumber || inp.wipLot?.lotNumber || inp.rejectionLot?.lotNumber || 'LOT-INPUT';
                  const prodName = inp.product?.name || 'Input Material';
                  const availQty = inp.sourceLot?.remainingQuantity ?? inp.wipLot?.availableQuantity ?? inp.rejectionLot?.availableQuantity ?? '—';

                  return (
                    <tr key={inp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-2 font-semibold text-slate-600 dark:text-slate-400">{inp.inputType || 'RAW_MATERIAL'}</td>
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{lotNum}</td>
                      <td className="p-2 text-slate-600 dark:text-slate-300">{prodName}</td>
                      <td className="p-2 text-right font-medium">{availQty}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          disabled={isCompleted}
                          value={inp.actualQuantity ?? ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}/inputs/${inp.id}`, { actualQuantity: val ? Number(val) : null });
                            refreshAll();
                          }}
                          className="w-24 text-right rounded border px-2 py-0.5 font-bold text-indigo-600 dark:bg-slate-800"
                        />
                      </td>
                      <td className="p-2 text-center font-mono">{inp.actualUnit || inp.unit || 'kg'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- D. STAGE OUTPUTS ENTRY SECTION --- */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Stage Output Quantities
            </h3>
          </div>
          {!isCompleted && (
            <button
              type="button"
              onClick={() => setShowAddOutputModal(true)}
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <Plus size={14} /> Add Output Row
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {outputs.map((out) => (
            <div key={out.id} className="p-3 rounded-lg border bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded uppercase',
                    out.outputType === 'FINISHED_GOOD'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : out.outputType === 'WIP'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      : out.outputType === 'BY_PRODUCT'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : out.outputType === 'REJECTION'
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                  )}
                >
                  {out.outputType}
                </span>
                <span className="text-xs font-semibold text-slate-500">{out.product?.name || 'Stage Output'}</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  disabled={isCompleted}
                  placeholder="0.00"
                  value={out.actualQuantity ?? ''}
                  onChange={async (e) => {
                    const val = e.target.value;
                    await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}/outputs/${out.id}`, { actualQuantity: val ? Number(val) : null });
                    refreshAll();
                  }}
                  className="flex-1 rounded border px-2 py-1 font-bold text-sm text-slate-800 dark:bg-slate-800"
                />
                <span className="text-xs font-mono text-slate-500 uppercase">{out.actualUnit || out.unit || 'kg'}</span>
              </div>
            </div>
          ))}

          {/* Quick Fallback Output Inputs if outputs array is empty */}
          {outputs.length === 0 && (
            <>
              <div className="p-3 rounded-lg border bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">Main Output Qty (Kg)</label>
                <input
                  type="number"
                  min="0"
                  disabled={isCompleted}
                  value={form.outputKg}
                  onChange={(e) => setForm({ ...form, outputKg: e.target.value })}
                  className="w-full rounded border px-2 py-1 text-sm font-bold dark:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-lg border bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
                <label className="block text-xs font-bold text-amber-600 dark:text-amber-400">Waste / Loss Qty (Kg)</label>
                <input
                  type="number"
                  min="0"
                  disabled={isCompleted}
                  value={form.wastageKg}
                  onChange={(e) => setForm({ ...form, wastageKg: e.target.value })}
                  className="w-full rounded border px-2 py-1 text-sm font-bold dark:bg-slate-800"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- E. QUALITY PARAMETERS SECTION --- */}
      {quality.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Quality Checks & Control
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 border-b">
                  <th className="p-2 text-left">Parameter</th>
                  <th className="p-2 text-center">Target</th>
                  <th className="p-2 text-center">Min Allowed</th>
                  <th className="p-2 text-center">Max Allowed</th>
                  <th className="p-2 text-center">Actual Value</th>
                  <th className="p-2 text-center">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {quality.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-2 font-bold text-slate-800 dark:text-slate-200">
                      {q.parameterName}
                      {q.isRequired && <span className="text-red-500 font-bold ml-1">*</span>}
                    </td>
                    <td className="p-2 text-center font-medium">{q.targetValue ?? '—'}</td>
                    <td className="p-2 text-center font-medium text-slate-500">{q.minValue ?? '—'}</td>
                    <td className="p-2 text-center font-medium text-slate-500">{q.maxValue ?? '—'}</td>
                    <td className="p-2 text-center">
                      <input
                        type="text"
                        disabled={isCompleted}
                        value={q.actualValue ?? ''}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await api.patch(`/mill/batches/${batch.id}/stages/${stage.id}/quality/${q.id}`, { actualValue: val });
                          refreshAll();
                        }}
                        className="w-28 text-center rounded border px-2 py-0.5 text-sm font-bold dark:bg-slate-800"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-extrabold uppercase',
                          q.result === 'PASS'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : q.result === 'WARNING'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : q.result === 'HOLD' || q.result === 'REJECT'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                        )}
                      >
                        {q.result || 'PASS'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- F. DYNAMIC EXECUTION FIELDS SECTION --- */}
      <DynamicExecutionFields
        batchId={batch.id}
        stageId={stage.id}
        isReadOnly={isCompleted}
        onRefreshBatch={refreshAll}
        products={products}
        batch={batch}
      />

      {/* --- G. OPERATOR & STAGE NOTES SECTION --- */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
            <User className="h-3.5 w-3.5 text-indigo-600" /> Operator Name
          </label>
          <input
            type="text"
            disabled={isCompleted}
            placeholder="Select or enter operator name"
            value={form.operatorName}
            onChange={(e) => setForm({ ...form, operatorName: e.target.value })}
            className="w-full rounded-lg border px-3 py-1.5 text-sm dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
            <Cpu className="h-3.5 w-3.5 text-indigo-600" /> Machine Assigned
          </label>
          <select
            disabled={isCompleted}
            value={form.machineId}
            onChange={(e) => setForm({ ...form, machineId: e.target.value })}
            className="w-full rounded-lg border px-3 py-1.5 text-sm dark:bg-slate-800"
          >
            <option value="">-- Select Machine --</option>
            {machines.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.machineType ? `· ${m.machineType}` : ''} {m.status === 'under_maintenance' ? '⚠️ [In Service]' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Stage Execution Notes</label>
          <textarea
            rows={2}
            disabled={isCompleted}
            placeholder="Record any operational observations, quality flags, or notes..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-lg border px-3 py-1.5 text-sm dark:bg-slate-800"
          />
        </div>
      </div>

      {/* --- H. ACTIONS FOOTER BAR --- */}
      {!isCompleted && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleSaveStage}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50 shadow transition"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Save Stage
          </button>

          <button
            type="button"
            onClick={handleCompleteStage}
            disabled={completing}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 shadow transition"
          >
            {completing ? <Loader2 className="animate-spin" size={16} /> : <Clock size={16} />} Mark as Completed →
          </button>
        </div>
      )}

      {/* --- MODAL: ADD INPUT LOT --- */}
      {showAddInputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-md border shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Add Source Input Lot</h3>
              <button type="button" onClick={() => setShowAddInputModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Source Material Type</label>
                <select
                  value={newInputForm.inputType}
                  onChange={(e) => setNewInputForm({ ...newInputForm, inputType: e.target.value })}
                  className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                >
                  <option value="RAW_MATERIAL">Raw Material Lot</option>
                  <option value="WIP">WIP Lot</option>
                  <option value="REPROCESS">Rejection Lot (Reprocessing)</option>
                </select>
              </div>

              {newInputForm.inputType === 'RAW_MATERIAL' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Select Raw Material Lot</label>
                  <select
                    value={newInputForm.sourceLotId}
                    onChange={(e) => {
                      const lotId = e.target.value;
                      const lot = rawLots.find((l: any) => l.id === lotId);
                      setNewInputForm({
                        ...newInputForm,
                        sourceLotId: lotId,
                        productId: lot?.productId || '',
                        quantity: lot?.remainingQuantity?.toString() || lot?.quantity?.toString() || '',
                      });
                    }}
                    className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                  >
                    <option value="">-- Select Raw Lot --</option>
                    {rawLots.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.lotNumber || 'Lot'} – {l.product?.name || ''} ({l.remainingQuantity ?? l.quantity} kg avail)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newInputForm.inputType === 'WIP' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Select WIP Lot</label>
                  <select
                    value={newInputForm.wipLotId}
                    onChange={(e) => {
                      const lotId = e.target.value;
                      const wip = wipLots.find((w: any) => w.id === lotId);
                      setNewInputForm({
                        ...newInputForm,
                        wipLotId: lotId,
                        productId: wip?.productId || '',
                        quantity: wip?.availableQuantity?.toString() || '',
                      });
                    }}
                    className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                  >
                    <option value="">-- Select WIP Lot --</option>
                    {wipLots.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.lotNumber} – {w.product?.name || ''} ({w.availableQuantity} kg avail)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newInputForm.inputType === 'REPROCESS' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Select Rejection Lot</label>
                  <select
                    value={newInputForm.rejectionLotId}
                    onChange={(e) => {
                      const lotId = e.target.value;
                      const rj = rejectionLots.find((r: any) => r.id === lotId);
                      setNewInputForm({
                        ...newInputForm,
                        rejectionLotId: lotId,
                        productId: rj?.productId || '',
                        quantity: rj?.availableQuantity?.toString() || '',
                      });
                    }}
                    className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                  >
                    <option value="">-- Select Rejection Lot --</option>
                    {rejectionLots.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.lotNumber} – {r.product?.name || ''} ({r.availableQuantity} kg avail)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Assigned Quantity (Kg)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter quantity"
                  value={newInputForm.quantity}
                  onChange={(e) => setNewInputForm({ ...newInputForm, quantity: e.target.value })}
                  className="w-full rounded border p-2 font-bold dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowAddInputModal(false)}
                className="rounded border px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddInputLot}
                disabled={!newInputForm.quantity || Number(newInputForm.quantity) <= 0}
                className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Add Input Lot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD OUTPUT ROW --- */}
      {showAddOutputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-md border shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Add Stage Output Row</h3>
              <button type="button" onClick={() => setShowAddOutputModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Output Type</label>
                <select
                  value={newOutputForm.outputType}
                  onChange={(e) => setNewOutputForm({ ...newOutputForm, outputType: e.target.value })}
                  className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                >
                  <option value="FINISHED_GOOD">Finished Good (FG)</option>
                  <option value="WIP">Work In Progress (WIP)</option>
                  <option value="BY_PRODUCT">By-Product</option>
                  <option value="REJECTION">Rejection</option>
                  <option value="WASTE">Waste / Loss</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Product Output</label>
                <select
                  value={newOutputForm.productId}
                  onChange={(e) => setNewOutputForm({ ...newOutputForm, productId: e.target.value })}
                  className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                >
                  <option value="">-- Select Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Actual Output Quantity (Kg)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter quantity"
                  value={newOutputForm.quantity}
                  onChange={(e) => setNewOutputForm({ ...newOutputForm, quantity: e.target.value })}
                  className="w-full rounded border p-2 font-bold dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Notes / Rejection Reason</label>
                <input
                  type="text"
                  placeholder="Optional notes or rejection reason"
                  value={newOutputForm.notes}
                  onChange={(e) => setNewOutputForm({ ...newOutputForm, notes: e.target.value })}
                  className="w-full rounded border p-2 font-medium dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowAddOutputModal(false)}
                className="rounded border px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddOutputItem}
                disabled={!newOutputForm.quantity || Number(newOutputForm.quantity) <= 0}
                className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Add Output Row
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
