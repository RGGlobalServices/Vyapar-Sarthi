'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload, FileSpreadsheet, FileImage, FileText, X, CheckCircle,
  Loader2, Trash2, ChevronDown, ChevronUp, AlertCircle,
  BookOpen, Package, ShoppingCart, FileQuestion, Save,
  GitMerge, Calendar, Camera, Sparkles, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useImportStore, useUdharStore, useStockStore,
  ImportedFileData, ImportFileType,
  ImportedKhataEntry, ImportedStockEntry, ImportedSaleEntry,
} from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig } from '@/lib/businessConfig';
import { isSubscriptionEnded } from '@/lib/subscriptionAccess';
import api from '@/lib/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ACCEPTED = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
].join(',');

function fileTypeIcon(ft: ImportFileType) {
  if (ft === 'image')  return <FileImage  size={18} className="text-blue-400"  />;
  if (ft === 'excel')  return <FileSpreadsheet size={18} className="text-emerald-400" />;
  if (ft === 'pdf')    return <FileText   size={18} className="text-red-400"   />;
  return <FileQuestion size={18} className="text-slate-400" />;
}

function dataTypeBadge(dt: ImportedFileData['dataType']) {
  const map = { khata: 'Khata / Udhar', stock: 'Stock', sales: 'Sales', loans: 'Loans', mixed: 'Mixed', unknown: 'Unknown' };
  const cls: Record<string, string> = {
    khata: 'bg-orange-500/15 text-orange-400',
    stock: 'bg-emerald-500/15 text-emerald-400',
    sales: 'bg-blue-500/15 text-blue-400',
    loans: 'bg-amber-500/15 text-amber-400',
    mixed: 'bg-purple-500/15 text-purple-400',
    unknown: 'bg-slate-500/15 text-slate-400',
  };
  return (
    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', cls[dt] ?? cls.unknown)}>
      {map[dt] ?? 'Unknown'}
    </span>
  );
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── types ───────────────────────────────────────────────────────────────────

type Step = 'target' | 'idle' | 'name' | 'processing' | 'preview' | 'merge' | 'done';

interface PendingImport {
  file: File;
  preview: string | null;
}

interface MergeOptions {
  khata: boolean;
  stock: boolean;
  purchase: boolean;
  sales: boolean;
  loans: boolean;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD for sales range
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RetailImport() {
  const t = useTranslations('Import');
  const locale = useLocale();
  const { profile, fetchProfile } = useBusinessStore();
  const bizConfig = getBusinessConfig(profile.businessType);
  const { files, addFile, deleteFile } = useImportStore();
  const { addUdharFromImport }         = useUdharStore();
  const { items, mergeFromImport, mergePurchaseBill } = useStockStore();

  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep]             = useState<Step>('target');
  const [targetType, setTargetType] = useState<string>('');
  const [dragging, setDragging]     = useState(false);
  const [isSaving, setIsSaving]     = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingImport[]>([]);
  const [importName, setImportName] = useState('');
  const [nameError, setNameError]   = useState('');
  const [apiResult, setApiResult]   = useState<any>(null);
  const [apiError, setApiError]     = useState('');
  const [mismatchAlert, setMismatchAlert] = useState<string | null>(null);
  const [pendingApiResult, setPendingApiResult] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // merge modal state
  const [mergeOpts, setMergeOpts] = useState<MergeOptions>({
    khata: true, stock: true, purchase: true, sales: false, loans: false, date: todayISO(),
  });

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!isSubscriptionEnded(profile)) return;
    window.location.href = `/${locale}/billing`;
  }, [profile, locale]);

  // ── file selection ──────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    const isImage = file.type.startsWith('image/');
    const proceed = (previewUrl: string | null) => {
      setPendingFiles(prev => [...prev, { file, preview: previewUrl }]);
      setImportName('');
      setNameError('');
      setStep('name');
    };
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => proceed(e.target?.result as string ?? null);
      reader.readAsDataURL(file);
    } else {
      proceed(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(file => handleFile(file));
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => handleFile(file));
    e.target.value = '';
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (err) {
      console.error(err);
      alert('Camera access denied');
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        stopCamera();
        handleFile(file);
      }
    }, 'image/jpeg');
  };

  // ── name → process ──────────────────────────────────────────────────────
  const handleNameConfirm = async () => {
    if (!importName.trim()) { setNameError('Please enter a name for this import.'); return; }
    if (pendingFiles.length === 0) return;
    setStep('processing');

    try {
      let aggregatedData = {
        khata: [] as any[], stock: [] as any[], purchase: [] as any[], sales: [] as any[], loans: [] as any[],
        summary: '', fileType: 'mixed', dataType: targetType, rawText: ''
      };

      let hasMismatch = null;

      for (const p of pendingFiles) {
        const fd = new FormData();
        fd.append('file', p.file);
        fd.append('targetType', targetType);
        fd.append('businessType', profile.businessType);
        const res  = await fetch('/api/v1/import', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Processing failed');
        
        if (data.mismatchWarning) {
          hasMismatch = data.mismatchWarning;
        }

        aggregatedData.khata.push(...(data.khata || []));
        aggregatedData.stock.push(...(data.stock || []));
        aggregatedData.purchase.push(...(data.purchase || []));
        aggregatedData.sales.push(...(data.sales || []));
        aggregatedData.loans.push(...(data.loans || []));
        if (data.summary) aggregatedData.summary += data.summary + '\n';
        if (data.rawText) aggregatedData.rawText += data.rawText + '\n';
      }

      setApiError('');
      
      const opts = {
        khata: aggregatedData.khata.length > 0,
        stock: aggregatedData.stock.length > 0,
        purchase: aggregatedData.purchase.length > 0,
        sales: aggregatedData.sales.length > 0, 
        loans: false,
        date: todayISO(),
      };

      if (hasMismatch) {
        setPendingApiResult({ data: aggregatedData, opts });
        setMismatchAlert(hasMismatch);
        return; // wait for user confirmation
      }

      setApiResult(aggregatedData);
      setMergeOpts(opts);
      setStep('preview');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to process file.');
      setStep('name');
    }
  };

  const handleMismatchConfirm = () => {
    if (!pendingApiResult) return;
    setApiResult(pendingApiResult.data);
    setMergeOpts(pendingApiResult.opts);
    setMismatchAlert(null);
    setPendingApiResult(null);
    setStep('preview');
  };

  const handleMismatchCancel = () => {
    setMismatchAlert(null);
    setPendingApiResult(null);
    setStep('name');
  };

  // ── preview handlers ────────────────────────────────────────────────────
  const handleEditResult = (type: string, idx: number, field: string, val: any) => {
    setApiResult((prev: any) => {
      if (!prev) return prev;
      const arr = [...(prev[type] || [])];
      arr[idx] = { ...arr[idx], [field]: val };
      if (field === 'price' && val > 0) arr[idx].missingPrice = false;
      if (field === 'totalAmount' && val > 0) arr[idx].missingAmount = false;
      if (field === 'date' && val) arr[idx].missingDate = false;
      if (field === 'billDate' && val) arr[idx].missingDate = false;
      return { ...prev, [type]: arr };
    });
  };

  // ── preview → merge modal ───────────────────────────────────────────────
  const handleGoToMerge = () => {
    setStep('merge');
  };

  // ── confirm merge + save ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!apiResult || pendingFiles.length === 0 || isSaving) return;
    setIsSaving(true);
    setApiError('');
    
    try {
      const dateISO = new Date(mergeOpts.date).toISOString();

      // Merge into Udhar store
    if (mergeOpts.khata && apiResult.khata?.length > 0) {
      for (const k of apiResult.khata as ImportedKhataEntry[]) {
        if (k.customerName && k.amount > 0) {
          const entryDate = k.date ? new Date(k.date).toISOString() : dateISO;
          await addUdharFromImport(k.customerName, k.amount, k.note, entryDate);
        }
      }
    }

    // Merge into Stock store
    if (mergeOpts.stock && apiResult.stock?.length > 0) {
      await mergeFromImport(apiResult.stock as ImportedStockEntry[], dateISO);
    }

    // Merge Purchase bills into Stock store
    if (mergeOpts.purchase && apiResult.purchase?.length > 0) {
      for (const p of apiResult.purchase) {
        if (p.items && p.items.length > 0) {
          const itemsToSave = p.items.map((item: any) => {
            let sv = item.size_variants;
            if (typeof sv === 'string' && sv.trim()) {
              const parts = sv.split(',').map(part => part.trim().split(':'));
              const obj: any = {};
              for (const part of parts) {
                if (part.length === 2) {
                   obj[part[0].trim()] = parseInt(part[1].trim()) || 0;
                }
              }
              sv = obj;
            }
            // Update quantity based on sizes if sizes exist
            let qty = item.quantity;
            if (sv && typeof sv === 'object' && Object.keys(sv).length > 0) {
               qty = Object.values(sv).reduce((sum: number, val: any) => sum + (parseInt(val) || 0), 0);
            }
            return {
              ...item,
              quantity: qty,
              size_variants: sv && typeof sv === 'object' && Object.keys(sv).length > 0 ? JSON.stringify(sv) : null
            };
          });
          const billDate = p.billDate ? new Date(p.billDate).toISOString() : dateISO;
          await mergePurchaseBill(itemsToSave, billDate, p.vendorName || 'Unknown Vendor');
        }
      }
    }

    // Save Imported Sales to DB
    if (mergeOpts.sales && apiResult.sales?.length > 0) {
      for (const s of apiResult.sales) {
        try {
          const startDate = s.date ? new Date(s.date) : new Date(dateISO);
          let endDate = s.endDate ? new Date(s.endDate) : null;
          if (!s.date && mergeOpts.endDate) {
            endDate = new Date(mergeOpts.endDate);
          }
          
          let itemsWithIds = [];
          if (s.items && s.items.length > 0) {
            itemsWithIds = s.items.map((item: any) => {
              const existing = items.find(i => i.name.toLowerCase() === item.productName?.toLowerCase());
              return {
                ...item,
                productId: existing ? existing.id : undefined,
              };
            });
          } else {
            // Default generic item for imported sales that only have a total amount
            itemsWithIds = [{
              productName: 'Imported Sale',
              category: 'Import',
              quantity: 1,
              unit: 'Unit',
              pricePerUnit: s.totalAmount || 0,
              marginPerUnit: s.totalProfit || 0
            }];
          }

          if (endDate && endDate > startDate) {
            // Distribute across days
            const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const dailyAmount = (s.totalAmount || 0) / daysDiff;
            const dailyProfit = (s.totalProfit || 0) / daysDiff;
            
            for (let i = 0; i < daysDiff; i++) {
              const current = new Date(startDate);
              current.setDate(startDate.getDate() + i);
              
              const dailyItems = itemsWithIds.map((item: any) => ({
                ...item,
                pricePerUnit: item.pricePerUnit ? item.pricePerUnit / daysDiff : 0,
                marginPerUnit: item.marginPerUnit ? item.marginPerUnit / daysDiff : 0
              }));

              await api.post('/billing', {
                items: dailyItems,
                total_amount: dailyAmount,
                total_profit: dailyProfit,
                payment_type: s.paymentMethod || s.paymentType || 'Mixed',
                created_at: current.toISOString(),
              });
            }
          } else {
            // Single day record
            await api.post('/billing', {
              items: itemsWithIds,
              total_amount: s.totalAmount || 0,
              total_profit: s.totalProfit || 0,
              payment_type: s.paymentMethod || s.paymentType || 'Mixed',
              created_at: startDate.toISOString(),
            });
          }
        } catch (err) {
          console.error('Failed to save imported sale:', err);
        }
      }
    }

    // Save the import record
    const record: ImportedFileData = {
      id:         Date.now(),
      name:       importName.trim(),
      fileName:   pendingFiles.length > 1 ? 'Multiple Files' : pendingFiles[0]?.file.name || '',
      fileType:   apiResult.fileType ?? 'other',
      dataType:   apiResult.dataType ?? 'unknown',
      summary:    apiResult.summary  ?? '',
      rawText:    apiResult.rawText  ?? '',
      khata:      apiResult.khata    ?? [],
      stock:      apiResult.stock    ?? [],
      sales:      apiResult.sales    ?? [],
      loans:      apiResult.loans    ?? [],
      importedAt: new Date().toISOString(),
    };
    addFile(record);

    setPendingFiles([]); setApiResult(null); setImportName('');
    setStep('done');
    setTimeout(() => setStep('target'), 1800);
    } catch (err: any) {
      console.error(err);
      setApiError(err instanceof Error ? err.message : (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingFiles([]); setApiResult(null); setApiError(''); setImportName('');
    setStep('target');
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const hasKhata = apiResult?.khata?.length > 0;
  const hasStock = apiResult?.stock?.length > 0;
  const hasSales = apiResult?.sales?.length > 0;
  const hasLoans = apiResult?.loans?.length > 0;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Sparkles size={32} className="text-slate-900" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{t('title') || 'Vyapar Sarthi AI Agent'}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('desc') || 'Your smart assistant for digitizing files. Scans handwritten papers, bills, and Excel — understands spelling mistakes and automatically matches products with fuzzy logic.'}
          </p>
        </div>
      </div>

      {/* Hidden Global File Input */}
      <input ref={inputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleInputChange} />

      {/* ── Step: Select Target Type ── */}
      {step === 'target' && (
        <div className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-blue-400 text-sm flex items-start gap-3">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{t('instructions') || 'Instructions for AI Import'}</p>
              <p className="mt-1 opacity-90">{t('instructionsDesc') || 'First, select what type of document you are importing. This helps our AI accurately extract the right information (like distinguishing a purchase bill from a customer ledger). Once selected, you can upload your file or take a photo.'}</p>
            </div>
          </div>
          <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
            <CardContent className="p-8 text-center space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t('whatImporting') || 'What are you importing?'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => { setTargetType('purchase'); setStep('idle'); }} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition-all text-left">
                  <ShoppingCart size={32} className="text-emerald-400 mb-3" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">{t('purchaseBills') || 'Purchase Bills'}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t('purchaseBillsDesc') || 'Vendor invoices, add new stock'}</p>
                </button>
                <button onClick={() => { setTargetType('sales'); setStep('idle'); }} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 transition-all text-left">
                  <FileSpreadsheet size={32} className="text-blue-400 mb-3" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">{t('salesHistory') || 'Sales History'}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t('salesHistoryDesc') || 'Old bills, sales registers'}</p>
                </button>
                <button onClick={() => { setTargetType('stock'); setStep('idle'); }} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all text-left">
                  <Package size={32} className="text-purple-400 mb-3" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">{t('bulkStock') || 'Bulk Stock List'}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t('bulkStockDesc') || 'Inventory updates, existing items'}</p>
                </button>
                <button onClick={() => { setTargetType('khata'); setStep('idle'); }} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl hover:bg-orange-500/10 border border-transparent hover:border-orange-500/30 transition-all text-left">
                  <BookOpen size={32} className="text-orange-400 mb-3" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200">{t('udharKhata') || 'Udhar Khata'}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t('udharKhataDesc') || 'Customer credit ledgers'}</p>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Drop Zone ── */}
      {(step === 'idle' || step === 'done') && (
        <div className="space-y-4">
          <button onClick={() => setStep('target')} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 dark:text-slate-200 transition-colors font-medium text-sm">
            <ArrowLeft size={16} /> Back to Document Type Selection
          </button>
          <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all',
            dragging ? 'border-emerald-500 bg-emerald-500/5'
                     : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-600 hover:bg-slate-100 dark:bg-slate-800/'
          )}
        >
          {step === 'done' ? (
            <>
              <CheckCircle size={48} className="text-emerald-500" />
              <p className="text-emerald-400 font-bold text-lg">Saved &amp; merged successfully!</p>
            </>
          ) : (
            <>
              <Upload size={48} className={dragging ? 'text-emerald-500' : 'text-slate-500'} />
              <div className="text-center">
                <p className="text-slate-300 font-semibold text-lg">Drop your file here or click to browse</p>
                <p className="text-slate-500 text-sm mt-1">Handwritten photo, Excel, CSV, or PDF</p>
              </div>
              <div className="flex gap-4 mt-2">
                <TypeBadge icon={<FileImage size={16}/>} label="JPG / PNG" color="text-blue-400" />
                <TypeBadge icon={<FileSpreadsheet size={16}/>} label="Excel / CSV" color="text-emerald-400" />
                <TypeBadge icon={<FileText size={16}/>} label="PDF" color="text-red-400" />
              </div>
            </>
          )}
          
          <div className="flex gap-3 mt-4">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); startCamera(); }}
              className="px-6 py-2 bg-emerald-500 text-slate-900 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Camera size={18} /> Take Photo
            </button>
          </div>
        </div>
        </div>
      )}

      {showCamera && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl aspect-video bg-white dark:bg-slate-900 rounded-2xl object-cover shadow-2xl" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex items-center gap-8 mt-8">
            <button key="close" onClick={stopCamera} className="p-4 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-full hover:bg-slate-700 transition-colors">
              <X size={28} />
            </button>
            <button key="snap" onClick={capturePhoto} className="p-6 bg-emerald-500 text-slate-900 rounded-full hover:bg-emerald-400 shadow-2xl shadow-emerald-500/40 transition-all active:scale-90">
              <Camera size={40} />
            </button>
            <div className="w-12 h-12" /> {/* alignment spacer */}
          </div>
          <p className="text-slate-900 dark:text-white/50 text-sm mt-10 font-medium tracking-widest uppercase">Align Bill or Ledger in Frame</p>
        </div>
      )}

      {/* ── Step: Name ── */}
      {(step === 'name' || step === 'processing') && pendingFiles.length > 0 && (
        <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Save size={20} className="text-emerald-500" /> Name this Import
              </h2>
              {step !== 'processing' && (
                <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X size={20}/></button>
              )}
            </div>

            {/* Files preview */}
            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-2">
              {pendingFiles.map((p, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 flex items-center gap-4">
                  {p.preview ? (
                    <Image src={p.preview} alt="preview" width={60} height={60} className="h-16 w-16 object-cover rounded-lg border border-slate-300 dark:border-slate-700 flex-shrink-0" />
                  ) : (
                    <div className="h-16 w-16 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      {fileTypeIcon(
                        p.file.type.startsWith('image/') ? 'image' :
                        p.file.type === 'application/pdf' ? 'pdf' : 'excel'
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 dark:text-slate-200 font-medium text-sm truncate">{p.file.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{(p.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  {step !== 'processing' && (
                    <button onClick={() => {
                      const newFiles = pendingFiles.filter((_, idx) => idx !== i);
                      if (newFiles.length === 0) {
                        setPendingFiles([]);
                        setStep('idle');
                      } else setPendingFiles(newFiles);
                    }} className="text-red-400 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
              {step !== 'processing' && (
                <button onClick={() => inputRef.current?.click()} className="py-3 mt-2 text-emerald-500 text-sm font-bold hover:bg-emerald-500/10 transition-colors flex items-center gap-1 justify-center border border-dashed border-emerald-500/50 rounded-xl">
                  + Add Another File
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2 uppercase font-bold">Import Name *</label>
              <input
                type="text"
                placeholder="e.g. April 2024 Khata, January Stock Register..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={importName}
                onChange={e => { setImportName(e.target.value); setNameError(''); }}
                disabled={step === 'processing'}
                autoFocus
              />
              {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
              {apiError && (
                <div className="flex items-center gap-2 mt-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14}/> {apiError}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleCancel} disabled={step === 'processing'}
                className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleNameConfirm} disabled={step === 'processing'}
                className="flex-1 bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {step === 'processing'
                  ? <><Loader2 size={18} className="animate-spin" /> Scanning with AI...</>
                  : 'Scan & Extract Data'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Preview ── */}
      {step === 'preview' && apiResult && (
        <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle size={20} className="text-emerald-500"/> AI Analysis Complete
              </h2>
              <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X size={20}/></button>
            </div>

            {/* AI Agent Report */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Sparkles size={80} className="text-emerald-500" />
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                   <Sparkles size={20} className="text-slate-900" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Vyapar Sarthi AI Report</p>
                  <p className="text-slate-900 dark:text-slate-100 font-medium leading-relaxed">{apiResult.summary}</p>
                </div>
              </div>
            </div>

            {/* Summary details */}
            <div className="bg-slate-100 dark:bg-slate-800/ rounded-xl p-4 flex items-center justify-between border border-slate-300 dark:border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-900 dark:text-slate-200">{importName}</span>
                {dataTypeBadge(apiResult.dataType)}
              </div>
              <div className="flex gap-4 text-xs">
                {hasKhata && <span className="text-orange-400 font-bold">{apiResult.khata.length} Khata</span>}
                {hasStock && <span className="text-emerald-400 font-bold">{apiResult.stock.length} Stock</span>}
                {hasSales && <span className="text-blue-400 font-bold">{apiResult.sales.length} Sales</span>}
                {hasLoans && <span className="text-amber-400 font-bold">{apiResult.loans.length} Loans</span>}
              </div>
            </div>

            {apiResult.needsClarification && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-orange-400 text-sm flex items-start gap-3">
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Clarification Needed</p>
                  <p className="mt-1 opacity-90">The AI was unsure about some handwriting or formatting. Please review the highlighted fields below carefully.</p>
                </div>
              </div>
            )}

            {/* Khata table */}
            {hasKhata && (
              <Section title="Khata / Udhar Entries" icon={<BookOpen size={16} className="text-orange-400"/>}>
                <DataTable
                  headers={['Customer', 'Amount', 'Date', 'Note']}
                  rows={apiResult.khata.map((k: ImportedKhataEntry, idx: number) => [
                    <input key={`k-name-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" value={k.customerName} onChange={e => handleEditResult('khata', idx, 'customerName', e.target.value)} />,
                    <input key={`k-amt-${idx}`} type="number" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-20 text-orange-400" value={k.amount || ''} onChange={e => handleEditResult('khata', idx, 'amount', Number(e.target.value))} />,
                    <input key={`k-date-${idx}`} type="date" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" value={k.date || ''} onChange={e => handleEditResult('khata', idx, 'date', e.target.value)} />,
                    <input key={`k-note-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" value={k.note || ''} onChange={e => handleEditResult('khata', idx, 'note', e.target.value)} />,
                  ])}
                />
              </Section>
            )}

            {/* Stock table */}
            {hasStock && (
              <Section title="Stock / Inventory" icon={<Package size={16} className="text-emerald-400"/>}>
                <DataTable
                  headers={['Product', 'Category', 'Qty', 'Unit', 'Wholesale', 'MRP', 'Selling', 'Expiry']}
                  rows={apiResult.stock.map((s: ImportedStockEntry & { missingPrice?: boolean }, idx: number) => [
                    <input key={`s-name-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-32" value={s.productName} onChange={e => handleEditResult('stock', idx, 'productName', e.target.value)} />,
                    <input key={`s-cat-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-24" value={s.category || ''} onChange={e => handleEditResult('stock', idx, 'category', e.target.value)} />,
                    <input key={`s-qty-${idx}`} type="number" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-16" value={s.quantity || ''} onChange={e => handleEditResult('stock', idx, 'quantity', Number(e.target.value))} />,
                    <input key={`s-unit-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-16" value={s.unit || ''} onChange={e => handleEditResult('stock', idx, 'unit', e.target.value)} />,
                    <input key={`s-cost-${idx}`} type="number" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-20 text-slate-500" value={s.wholesaleCost || ''} onChange={e => handleEditResult('stock', idx, 'wholesaleCost', Number(e.target.value))} placeholder="₹0" />,
                    <input key={`s-mrp-${idx}`} type="number" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-20 text-slate-500" value={s.mrp || ''} onChange={e => handleEditResult('stock', idx, 'mrp', Number(e.target.value))} placeholder="₹0" />,
                    <input key={`s-sell-${idx}`} type="number" className={`bg-white dark:bg-slate-900 border ${s.missingPrice || (!s.sellingPrice && !s.mrp) ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 dark:border-slate-700'} rounded px-2 py-1 text-sm w-20 text-emerald-400`} value={s.sellingPrice || s.mrp || ''} onChange={e => handleEditResult('stock', idx, 'sellingPrice', Number(e.target.value))} placeholder="₹0" />,
                    <input key={`s-exp-${idx}`} type="date" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-32" value={s.expiryDate || ''} onChange={e => handleEditResult('stock', idx, 'expiryDate', e.target.value)} />,
                  ])}
                  align={['left','left','right','left','right','right','right','left']}
                />
              </Section>
            )}

            {(apiResult.purchase?.length > 0) && (
              <Section title="Purchase Bills" icon={<ShoppingCart size={16} className="text-emerald-400"/>}>
                <div className="space-y-4">
                  {apiResult.purchase.map((p: any, idx: number) => {
                    const calcTotal = p.items?.reduce((sum: number, item: any) => sum + (Number(item.quantity || 0) * Number(item.wholesaleCost || 0)), 0) || 0;
                    const finalTotal = p.totalAmount || (calcTotal > 0 ? calcTotal : '');
                    return (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex gap-4 mb-4">
                        <input className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-sm flex-1 font-bold" value={p.vendorName || ''} onChange={e => handleEditResult('purchase', idx, 'vendorName', e.target.value)} placeholder="Vendor Name" />
                        <input type="date" className={`bg-white dark:bg-slate-900 border ${p.missingDate || !p.billDate ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 dark:border-slate-700'} rounded px-3 py-1.5 text-sm w-40`} value={p.billDate || ''} onChange={e => handleEditResult('purchase', idx, 'billDate', e.target.value)} />
                        <input type="number" className={`bg-white dark:bg-slate-900 border ${p.missingAmount || !finalTotal ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 dark:border-slate-700'} rounded px-3 py-1.5 text-sm w-32 font-bold text-emerald-500`} value={finalTotal} onChange={e => handleEditResult('purchase', idx, 'totalAmount', Number(e.target.value))} placeholder="Total ₹0" />
                      </div>
                      
                      {p.items && p.items.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700 overflow-x-auto">
                          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Extracted Products</p>
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                                <th className="pb-2 font-medium">Product</th>
                                <th className="pb-2 font-medium">Cat.</th>
                                {bizConfig.hasGender && <th className="pb-2 font-medium">Gender</th>}
                                {bizConfig.hasSizes && <th className="pb-2 font-medium">Sizes</th>}
                                {bizConfig.hasShades && <th className="pb-2 font-medium">Shade</th>}
                                {bizConfig.hasBatch && <th className="pb-2 font-medium">Batch</th>}
                                {bizConfig.hasDrugSchedule && <th className="pb-2 font-medium">Schedule</th>}
                                {bizConfig.hasModel && <th className="pb-2 font-medium">Model</th>}
                                {bizConfig.hasWarranty && <th className="pb-2 font-medium">Warranty</th>}
                                {bizConfig.hasExpiry && <th className="pb-2 font-medium">Expiry</th>}
                                <th className="pb-2 font-medium text-right">Qty</th>
                                <th className="pb-2 font-medium">Unit</th>
                                <th className="pb-2 font-medium text-right">Cost</th>
                                <th className="pb-2 font-medium text-right">Sug. Selling</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.items.map((item: any, iIdx: number) => {
                                const sizeStr = item.size_variants && typeof item.size_variants === 'object' 
                                  ? Object.entries(item.size_variants).map(([s, q]) => `${s}:${q}`).join(', ') 
                                  : (item.size_variants || '');
                                return (
                                <tr key={iIdx} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                  <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-32" value={item.productName || ''} onChange={e => { const items = [...p.items]; items[iIdx].productName = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>
                                  <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-20" value={item.category || ''} onChange={e => { const items = [...p.items]; items[iIdx].category = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>
                                  
                                  {bizConfig.hasGender && <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-20" value={item.gender || ''} onChange={e => { const items = [...p.items]; items[iIdx].gender = e.target.value; handleEditResult('purchase', idx, 'items', items); }} placeholder="Men/Women" /></td>}
                                  {bizConfig.hasSizes && <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-24" value={sizeStr} onChange={e => { const items = [...p.items]; items[iIdx].size_variants = e.target.value; handleEditResult('purchase', idx, 'items', items); }} placeholder="e.g. M:5, L:2" title="Format: Size:Qty, Size:Qty" /></td>}
                                  {bizConfig.hasShades && <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-20" value={item.shade || ''} onChange={e => { const items = [...p.items]; items[iIdx].shade = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>}
                                  {bizConfig.hasBatch && <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-20" value={item.batch_number || ''} onChange={e => { const items = [...p.items]; items[iIdx].batch_number = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>}
                                  {bizConfig.hasDrugSchedule && <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-16" value={item.drug_schedule || ''} onChange={e => { const items = [...p.items]; items[iIdx].drug_schedule = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>}
                                  {bizConfig.hasModel && <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-20" value={item.model_number || ''} onChange={e => { const items = [...p.items]; items[iIdx].model_number = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>}
                                  {bizConfig.hasWarranty && <td className="py-1.5 pr-2"><input type="number" className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-16" value={item.warranty_months || ''} onChange={e => { const items = [...p.items]; items[iIdx].warranty_months = e.target.value; handleEditResult('purchase', idx, 'items', items); }} placeholder="Mos" /></td>}
                                  {bizConfig.hasExpiry && <td className="py-1.5 pr-2"><input type="date" className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-32" value={item.expiryDate || ''} onChange={e => { const items = [...p.items]; items[iIdx].expiryDate = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>}
                                  
                                  <td className="py-1.5 pr-2 text-right"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-16 text-right" value={item.quantity || ''} onChange={e => { const items = [...p.items]; items[iIdx].quantity = Number(e.target.value); handleEditResult('purchase', idx, 'items', items); }} /></td>
                                  <td className="py-1.5 pr-2"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-16" value={item.unit || ''} onChange={e => { const items = [...p.items]; items[iIdx].unit = e.target.value; handleEditResult('purchase', idx, 'items', items); }} /></td>
                                  <td className="py-1.5 pr-2 text-right"><input className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs w-20 text-right text-slate-500" value={item.wholesaleCost || ''} onChange={e => { const items = [...p.items]; items[iIdx].wholesaleCost = Number(e.target.value); handleEditResult('purchase', idx, 'items', items); }} /></td>
                                  <td className="py-1.5 text-right"><input className="bg-transparent border border-emerald-300 dark:border-emerald-700 rounded px-2 py-1 text-xs w-20 text-right text-emerald-500 font-bold bg-emerald-50 dark:bg-emerald-900/20" value={item.suggestedSellingPrice || ''} onChange={e => { const items = [...p.items]; items[iIdx].suggestedSellingPrice = Number(e.target.value); handleEditResult('purchase', idx, 'items', items); }} /></td>
                                </tr>
                              );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </Section>
            )}

            {/* Sales table */}
            {hasSales && (
              <Section title="Sales Records" icon={<FileSpreadsheet size={16} className="text-blue-400"/>}>
                <DataTable
                  headers={['Date (From - To)', 'Amount', 'Payment', 'Note']}
                  rows={apiResult.sales.map((s: ImportedSaleEntry & { missingDate?: boolean, missingAmount?: boolean }, idx: number) => [
                    <div key={`sa-date-wrap-${idx}`} className="flex flex-col gap-1 sm:flex-row sm:items-center min-w-[200px]">
                      <input type="date" className={`bg-white dark:bg-slate-900 border ${s.missingDate || !s.date ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 dark:border-slate-700'} rounded px-2 py-1 text-sm w-full`} value={s.date || ''} onChange={e => handleEditResult('sales', idx, 'date', e.target.value)} />
                      <span className="text-slate-400 text-xs hidden sm:inline px-1">to</span>
                      <input type="date" className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" value={s.endDate || ''} onChange={e => handleEditResult('sales', idx, 'endDate', e.target.value)} title="Optional: Set an end date to distribute sales across days" />
                    </div>,
                    <input key={`sa-amt-${idx}`} type="number" className={`bg-white dark:bg-slate-900 border ${s.missingAmount || !s.totalAmount ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 dark:border-slate-700'} rounded px-2 py-1 text-sm w-24 text-blue-400 font-bold`} value={s.totalAmount || ''} onChange={e => handleEditResult('sales', idx, 'totalAmount', Number(e.target.value))} placeholder="₹0" />,
                    <select key={`sa-pay-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-24" value={s.paymentMethod || ''} onChange={e => handleEditResult('sales', idx, 'paymentMethod', e.target.value)}>
                      <option value="">Unknown</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                      <option value="Mixed">Mixed</option>
                      <option value="All">All</option>
                    </select>,
                    <input key={`sa-note-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" value={s.note || ''} onChange={e => handleEditResult('sales', idx, 'note', e.target.value)} />,
                  ])}
                  align={['left', 'left', 'left', 'left']}
                />
              </Section>
            )}

            {/* Loans table */}
            {hasLoans && (
              <Section title="Loan Records" icon={<GitMerge size={16} className="text-amber-400"/>}>
                <DataTable
                  headers={['Lender / Borrower', 'Amount', 'Date', 'Note']}
                  rows={apiResult.loans.map((l: any, idx: number) => [
                    <span key={`l-name-${idx}`} className="font-medium text-slate-900 dark:text-slate-200">{l.lenderName}</span>,
                    <span key={`l-amt-${idx}`} className="text-amber-400 font-bold">₹{l.amount}</span>,
                    <span key={`l-date-${idx}`} className="text-slate-500 text-xs">{l.date || '—'}</span>,
                    <span key={`l-note-${idx}`} className="text-slate-500 text-xs">{l.note || '—'}</span>,
                  ])}
                />
              </Section>
            )}

            {!hasKhata && !hasStock && !hasSales && !hasLoans && (
              <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
                <AlertCircle size={16}/> No structured data extracted. Raw text will be saved.
              </div>
            )}

            {/* Raw text */}
            {apiResult.rawText && (
              <Section title="Raw Extracted Text" icon={<FileText size={16} className="text-slate-400"/>} collapsible defaultOpen={false}>
                <pre className="text-xs text-slate-400 whitespace-pre-wrap bg-slate-950 rounded-lg p-3 max-h-40 overflow-y-auto">{apiResult.rawText}</pre>
              </Section>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={handleCancel} className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">Discard</button>
              <button onClick={handleGoToMerge}
                className="flex-1 bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2">
                <GitMerge size={18}/> Choose Where to Save
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Merge Modal ── */}
      {step === 'merge' && apiResult && (
        <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <GitMerge size={20} className="text-emerald-500"/> Merge Into App
              </h2>
              <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X size={20}/></button>
            </div>

            {/* Date of the data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs text-slate-400 uppercase font-bold flex items-center gap-2">
                  <Calendar size={14}/> {hasSales ? 'Start Date' : 'Fallback Default Date'}
                </label>
                <input
                  type="date"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={mergeOpts.date}
                  max={todayISO()}
                  onChange={e => setMergeOpts(o => ({ ...o, date: e.target.value }))}
                />
              </div>
              {hasSales && (
                <div className="space-y-2">
                  <label className="block text-xs text-slate-400 uppercase font-bold flex items-center gap-2">
                    <Calendar size={14}/> End Date (Optional)
                  </label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={mergeOpts.endDate || ''}
                    max={todayISO()}
                    min={mergeOpts.date}
                    onChange={e => setMergeOpts(o => ({ ...o, endDate: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">If the AI successfully extracts dates for specific entries from the file, those exact dates will be used. For sales without specific dates, providing a start and end date will distribute the sales evenly across the range.</p>

            {/* Section toggles */}
            <div className="space-y-3">
              <p className="text-xs text-slate-400 uppercase font-bold">Merge Into Which Sections?</p>

              <MergeToggle
                checked={mergeOpts.khata}
                disabled={!hasKhata}
                onChange={v => setMergeOpts(o => ({ ...o, khata: v }))}
                icon={<BookOpen size={18} className="text-orange-400"/>}
                color="orange"
                title="Udhar Khata (Ledger)"
                description={hasKhata
                  ? `${apiResult.khata.length} customer entries will be added to Udhar Khata`
                  : 'No Khata data found in this file'}
                preview={hasKhata && mergeOpts.khata ? (
                  <ul className="space-y-1 mt-2">
                    {(apiResult.khata as ImportedKhataEntry[]).slice(0, 5).map((k, i) => (
                      <li key={i} className="flex justify-between text-xs">
                        <span className="text-slate-300">{k.customerName}</span>
                        <span className="text-orange-400 font-bold">₹{k.amount}</span>
                      </li>
                    ))}
                    {apiResult.khata.length > 5 && <li className="text-xs text-slate-500">+{apiResult.khata.length - 5} more…</li>}
                  </ul>
                ) : null}
              />

              <MergeToggle
                checked={mergeOpts.stock}
                disabled={!hasStock}
                onChange={v => setMergeOpts(o => ({ ...o, stock: v }))}
                icon={<Package size={18} className="text-emerald-400"/>}
                color="emerald"
                title="Stock / Inventory"
                description={hasStock
                  ? `${apiResult.stock.length} products — existing matches will have quantity added, new ones created`
                  : 'No Stock data found in this file'}
                preview={hasStock && mergeOpts.stock ? (
                  <ul className="space-y-1 mt-2">
                    {(apiResult.stock as ImportedStockEntry[]).slice(0, 5).map((s, i) => (
                      <li key={i} className="flex justify-between text-xs">
                        <span className="text-slate-300">{s.productName}</span>
                        <span className="text-emerald-400 font-bold">+{s.quantity} {s.unit}</span>
                      </li>
                    ))}
                    {apiResult.stock.length > 5 && <li className="text-xs text-slate-500">+{apiResult.stock.length - 5} more…</li>}
                  </ul>
                ) : null}
              />

              <MergeToggle
                checked={mergeOpts.purchase}
                disabled={!apiResult?.purchase || apiResult.purchase.length === 0}
                onChange={v => setMergeOpts(o => ({ ...o, purchase: v }))}
                icon={<ShoppingCart size={18} className="text-emerald-400"/>}
                color="emerald"
                title="Purchase Bills (Add to Stock)"
                description={apiResult?.purchase?.length > 0
                  ? `${apiResult.purchase.length} purchase bills — their products will be automatically merged into Stock`
                  : 'No Purchase Bills found in this file'}
                preview={null}
              />

              <MergeToggle
                checked={mergeOpts.sales}
                disabled={!hasSales}
                onChange={v => setMergeOpts(o => ({ ...o, sales: v }))}
                icon={<ShoppingCart size={18} className="text-blue-400"/>}
                color="blue"
                title="Sales Records (Bills)"
                description={hasSales
                  ? `${apiResult.sales.length} sales entries — saved as import reference only (no live bill merge yet)`
                  : 'No Sales data found in this file'}
                preview={null}
              />
            </div>

            {/* Nothing selected warning */}
            {!mergeOpts.khata && !mergeOpts.stock && !mergeOpts.sales && (
              <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
                <AlertCircle size={14}/> No sections selected — data will only be saved as an import record.
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('preview')} disabled={isSaving}
                className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors disabled:opacity-50">
                Back
              </button>
              <button onClick={handleSave} disabled={isSaving}
                className="flex-1 bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} 
                {isSaving ? 'Saving...' : 'Save & Merge'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Saved Imports List ── */}
      {files.length > 0 && (step === 'idle' || step === 'done') && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">Saved Imports ({files.length})</h2>
          {files.map((f) => {
            const isOpen = expandedId === f.id;
            return (
              <Card key={f.id} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <CardContent className="p-0">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-100 dark:bg-slate-800/ transition-colors rounded-xl"
                    onClick={() => setExpandedId(isOpen ? null : f.id)}
                  >
                    <div className="flex-shrink-0">{fileTypeIcon(f.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{f.name}</p>
                        {dataTypeBadge(f.dataType)}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{f.fileName} · {formatDate(f.importedAt)}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{f.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-slate-600 hidden sm:block">
                        {[
                          f.khata.length  > 0 && `${f.khata.length} khata`,
                          f.stock.length  > 0 && `${f.stock.length} stock`,
                          f.sales.length  > 0 && `${f.sales.length} sales`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                      {deleteId === f.id ? (
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => deleteFile(f.id)} className="text-red-400 hover:text-red-300 px-2 py-1 text-xs font-bold">Delete</button>
                          <button onClick={() => setDeleteId(null)} className="text-slate-400 px-2 py-1 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setDeleteId(f.id); }}
                          className="text-slate-600 hover:text-red-400 p-1 transition-colors">
                          <Trash2 size={16}/>
                        </button>
                      )}
                      {isOpen ? <ChevronUp size={18} className="text-slate-500"/> : <ChevronDown size={18} className="text-slate-500"/>}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-800 pt-4">
                      {f.khata.length > 0 && (
                        <Section title="Khata / Udhar" icon={<BookOpen size={14} className="text-orange-400"/>}>
                          <DataTable
                            headers={['Customer','Amount','Note']}
                            rows={f.khata.map((k, idx) => [
                              <span key={`fk-name-${idx}`} className="font-medium">{k.customerName}</span>,
                              <span key={`fk-amt-${idx}`} className="text-orange-400 font-bold">₹{k.amount}</span>,
                              <span key={`fk-note-${idx}`} className="text-xs text-slate-500">{k.note || k.date || '—'}</span>,
                            ])}
                          />
                        </Section>
                      )}
                      {f.stock.length > 0 && (
                        <Section title="Stock" icon={<Package size={14} className="text-emerald-400"/>}>
                          <DataTable
                            headers={['Product','Qty','Unit','Price']}
                            rows={f.stock.map((s, idx) => [
                              <span key={`fs-name-${idx}`}>{s.productName}</span>,
                              <span key={`fs-qty-${idx}`} className="font-bold">{s.quantity}</span>,
                              <span key={`fs-unit-${idx}`} className="text-xs text-slate-500">{s.unit}</span>,
                              <span key={`fs-price-${idx}`} className="text-emerald-400 font-bold">{s.price > 0 ? `₹${s.price}` : '—'}</span>,
                            ])}
                            align={['left','right','left','right']}
                          />
                        </Section>
                      )}
                      {f.sales.length > 0 && (
                        <Section title="Sales" icon={<ShoppingCart size={14} className="text-blue-400"/>}>
                          <DataTable
                            headers={['Date','Amount','Payment']}
                            rows={f.sales.map((s, idx) => [
                              <span key={`fsa-date-${idx}`} className="text-xs text-slate-500">{s.date || '—'}</span>,
                              <span key={`fsa-amt-${idx}`} className="text-blue-400 font-bold">₹{s.totalAmount}</span>,
                              <span key={`fsa-pay-${idx}`} className="text-xs">{s.paymentMethod || '—'}</span>,
                            ])}
                          />
                        </Section>
                      )}
                      {f.rawText && (
                        <Section title="Raw Text" icon={<FileText size={14} className="text-slate-400"/>} collapsible defaultOpen={false}>
                          <pre className="text-xs text-slate-400 whitespace-pre-wrap bg-slate-950 rounded-lg p-3 max-h-32 overflow-y-auto">{f.rawText}</pre>
                        </Section>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {/* Mismatch Alert Modal */}
      {mismatchAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 text-red-500 flex items-center justify-center mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Data Mismatch Warning</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                {mismatchAlert}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleMismatchCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel Import
                </button>
                <button
                  onClick={handleMismatchConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Continue Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function TypeBadge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-xs font-medium', color)}>
      {icon} {label}
    </div>
  );
}

function Section({
  title, icon, children, collapsible = false, defaultOpen = true,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <div className={cn('flex items-center gap-2', collapsible && 'cursor-pointer select-none')}
        onClick={() => collapsible && setOpen(o => !o)}>
        {icon}
        <span className="text-xs font-bold text-slate-400 uppercase">{title}</span>
        {collapsible && (open
          ? <ChevronUp size={14} className="text-slate-600 ml-auto"/>
          : <ChevronDown size={14} className="text-slate-600 ml-auto"/>)}
      </div>
      {open && children}
    </div>
  );
}

function DataTable({ headers, rows, align }: {
  headers: string[];
  rows: React.ReactNode[][];
  align?: ('left' | 'right')[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
          {headers.map((h, i) => (
            <th key={i} className={cn('py-1.5', i > 0 ? 'px-2' : 'pr-2',
              align?.[i] === 'right' ? 'text-right' : 'text-left')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {rows.map((row, ri) => (
          <tr key={ri} className="text-slate-900 dark:text-slate-300">
            {row.map((cell, ci) => (
              <td key={ci} className={cn('py-1.5', ci > 0 ? 'px-2' : 'pr-2',
                align?.[ci] === 'right' ? 'text-right' : 'text-left')}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MergeToggle({
  checked, disabled, onChange, icon, color, title, description, preview,
}: {
  checked: boolean; disabled: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  color: 'orange' | 'emerald' | 'blue';
  title: string;
  description: string;
  preview: React.ReactNode;
}) {
  const borderCls = {
    orange:  checked && !disabled ? 'border-orange-500/50 bg-orange-500/5'   : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/',
    emerald: checked && !disabled ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/',
    blue:    checked && !disabled ? 'border-blue-500/50 bg-blue-500/5'       : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/',
  };
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'border rounded-xl p-4 transition-all',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        borderCls[color]
      )}
    >
      <div className="flex items-center gap-3">
        {/* checkbox */}
        <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
          checked && !disabled ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 bg-slate-50 dark:bg-slate-800')}>
          {checked && !disabled && <CheckCircle size={14} className="text-slate-900" />}
        </div>
        {icon}
        <div className="flex-1">
          <p className="font-semibold text-slate-900 dark:text-slate-200 text-sm">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {preview && <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-700/50">{preview}</div>}
    </div>
  );
}
