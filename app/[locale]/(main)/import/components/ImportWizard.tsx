'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileSpreadsheet, FileImage, FileText, CheckCircle, Loader2, AlertCircle, ArrowLeft, Trash2, Camera, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Fuse from 'fuse.js';
import api from '@/lib/api';

type ImportType = 'product' | 'purchase' | 'stock' | 'suppliers' | 'customers' | 'sales' | 'ledger';
type Step = 'upload' | 'preview' | 'importing' | 'done';

export default function ImportWizard({ importType, onBack }: { importType: ImportType; onBack: () => void }) {
  const t = useTranslations('Import');
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
      // Basic client-side parsing for Excel/CSV
      const file = selectedFiles[0];
      if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (jsonData.length > 0) {
          const rawHeaders = jsonData[0] as string[];
          setHeaders(rawHeaders);
          
          // Map array data to objects
          const rows = jsonData.slice(1).map(row => {
            const obj: any = {};
            rawHeaders.forEach((h, i) => {
              obj[h] = (row as any[])[i];
            });
            return obj;
          }).filter(row => Object.values(row).some(v => v !== undefined && v !== null && v !== ''));
          
          setPreviewData(rows);
          validateData(rows, rawHeaders);
          setStep('preview');
        }
      } else {
        // AI Extraction
        let fileToSend = file;

        // If it's a PDF, convert the first page to an image using client-side pdf.js
        // This completely bypasses backend PDF parsing errors and allows Nvidia Vision to see the layout perfectly!
        if (file.type === 'application/pdf') {
          setLoadingText('Converting PDF to image...');
          
          // Load pdf.js dynamically from CDN to avoid Next.js build issues
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
          const page = await pdf.getPage(1);
          
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9));
            if (blob) {
              fileToSend = new File([blob], file.name.replace('.pdf', '.jpg'), { type: 'image/jpeg' });
            }
          }
        }

        setLoadingText('Analyzing document with Nvidia...');
        const fd = new FormData();
        fd.append('file', fileToSend);
        fd.append('targetType', importType);
        
        try {
          const res = await api.post('/wholesale-import/analyze', fd);
          const data = res.data;
          
          if (data.items && data.items.length > 0) {
            const aiHeaders = Object.keys(data.items[0]);
            setHeaders(aiHeaders);
            setPreviewData(data.items);
            validateData(data.items, aiHeaders);
          }
          setStep('preview');
        } catch (err: any) {
          const errorData = err.response?.data || {};
          if (errorData.rawAiResponse) {
            console.error("RAW AI RESPONSE:", errorData.rawAiResponse);
            throw new Error(`The AI failed to return valid JSON.\n\nError: ${errorData.parseError || errorData.error}\n\nRaw AI Response:\n${errorData.rawAiResponse}`);
          }
          throw new Error(errorData.error || errorData.detail || err.message || 'AI extraction failed');
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
  };

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
        godownId: selectedGodown
      });

      setSummary(res.data.summary);
      setStep('done');
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
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv,.xlsx,.xls,.pdf,image/*" />
            
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
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Data Preview</h3>
                <p className="text-sm text-slate-500">Found {previewData.length} records</p>
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
                  disabled={isProcessing || errors.length > 0}
                  className="px-6 py-2 bg-emerald-500 text-slate-900 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Confirm &amp; Import
                </button>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500">
                <h4 className="font-bold flex items-center gap-2"><AlertCircle size={16}/> Validation Errors</h4>
                <ul className="list-disc pl-6 mt-2 text-sm">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-4 py-3 font-medium whitespace-nowrap w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {previewData.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 text-slate-900 dark:text-slate-300 group">
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
                          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-700 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
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
