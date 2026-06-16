'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload, FileSpreadsheet, FileImage, FileText, X, CheckCircle,
  Loader2, Trash2, ChevronDown, ChevronUp, AlertCircle,
  BookOpen, Package, ShoppingCart, FileQuestion, Save,
  GitMerge, Calendar, Camera, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useImportStore, useUdharStore, useStockStore,
  ImportedFileData, ImportFileType,
  ImportedKhataEntry, ImportedStockEntry, ImportedSaleEntry,
} from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { isSubscriptionEnded } from '@/lib/subscriptionAccess';

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

type Step = 'idle' | 'name' | 'processing' | 'preview' | 'merge' | 'done';

interface PendingImport {
  file: File;
  preview: string | null;
}

interface MergeOptions {
  khata: boolean;
  stock: boolean;
  sales: boolean;
  loans: boolean;
  date: string; // YYYY-MM-DD
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const locale = useLocale();
  const { profile, fetchProfile } = useBusinessStore();
  const { files, addFile, deleteFile } = useImportStore();
  const { addUdharFromImport }         = useUdharStore();
  const { mergeFromImport }            = useStockStore();

  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep]             = useState<Step>('idle');
  const [dragging, setDragging]     = useState(false);
  const [pending, setPending]       = useState<PendingImport | null>(null);
  const [importName, setImportName] = useState('');
  const [nameError, setNameError]   = useState('');
  const [apiResult, setApiResult]   = useState<any>(null);
  const [apiError, setApiError]     = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // merge modal state
  const [mergeOpts, setMergeOpts] = useState<MergeOptions>({
    khata: true, stock: true, sales: false, loans: false, date: todayISO(),
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
      setPending({ file, preview: previewUrl });
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
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
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
    if (!pending) return;
    setStep('processing');

    try {
      const fd = new FormData();
      fd.append('file', pending.file);
      const res  = await fetch('/api/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Processing failed');
      setApiResult(data);
      setApiError('');

      // pre-fill merge toggles based on what was found
      setMergeOpts({
        khata: (data.khata?.length ?? 0) > 0,
        stock: (data.stock?.length ?? 0) > 0,
        sales: false, 
        loans: false,
        date: todayISO(),
      });
      setStep('preview');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to process file.');
      setStep('name');
    }
  };

  // ── preview → merge modal ───────────────────────────────────────────────
  const handleGoToMerge = () => setStep('merge');

  // ── confirm merge + save ────────────────────────────────────────────────
  const handleSave = () => {
    if (!apiResult || !pending) return;
    const dateISO = new Date(mergeOpts.date).toISOString();

    // Merge into Udhar store
    if (mergeOpts.khata && apiResult.khata?.length > 0) {
      (apiResult.khata as ImportedKhataEntry[]).forEach((k) => {
        if (k.customerName && k.amount > 0) {
          addUdharFromImport(k.customerName, k.amount, k.note, dateISO);
        }
      });
    }

    // Merge into Stock store
    if (mergeOpts.stock && apiResult.stock?.length > 0) {
      mergeFromImport(apiResult.stock as ImportedStockEntry[], dateISO);
    }

    // Save the import record
    const record: ImportedFileData = {
      id:         Date.now(),
      name:       importName.trim(),
      fileName:   pending.file.name,
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

    setPending(null); setApiResult(null); setImportName('');
    setStep('done');
    setTimeout(() => setStep('idle'), 1800);
  };

  const handleCancel = () => {
    setPending(null); setApiResult(null); setApiError(''); setImportName('');
    setStep('idle');
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
          <h1 className="text-3xl font-bold text-slate-100">Vyapar Sarthi AI Agent</h1>
          <p className="text-sm text-slate-400 mt-1">
            Your smart assistant for digitizing files. Scans handwritten papers, bills, and Excel — understands spelling mistakes and automatically matches products with fuzzy logic.
          </p>
        </div>
      </div>

      {/* ── Drop Zone ── */}
      {(step === 'idle' || step === 'done') && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all',
            dragging ? 'border-emerald-500 bg-emerald-500/5'
                     : 'border-slate-700 bg-slate-900 hover:border-slate-600 hover:bg-slate-800/50'
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
          <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleInputChange} />
          
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
      )}

      {showCamera && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl aspect-video bg-slate-900 rounded-2xl object-cover shadow-2xl" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex items-center gap-8 mt-8">
            <button key="close" onClick={stopCamera} className="p-4 bg-slate-800 text-white rounded-full hover:bg-slate-700 transition-colors">
              <X size={28} />
            </button>
            <button key="snap" onClick={capturePhoto} className="p-6 bg-emerald-500 text-slate-900 rounded-full hover:bg-emerald-400 shadow-2xl shadow-emerald-500/40 transition-all active:scale-90">
              <Camera size={40} />
            </button>
            <div className="w-12 h-12" /> {/* alignment spacer */}
          </div>
          <p className="text-white/50 text-sm mt-10 font-medium tracking-widest uppercase">Align Bill or Ledger in Frame</p>
        </div>
      )}

      {/* ── Step: Name ── */}
      {(step === 'name' || step === 'processing') && pending && (
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Save size={20} className="text-emerald-500" /> Name this Import
              </h2>
              {step !== 'processing' && (
                <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X size={20}/></button>
              )}
            </div>

            {/* File preview */}
            <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
              {pending.preview ? (
                <Image src={pending.preview} alt="preview" width={80} height={80} className="h-20 w-20 object-cover rounded-lg border border-slate-700 flex-shrink-0" />
              ) : (
                <div className="h-20 w-20 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  {fileTypeIcon(
                    pending.file.type.startsWith('image/') ? 'image' :
                    pending.file.type === 'application/pdf' ? 'pdf' : 'excel'
                  )}
                </div>
              )}
              <div>
                <p className="text-slate-200 font-medium text-sm truncate max-w-xs">{pending.file.name}</p>
                <p className="text-slate-500 text-xs mt-0.5">{(pending.file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2 uppercase font-bold">Import Name *</label>
              <input
                type="text"
                placeholder="e.g. April 2024 Khata, January Stock Register..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
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
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
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
                  <p className="text-slate-100 font-medium leading-relaxed">{apiResult.summary}</p>
                </div>
              </div>
            </div>

            {/* Summary details */}
            <div className="bg-slate-800/50 rounded-xl p-4 flex items-center justify-between border border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-200">{importName}</span>
                {dataTypeBadge(apiResult.dataType)}
              </div>
              <div className="flex gap-4 text-xs">
                {hasKhata && <span className="text-orange-400 font-bold">{apiResult.khata.length} Khata</span>}
                {hasStock && <span className="text-emerald-400 font-bold">{apiResult.stock.length} Stock</span>}
                {hasSales && <span className="text-blue-400 font-bold">{apiResult.sales.length} Sales</span>}
                {hasLoans && <span className="text-amber-400 font-bold">{apiResult.loans.length} Loans</span>}
              </div>
            </div>

            {/* Khata table */}
            {hasKhata && (
              <Section title="Khata / Udhar Entries" icon={<BookOpen size={16} className="text-orange-400"/>}>
                <DataTable
                  headers={['Customer', 'Amount', 'Date', 'Note']}
                  rows={apiResult.khata.map((k: ImportedKhataEntry, idx: number) => [
                    <span key={`k-name-${idx}`} className="font-medium">{k.customerName}</span>,
                    <span key={`k-amt-${idx}`} className="text-orange-400 font-bold">₹{k.amount}</span>,
                    <span key={`k-date-${idx}`} className="text-slate-500 text-xs">{k.date || '—'}</span>,
                    <span key={`k-note-${idx}`} className="text-slate-500 text-xs">{k.note || '—'}</span>,
                  ])}
                />
              </Section>
            )}

            {/* Stock table */}
            {hasStock && (
              <Section title="Stock / Inventory" icon={<Package size={16} className="text-emerald-400"/>}>
                <DataTable
                  headers={['Product', 'Qty', 'Unit', 'Price']}
                  rows={apiResult.stock.map((s: ImportedStockEntry, idx: number) => [
                    <span key={`s-name-${idx}`} className="font-medium">{s.productName}</span>,
                    <span key={`s-qty-${idx}`} className="font-bold">{s.quantity}</span>,
                    <span key={`s-unit-${idx}`} className="text-slate-500 text-xs">{s.unit || '—'}</span>,
                    <span key={`s-price-${idx}`} className="text-emerald-400 font-bold">{s.price > 0 ? `₹${s.price}` : '—'}</span>,
                  ])}
                  align={['left','right','left','right']}
                />
              </Section>
            )}

            {/* Sales table */}
            {hasSales && (
              <Section title="Sales Records" icon={<ShoppingCart size={16} className="text-blue-400"/>}>
                <DataTable
                  headers={['Date', 'Amount', 'Payment', 'Note']}
                  rows={apiResult.sales.map((s: ImportedSaleEntry, idx: number) => [
                    <span key={`sa-date-${idx}`} className="text-slate-500 text-xs">{s.date || '—'}</span>,
                    <span key={`sa-amt-${idx}`} className="text-blue-400 font-bold">₹{s.totalAmount}</span>,
                    <span key={`sa-pay-${idx}`} className="text-xs">{s.paymentMethod || '—'}</span>,
                    <span key={`sa-note-${idx}`} className="text-xs text-slate-500">{s.note || '—'}</span>,
                  ])}
                />
              </Section>
            )}

            {/* Loans table */}
            {hasLoans && (
              <Section title="Loan Records" icon={<GitMerge size={16} className="text-amber-400"/>}>
                <DataTable
                  headers={['Lender / Borrower', 'Amount', 'Date', 'Note']}
                  rows={apiResult.loans.map((l: any, idx: number) => [
                    <span key={`l-name-${idx}`} className="font-medium text-slate-200">{l.lenderName}</span>,
                    <span key={`l-amt-${idx}`} className="text-amber-400 font-bold">₹{l.amount}</span>,
                    <span key={`l-date-${idx}`} className="text-slate-500 text-xs">{l.date || '—'}</span>,
                    <span key={`l-note-${idx}`} className="text-slate-500 text-xs">{l.note || '—'}</span>,
                  ])}
                />
              </Section>
            )}

            {!hasKhata && !hasStock && !hasSales && !hasLoans && (
              <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-800 rounded-xl px-4 py-3">
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
              <button onClick={handleCancel} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">Discard</button>
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
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <GitMerge size={20} className="text-emerald-500"/> Merge Into App
              </h2>
              <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X size={20}/></button>
            </div>

            {/* Date of the data */}
            <div className="space-y-2">
              <label className="block text-xs text-slate-400 uppercase font-bold flex items-center gap-2">
                <Calendar size={14}/> Date of this Data *
              </label>
              <input
                type="date"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={mergeOpts.date}
                max={todayISO()}
                onChange={e => setMergeOpts(o => ({ ...o, date: e.target.value }))}
              />
              <p className="text-xs text-slate-500">This date will be used for all merged transactions — helps filter by month/year in Udhar &amp; Stock logs.</p>
            </div>

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
              <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-800 rounded-xl px-4 py-3">
                <AlertCircle size={14}/> No sections selected — data will only be saved as an import record.
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('preview')}
                className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium hover:bg-slate-700 transition-colors">
                Back
              </button>
              <button onClick={handleSave}
                className="flex-1 bg-emerald-500 text-slate-900 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2">
                <Save size={18}/> Save &amp; Merge
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Saved Imports List ── */}
      {files.length > 0 && (step === 'idle' || step === 'done') && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-200">Saved Imports ({files.length})</h2>
          {files.map((f) => {
            const isOpen = expandedId === f.id;
            return (
              <Card key={f.id} className="bg-slate-900 border-slate-800">
                <CardContent className="p-0">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-800/40 transition-colors rounded-xl"
                    onClick={() => setExpandedId(isOpen ? null : f.id)}
                  >
                    <div className="flex-shrink-0">{fileTypeIcon(f.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-100 truncate">{f.name}</p>
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
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-800 pt-4">
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
        <tr className="text-xs text-slate-500 uppercase border-b border-slate-800">
          {headers.map((h, i) => (
            <th key={i} className={cn('py-1.5', i > 0 ? 'px-2' : 'pr-2',
              align?.[i] === 'right' ? 'text-right' : 'text-left')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((row, ri) => (
          <tr key={ri} className="text-slate-300">
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
    orange:  checked && !disabled ? 'border-orange-500/50 bg-orange-500/5'   : 'border-slate-700 bg-slate-800/50',
    emerald: checked && !disabled ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50',
    blue:    checked && !disabled ? 'border-blue-500/50 bg-blue-500/5'       : 'border-slate-700 bg-slate-800/50',
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
          checked && !disabled ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 bg-slate-800')}>
          {checked && !disabled && <CheckCircle size={14} className="text-slate-900" />}
        </div>
        {icon}
        <div className="flex-1">
          <p className="font-semibold text-slate-200 text-sm">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {preview && <div className="mt-3 pt-3 border-t border-slate-700/50">{preview}</div>}
    </div>
  );
}
