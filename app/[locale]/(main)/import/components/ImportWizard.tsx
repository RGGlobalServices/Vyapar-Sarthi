'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileSpreadsheet, FileImage, FileText, CheckCircle, Loader2, AlertCircle, ArrowLeft, Trash2, Camera, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { useUdharStore } from '@/lib/store';
import { getImportTemplate, applyTemplate } from '@/lib/importTemplates';

type ImportType = 'product' | 'purchase' | 'stock' | 'suppliers' | 'customers' | 'sales' | 'ledger';
type Step = 'upload' | 'preview' | 'importing' | 'done';
type RowMatch = { status: 'new' | 'existing'; existingName?: string };
type RowDecision = 'update' | 'skip' | undefined;

export default function ImportWizard({ importType, onBack }: { importType: ImportType; onBack: () => void }) {
  const t = useTranslations('Import');
  const { profile } = useBusinessStore();
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState('Analyzing document...');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [selectedGodown, setSelectedGodown] = useState<string>('');
  // Conflict resolution: which incoming rows match existing records, the global
  // "when a record exists" policy, and any per-row override.
  const [rowMatches, setRowMatches] = useState<RowMatch[]>([]);
  const [rowDecisions, setRowDecisions] = useState<RowDecision[]>([]);
  const [existingPolicy, setExistingPolicy] = useState<'update' | 'skip'>('update');
  const [checkingMatches, setCheckingMatches] = useState(false);

  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [bulkEditField, setBulkEditField] = useState<string>('');
  const [bulkEditValue, setBulkEditValue] = useState<string>('');

  useEffect(() => {
    if (['product', 'purchase', 'stock'].includes(importType)) {
      api.get('/godowns').then(res => {
        if (res.data && res.data.length > 0) {
          setGodowns(res.data);
          setSelectedGodown(res.data[0].id);
        }
      }).catch(console.error);
    }
  }, [importType]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared entry point for both spreadsheet and AI-extracted rows: reshape into
  // the canonical template (so missing columns show as blank/fillable), then ask
  // the server which rows already exist.
  const loadRows = async (rawRows: any[], rawHeaders: string[]) => {
    const template = getImportTemplate(importType, profile?.businessType);
    const { rows, headers: displayHeaders } = applyTemplate(rawRows, rawHeaders, template);
    setHeaders(displayHeaders);
    setPreviewData(rows);
    setRowDecisions(new Array(rows.length).fill(undefined));
    setRowMatches([]);
    validateData(rows, displayHeaders);
    setStep('preview');
    setCheckingMatches(true);
    try {
      const res = await api.post('/wholesale-import/check-matches', { importType, data: rows });
      setRowMatches(res.data?.matches || []);
    } catch {
      setRowMatches([]); // non-fatal — just no new/existing badges
    } finally {
      setCheckingMatches(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    processFiles(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      processFiles(selected);
    }
  };

  const processFiles = async (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    try {
      // Split files by type
      const spreadsheetFiles = selectedFiles.filter(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
      const aiFiles = selectedFiles.filter(f => !spreadsheetFiles.includes(f));

      if (spreadsheetFiles.length > 0) {
        // Handle all spreadsheets and all sheets within them
        let allRows: any[] = [];
        let finalHeaders: string[] = [];

        for (const file of spreadsheetFiles) {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            if (jsonData.length > 0) {
              const rawHeaders = jsonData[0] as string[];
              if (finalHeaders.length === 0) finalHeaders = rawHeaders; // Keep headers from first sheet/file
              
              const rows = jsonData.slice(1).map(row => {
                const obj: any = {};
                rawHeaders.forEach((h, i) => {
                  obj[h] = (row as any[])[i];
                });
                return obj;
              }).filter(row => Object.values(row).some(v => v !== undefined && v !== null && v !== ''));
              
              allRows = [...allRows, ...rows];
            }
          }
        }

        if (allRows.length > 0) {
          await loadRows(allRows, finalHeaders);
        }
      }
      
      if (aiFiles.length > 0 && spreadsheetFiles.length === 0) {
        // AI Extraction for multiple images and multi-page PDFs
        const filesToSend: File[] = [];

        for (const file of aiFiles) {
          if (file.type === 'application/pdf') {
            setLoadingText(`Converting PDF ${file.name}...`);
            const pdfjs = await new Promise<any>((resolve, reject) => {
              if ((window as any).pdfjsLib) return resolve((window as any).pdfjsLib);
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
              script.onload = () => {
                (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve((window as any).pdfjsLib);
              };
              script.onerror = reject;
              document.head.appendChild(script);
            });

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            
            // Each page becomes one image, processed as its own AI call on the
            // server (the vision model takes one image per prompt). Cap at 25 so a
            // huge PDF doesn't run for minutes; the server caps total images too.
            const numPages = Math.min(pdf.numPages, 25);
            
            for (let i = 1; i <= numPages; i++) {
              setLoadingText(`Converting PDF ${file.name} (Page ${i} of ${numPages})...`);
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 2.0 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                await page.render({ canvasContext: ctx, viewport }).promise;
                const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9));
                if (blob) {
                  filesToSend.push(new File([blob], `${file.name}-page${i}.jpg`, { type: 'image/jpeg' }));
                }
              }
            }
          } else {
            filesToSend.push(file);
          }
        }

        if (filesToSend.length > 0) {
          setLoadingText('Analyzing documents with Nvidia...');
          const fd = new FormData();
          filesToSend.forEach(f => fd.append('files[]', f));
          fd.append('targetType', importType);
          fd.append('businessType', profile?.businessType || 'general');
          
          try {
            const res = await api.post('/wholesale-import/analyze', fd);
            const data = res.data;
            
            if (data.items && data.items.length > 0) {
              const aiHeaders = Object.keys(data.items[0]);
              await loadRows(data.items, aiHeaders);
            } else {
              setStep('preview');
            }
          } catch (err: any) {
            const errorData = err.response?.data || {};
            if (errorData.rawAiResponse) {
              console.error("RAW AI RESPONSE:", errorData.rawAiResponse);
              throw new Error(`The AI failed to return valid JSON.\n\nError: ${errorData.parseError || errorData.error}\n\nRaw AI Response:\n${errorData.rawAiResponse}`);
            }
            throw new Error(errorData.error || errorData.detail || err.message || 'AI extraction failed');
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to process file: ' + err.message);
    } finally {
      setIsProcessing(false);
      setLoadingText('Analyzing document...');
    }
  };

  const handleCellEdit = (rowIndex: number, header: string, value: string) => {
    setPreviewData(prev => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [header]: value };
      return next;
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    setPreviewData(prev => prev.filter((_, i) => i !== rowIndex));
    setRowMatches(prev => prev.filter((_, i) => i !== rowIndex));
    setRowDecisions(prev => prev.filter((_, i) => i !== rowIndex));
  };

  const setDecision = (rowIndex: number, decision: RowDecision) => {
    setRowDecisions(prev => {
      const next = [...prev];
      next[rowIndex] = decision;
      return next;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Only select up to the first 50 rows since we only render 50 editable rows for now
      setSelectedRows(previewData.slice(0, 50).map((_, i) => i));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (index: number) => {
    setSelectedRows(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  const applyBulkEdit = (fillMissingOnly: boolean) => {
    if (!bulkEditField || bulkEditValue === '') return;
    setPreviewData(prev => {
      const next = [...prev];
      selectedRows.forEach(i => {
        if (fillMissingOnly) {
          if (!next[i][bulkEditField] || String(next[i][bulkEditField]).trim() === '') {
            next[i] = { ...next[i], [bulkEditField]: bulkEditValue };
          }
        } else {
          next[i] = { ...next[i], [bulkEditField]: bulkEditValue };
        }
      });
      return next;
    });
    setBulkEditField('');
    setBulkEditValue('');
    setSelectedRows([]);
  };

  // Effective action for a row given its match status + global policy + override.
  const effectiveAction = (i: number): 'create' | 'update' | 'skip' => {
    const m = rowMatches[i];
    if (!m || m.status === 'new') return 'create';
    const override = rowDecisions[i];
    if (override) return override;
    return existingPolicy;
  };

  const existingCount = rowMatches.filter(m => m?.status === 'existing').length;
  const newCount = rowMatches.filter(m => m?.status === 'new').length;
  const willImportCount = previewData.reduce((acc, _, i) => acc + (effectiveAction(i) === 'skip' ? 0 : 1), 0);

  const validateData = (rows: any[], cols: string[]) => {
    // Basic validation based on importType
    const newErrors = [];
    if (importType === 'product') {
      if (!cols.some(c => c.toLowerCase().includes('name'))) {
        newErrors.push('Missing mandatory column: Product Name');
      }
    }
    setErrors(newErrors);
  };

  const handleExecuteImport = async () => {
    setIsProcessing(true);
    try {
      const res = await api.post('/wholesale-import/execute', {
        importType,
        data: previewData,
        godownId: selectedGodown,
        existingPolicy,
        rowDecisions,
      });

      setSummary(res.data.summary);
      setStep('done');
      // Invalidate all related caches globally so they show up immediately in their respective modules
      import('swr').then(({ mutate }) => {
        mutate(key => typeof key === 'string' && key.startsWith('/products'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/master-data'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/customers'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/godowns'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/billing'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/suppliers'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/activity'), undefined, { revalidate: true });
      });
      // Refresh global zustand store for Udhar
      useUdharStore.getState().silentRefresh();
    } catch (err: any) {
      const errorData = err.response?.data || {};
      alert('Import failed: ' + (errorData.error || errorData.detail || err.message));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={20} /> Back to Import Types
        </button>
        <h2 className="text-xl font-bold capitalize text-slate-900 dark:text-white">
          {importType.replace('-', ' ')} Import
        </h2>
      </div>

      {step === 'upload' && (
        <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <CardContent className="p-12">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept=".csv,.xlsx,.xls,.pdf,image/*" />
            
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${
                isProcessing 
                  ? 'border-emerald-500 bg-slate-900 dark:bg-slate-950 pointer-events-none' 
                  : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-500/5'
              }`}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-8 relative z-10 w-full max-w-sm">
                  {/* Outer Pulsing Rings */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 border-4 border-emerald-500/20 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                    <div className="w-48 h-48 border-4 border-blue-500/10 rounded-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] absolute"></div>
                  </div>
                  
                  {/* Scanner Graphic */}
                  <div className="relative w-24 h-24 bg-slate-800 rounded-2xl flex items-center justify-center mb-8 overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                    <FileText size={40} className="text-emerald-400 opacity-50" />
                    {/* Scanner Beam */}
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-emerald-400/50 to-emerald-400/10 animate-[scan_1.5s_ease-in-out_infinite_alternate]" style={{ transform: 'translateY(-100%)' }}>
                      <div className="w-full h-1 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]"></div>
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Vyapar Sarthi AI</h3>
                  <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                    <Loader2 size={16} className="text-emerald-400 animate-spin" />
                    <p className="text-emerald-400 font-medium text-sm animate-pulse">{loadingText}</p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload size={48} className="text-slate-400 mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Drop your file here</h3>
                  <p className="text-slate-500 text-sm mb-6">Supports CSV, Excel, PDF, and Images</p>
                  
                  <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center max-w-sm">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                      💡 Note: AI reads each page/photo one by one, so multi-page PDFs and multiple photos now work. Up to ~25 pages or 25 photos per upload — larger batches just take longer.
                    </p>
                  </div>

                  <button className="bg-emerald-500 text-slate-900 px-6 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors">
                    Browse Files
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Review &amp; edit before import</h3>
                <p className="text-sm text-slate-500">
                  {previewData.length} rows · <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{willImportCount} will import</span>
                  {checkingMatches ? ' · checking for existing records…' : (existingCount > 0 ? ` · ${existingCount} already exist` : '')}
                </p>
              </div>
              <div className="flex gap-3 items-center">
                {['product', 'purchase', 'stock'].includes(importType) && godowns.length > 0 && (
                  <select
                    value={selectedGodown}
                    onChange={e => setSelectedGodown(e.target.value)}
                    className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500"
                  >
                    {godowns.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}
                <button onClick={() => setStep('upload')} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Cancel
                </button>
                <button
                  onClick={handleExecuteImport}
                  disabled={isProcessing || errors.length > 0 || willImportCount === 0}
                  className="px-6 py-2 bg-emerald-500 text-slate-900 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Import {willImportCount} record{willImportCount === 1 ? '' : 's'}
                </button>
              </div>
            </div>

            {/* Conflict policy — only relevant when some rows already exist */}
            {existingCount > 0 && (
              <div className="mb-5 p-4 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-amber-800 dark:text-amber-300 font-medium flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    {existingCount} of these already exist in your shop. What should happen to them?
                  </p>
                  <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg p-1 border border-amber-200 dark:border-amber-500/20">
                    <button
                      type="button"
                      onClick={() => setExistingPolicy('update')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${existingPolicy === 'update' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}
                    >
                      Update with new info
                    </button>
                    <button
                      type="button"
                      onClick={() => setExistingPolicy('skip')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${existingPolicy === 'skip' ? 'bg-slate-600 text-white' : 'text-slate-500'}`}
                    >
                      Keep existing (import only new)
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 mt-2">
                  Blank cells never overwrite existing data. You can override any single row below.
                </p>
              </div>
            )}

            {errors.length > 0 && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500">
                <h4 className="font-bold flex items-center gap-2"><AlertCircle size={16}/> Validation Errors</h4>
                <ul className="list-disc pl-6 mt-2 text-sm">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {/* Bulk Actions Toolbar */}
            {selectedRows.length > 0 && (
              <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 p-3 rounded-xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  {selectedRows.length} row{selectedRows.length > 1 ? 's' : ''} selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <select 
                    value={bulkEditField} 
                    onChange={e => setBulkEditField(e.target.value)}
                    className="text-sm bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-200"
                  >
                    <option value="">-- Select Field --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <input 
                    type="text" 
                    placeholder="New Value..." 
                    value={bulkEditValue}
                    onChange={e => setBulkEditValue(e.target.value)}
                    className="text-sm bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-32 text-slate-700 dark:text-slate-200"
                  />
                  <button 
                    onClick={() => applyBulkEdit(false)}
                    disabled={!bulkEditField || bulkEditValue === ''}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
                  >
                    Apply to Selected
                  </button>
                  <button 
                    onClick={() => applyBulkEdit(true)}
                    disabled={!bulkEditField || bulkEditValue === ''}
                    title="Only apply if the field is empty"
                    className="text-xs bg-white dark:bg-slate-800 border border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    Fill Missing Only
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-3 w-10 sticky left-0 bg-slate-50 dark:bg-slate-800 z-20 border-r border-slate-200 dark:border-slate-700 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedRows.length === Math.min(previewData.length, 50) && previewData.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap sticky left-10 bg-slate-50 dark:bg-slate-800 z-10">Status</th>
                    {headers.map((h, i) => (
                      <th key={i} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-4 py-3 font-medium whitespace-nowrap w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {previewData.slice(0, 50).map((row, i) => {
                    const match = rowMatches[i];
                    const action = effectiveAction(i);
                    const isExisting = match?.status === 'existing';
                    const isSelected = selectedRows.includes(i);
                    return (
                    <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 text-slate-900 dark:text-slate-300 group ${action === 'skip' ? 'opacity-45' : ''} ${isSelected ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : ''}`}>
                      <td className="px-3 py-1 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800 text-center">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => handleSelectRow(i)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap sticky left-10 bg-white dark:bg-slate-900 z-10">
                        {isExisting ? (
                          <div className="flex flex-col gap-1" title={match?.existingName ? `Matches: ${match.existingName}` : 'Already exists'}>
                            <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Exists</span>
                            <div className="flex items-center rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 text-[10px] font-bold">
                              <button type="button" onClick={() => setDecision(i, 'update')}
                                className={`px-1.5 py-0.5 rounded ${action === 'update' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}>Update</button>
                              <button type="button" onClick={() => setDecision(i, 'skip')}
                                className={`px-1.5 py-0.5 rounded ${action === 'skip' ? 'bg-slate-600 text-white' : 'text-slate-500'}`}>Skip</button>
                            </div>
                          </div>
                        ) : match?.status === 'new' ? (
                          <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">New</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                      {headers.map((h, j) => (
                        <td key={j} className="px-1 py-1 whitespace-nowrap">
                          <input
                            type="text"
                            value={String(row[h] ?? '')}
                            onChange={(e) => handleCellEdit(i, h, e.target.value)}
                            className="w-full min-w-[90px] px-3 py-1.5 bg-transparent border border-transparent rounded-lg hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-colors"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(i)}
                          title="Remove row"
                          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-700 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {previewData.length > 50 && (
              <p className="text-center text-sm text-slate-500 mt-4">Showing first 50 rows (editable) — remaining {previewData.length - 50} rows will still be imported as-is.</p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'done' && summary && (
        <Card className={(summary.rowErrors?.length > 0) ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}>
          <CardContent className="p-12 text-center">
            {(summary.rowErrors?.length > 0) ? (
              <AlertCircle size={64} className="text-amber-500 mx-auto mb-6" />
            ) : (
              <CheckCircle size={64} className="text-emerald-500 mx-auto mb-6" />
            )}
            <h2 className={(summary.rowErrors?.length > 0) ? 'text-2xl font-bold text-amber-500 mb-2' : 'text-2xl font-bold text-emerald-500 mb-2'}>
              {(summary.rowErrors?.length > 0) ? 'Import Completed with Some Issues' : 'Import Successful!'}
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-8">
              Processed {summary.totalProcessed || previewData.length} records.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-left max-w-lg mx-auto">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex-1 min-w-[120px]">
                <p className="text-sm text-slate-500">Created</p>
                <p className="text-2xl font-bold text-emerald-500">{summary.created || 0}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex-1 min-w-[120px]">
                <p className="text-sm text-slate-500">Updated</p>
                <p className="text-2xl font-bold text-blue-500">{summary.updated || 0}</p>
              </div>
              {summary.skipped > 0 && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex-1 min-w-[120px]">
                  <p className="text-sm text-slate-500">Skipped</p>
                  <p className="text-2xl font-bold text-amber-500">{summary.skipped}</p>
                </div>
              )}
            </div>

            {summary.rowErrors?.length > 0 && (
              <div className="mt-6 max-w-lg mx-auto text-left p-4 bg-white dark:bg-slate-900 border border-amber-500/30 rounded-xl">
                <h4 className="font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                  <AlertCircle size={16} /> {summary.rowErrors.length} row{summary.rowErrors.length > 1 ? 's' : ''} could not be imported
                </h4>
                <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400 max-h-48 overflow-y-auto space-y-1">
                  {summary.rowErrors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <button onClick={onBack} className="mt-8 px-6 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              Start Another Import
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
