'use client';
import { parseVariantTitle, baseKey } from '@/lib/variantTitleParser';
import { useState, useRef, useEffect, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileSpreadsheet, FileImage, FileText, CheckCircle, Loader2, AlertCircle, ArrowLeft, Trash2, Camera, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Printer, Percent, Plus, Minus, PencilLine, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { useBusinessStore } from '@/lib/businessStore';
import { useUdharStore } from '@/lib/store';
import { isMillBillingPackage } from '@/lib/config/packageConfig';
import { EMPTY_MILL_BILL, freightMismatch, type MillBill } from '@/lib/millBill';
import { CHARGE_COLUMNS, getImportTemplate, applyTemplate, getAddableColumns } from '@/lib/importTemplates';
import { printLabelSheet } from '@/lib/printLabels';

type ImportType = 'product' | 'purchase' | 'stock' | 'suppliers' | 'customers' | 'sales' | 'ledger';
type Step = 'upload' | 'preview' | 'importing' | 'done';
type RowMatch = { status: 'new' | 'existing'; existingName?: string };
type RowDecision = 'update' | 'skip' | undefined;

/** Freight / hamali style charge names (English, Hindi, Marathi) — the mill's own truck and labour cost. */
const MILL_OWN_COST = /freight|hamali|haamali|transport|bhade|bhada|loading|unloading|हमाली|भाड|भाडे|मालs*भाड/i;

function MillField({ label, children }: { label: string; children: any }) { return (<label className="block text-[11px] font-semibold text-slate-500">{label}<div className="mt-0.5">{children}</div></label>); }

export default function ImportWizard({ importType, onBack }: { importType: ImportType; onBack: () => void }) {
  const t = useTranslations('Import');
  const { profile } = useBusinessStore();
  const [step, setStep] = useState<Step>('upload');
  const [confirmBack, setConfirmBack] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState('Analyzing document...');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [printingLabels, setPrintingLabels] = useState(false);
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
  // Relative (increase/decrease-by-%) price adjust for the review table —
  // separate from bulkEditField/bulkEditValue above, which only SET a flat
  // value. One shared amount+mode config powers two ways to apply it: bulk
  // "Apply to Selected" for ticked rows, or the per-row +/- next to any
  // single price cell — both read the same pctAdjustValue/pctAdjustMode so
  // the shopkeeper types the % once and can use either.
  const [pctAdjustField, setPctAdjustField] = useState<string>('');
  const [pctAdjustValue, setPctAdjustValue] = useState<string>('');
  const [pctAdjustMode, setPctAdjustMode] = useState<'percent' | 'amount'>('percent');
  const [pctAdjustNote, setPctAdjustNote] = useState<string>('');

  // Purchase-invoice supplier panel. Only shown when importType === 'purchase'.
  // Prefilled from the first extracted row and matched against existing
  // suppliers by name — an existing match surfaces the current balance and
  // credit limit so the shopkeeper can see the impact before importing.
  const [purchaseSupplier, setPurchaseSupplier] = useState({
    name: '', mobile: '', gst: '', address: '',
    creditDays: '', creditLimit: '', paidAmount: '', batchNumber: '',
  });
  // Bill-level charges read from the bill (hamali, freight, loading …) — editable here, stored on the purchase, never as products.
  const [purchaseBroker, setPurchaseBroker] = useState({ name: '', commission: '' });
  const [purchaseCharges, setPurchaseCharges] = useState<{ name: string; amount: string }[]>([]);
  // Bada Udyog only: truck / driver / freight read from the mill purchase bill. Stays empty (and unused) for every other package.
  const [millBill, setMillBill] = useState<MillBill | null>(null);
  const [millOpts, setMillOpts] = useState({ gateEntry: true, freight: true, lots: true, advancePaidBy: 'seller' as 'seller' | 'mill' | 'skip' });
  const [supplierMatch, setSupplierMatch] = useState<null | {
    id: string; name: string; balance: number; creditLimit: number; creditDays: number;
  }>(null);
  const [supplierLookupDone, setSupplierLookupDone] = useState(false);

  // Preview pagination — every row is editable, not just the first 50.
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalPages = Math.max(1, Math.ceil(previewData.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, previewData.length);

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

  // Prefill the purchase-invoice supplier panel from the first extracted row
  // (name / mobile / GST / address), keeping any value the shopkeeper has
  // already typed. Runs whenever the preview data changes, so re-uploading a
  // fresh bill updates the panel without clobbering manual edits.
  useEffect(() => {
    if (importType !== 'purchase' || previewData.length === 0) return;
    const first = previewData[0] || {};
    const pick = (keys: string[]) => {
      for (const k of Object.keys(first)) {
        if (keys.includes(k.toLowerCase().replace(/[\s_-]/g, ''))) return String(first[k] ?? '').trim();
      }
      return '';
    };
    setPurchaseSupplier(prev => ({
      name: prev.name || pick(['supplier', 'vendorname', 'vendor', 'suppliername']),
      mobile: prev.mobile || pick(['suppliermobile', 'mobile', 'phone']),
      gst: prev.gst || pick(['suppliergst', 'gst', 'gstin']),
      address: prev.address || pick(['supplieraddress', 'address']),
      creditDays: prev.creditDays,
      creditLimit: prev.creditLimit,
      paidAmount: prev.paidAmount,
      batchNumber: prev.batchNumber,
    }));
    setSupplierLookupDone(false);
  }, [importType, previewData]);

  // Look up an existing supplier by name (debounced), so the panel can show
  // "already in your suppliers, current balance ₹X, credit limit ₹Y" before
  // the import runs — nothing gets updated until Import is clicked.
  useEffect(() => {
    if (importType !== 'purchase') return;
    const name = purchaseSupplier.name.trim();
    if (!name) { setSupplierMatch(null); setSupplierLookupDone(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/crm/suppliers');
        const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const hit = list.find(s => String(s.name || '').trim().toLowerCase() === name.toLowerCase());
        setSupplierMatch(hit
          ? { id: hit.id, name: hit.name, balance: Number(hit.balance) || 0, creditLimit: Number(hit.creditLimit) || 0, creditDays: Number(hit.creditDays) || 0 }
          : null);
      } catch {
        setSupplierMatch(null);
      } finally {
        setSupplierLookupDone(true);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [importType, purchaseSupplier.name]);

  // Recovery: if a previous streaming import for this type was interrupted, restore
  // the saved rows and surface a "Resume from row X" button — never restart at row 1.
  useEffect(() => {
    try {
      const key = `ks_import_job_${importType}`;
      const cp = localStorage.getItem(key);
      const dataRaw = localStorage.getItem(`${key}_data`);
      if (!cp || !dataRaw) return;
      const { importLogId, offset, total } = JSON.parse(cp);
      const saved = JSON.parse(dataRaw);
      if (saved?.rows?.length && (offset ?? 0) < (total ?? saved.rows.length)) {
        setHeaders(saved.headers || []);
        setPreviewData(saved.rows);
        setRowDecisions(saved.decisions || new Array(saved.rows.length).fill(undefined));
        setResumeState({ importLogId: importLogId || null, offset: offset || 0 });
        setStep('preview');
      }
    } catch { /* ignore corrupt/absent checkpoint */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importType]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [extractionStats, setExtractionStats] = useState<any>(null);
  // Live streaming-import progress (null when not saving).
  const [progress, setProgress] = useState<null | {
    processed: number; total: number; created: number; updated: number; skipped: number; failed: number;
    batch: number; totalBatches: number; rps: number; etaSec: number; stage: string;
  }>(null);
  // Set when a streaming import was interrupted so the user can resume (no restart).
  const [resumeState, setResumeState] = useState<null | { importLogId: string | null; offset: number }>(null);

  // Shared entry point for both spreadsheet and AI-extracted rows: reshape into
  // the canonical template (so missing columns show as blank/fillable), then ask
  // the server which rows already exist.
  const loadRows = async (rawRows: any[], rawHeaders: string[]) => {
    const template = getImportTemplate(importType, profile?.businessType);
    const { rows, headers: displayHeaders } = applyTemplate(rawRows, rawHeaders, template);
    setHeaders(displayHeaders);
    setPreviewData(rows);
    // Select EVERY extracted row by default so the whole file imports — never
    // just the first screenful. The user can still deselect individual rows.
    setSelectedRows(rows.map((_, i) => i));
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

  const compressImageClientSide = async (file: File, maxWidth = 1024): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              resolve(file); // fallback
            }
          }, 'image/jpeg', 0.6);
        } else {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
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

            // Decide once how to read this PDF: sample the first pages for real,
            // selectable text. A text-based PDF (exported report / invoice) is
            // sent RAW so the server extracts EVERY page's text — no page cap,
            // no lossy rasterisation. Only a scanned/image PDF falls back to
            // rendering each page to an image for vision OCR.
            let sampledText = '';
            const sampleCount = Math.min(pdf.numPages, 3);
            for (let i = 1; i <= sampleCount; i++) {
              try {
                const tc = await (await pdf.getPage(i)).getTextContent();
                sampledText += tc.items.map((it: any) => it.str).join(' ');
              } catch {}
            }
            const hasRealText = sampledText.replace(/\s/g, '').length > 40;

            if (hasRealText) {
              // Server pdf-parse reads all pages; chunker processes all rows.
              setLoadingText(`Reading PDF ${file.name} (${pdf.numPages} pages)...`);
              filesToSend.push(file);
            } else {
              // Scanned PDF → render each page to an image for OCR. Cap matches
              // the server's per-request image limit (env-configurable) so
              // pages aren't silently dropped on 100+ page documents.
              const maxImages = Math.max(1, Number(process.env.NEXT_PUBLIC_IMPORT_MAX_IMAGES) || 200);
              const numPages = Math.min(pdf.numPages, maxImages);
              for (let i = 1; i <= numPages; i++) {
                setLoadingText(`Converting scanned PDF ${file.name} (Page ${i} of ${numPages})...`);
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  await page.render({ canvasContext: ctx, viewport }).promise;
                  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.6));
                  if (blob) {
                    filesToSend.push(new File([blob], `${file.name}-page${i}.jpg`, { type: 'image/jpeg' }));
                  }
                }
              }
            }
          } else if (file.type.startsWith('image/')) {
            setLoadingText(`Compressing image ${file.name}...`);
            const compressed = await compressImageClientSide(file);
            filesToSend.push(compressed);
          } else {
            filesToSend.push(file);
          }
        }

        if (filesToSend.length > 0) {
          const pageCount = filesToSend.filter(f => f.name.includes('-page')).length;
          const imgCount = filesToSend.length - (pageCount > 0 ? pageCount : 0);
          const countLabel = filesToSend.length === 1
            ? '1 file'
            : pageCount > 0
              ? `${pageCount} pages`
              : `${filesToSend.length} files`;
          setLoadingText(`Scanning ${countLabel} with AI — please wait...`);
          const fd = new FormData();
          filesToSend.forEach(f => fd.append('files[]', f));
          fd.append('targetType', importType);
          fd.append('businessType', profile?.businessType || 'general');
          
          try {
            const res = await api.post('/wholesale-import/analyze', fd);
            const data = res.data;
            if (data.stats) setExtractionStats(data.stats);
            if (importType === 'purchase' && isMillBillingPackage(profile?.packageType) && data.millBill) {
              const mb: MillBill = { ...EMPTY_MILL_BILL, ...data.millBill, sellerBank: { ...EMPTY_MILL_BILL.sellerBank, ...(data.millBill.sellerBank || {}) } };
              setMillBill(mb);
              setPurchaseSupplier(prev => ({ ...prev, mobile: prev.mobile || mb.supplierMobile, gst: prev.gst || mb.supplierGstin, address: prev.address || mb.supplierAddress }));
              if (mb.broker) setPurchaseBroker(b => ({ ...b, name: b.name || mb.broker }));
            }
            // Bada Udyog: freight and hamali on a mill bill are the MILL's own cost (truck / labour), recorded by the mill panel below — not
            // supplier charges added to what the supplier is owed. Every other package keeps all charges exactly as before.
            if (importType === 'purchase') setPurchaseCharges((Array.isArray(data.charges) ? data.charges : []).filter((ch: any) => !(isMillBillingPackage(profile?.packageType) && MILL_OWN_COST.test(String(ch?.name || '')))).map((c: any) => ({ name: String(c.name || ''), amount: String(c.amount ?? '') })));

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

  // "Enter Manually" — skips the file/AI step entirely and drops straight
  // into the same review table a scan produces, pre-built with this import
  // type's real column set (Name/Qty/Price/GST% etc., business-type aware)
  // so the shopkeeper can type rows in by hand instead of scanning a bill.
  const startManualEntry = () => {
    const template = getImportTemplate(importType, profile?.businessType);
    const templateHeaders = template.map(c => c.label);
    const blankRow = () => templateHeaders.reduce((acc, h) => ({ ...acc, [h]: '' }), {} as any);
    const initialRows = Array.from({ length: 5 }, blankRow);
    setHeaders(templateHeaders);
    setPreviewData(initialRows);
    setSelectedRows([]);
    setRowDecisions(new Array(initialRows.length).fill(undefined));
    setRowMatches([]);
    setErrors([]);
    setFiles([]);
    setCurrentPage(1);
    setStep('preview');
  };

  // Adds one more blank, typeable row at the end of the review table — used
  // both while typing a manual entry and to add an extra line to a scanned
  // file's preview.
  const handleAddRow = () => {
    const blank = headers.reduce((acc, h) => ({ ...acc, [h]: '' }), {} as any);
    setPreviewData(prev => [...prev, blank]);
    setRowMatches(prev => [...prev, undefined as any]);
    setRowDecisions(prev => [...prev, undefined]);
    setCurrentPage(Math.max(1, Math.ceil((previewData.length + 1) / pageSize)));
  };

  // "+ Column" — real Product fields (Brand, Location, Grade, Variety, …)
  // that aren't part of the default review columns, offered here instead of
  // showing them in every import. Picking one adds it to every row (blank,
  // fillable), same as a template column the file itself had.
  const addableColumns = getAddableColumns(importType, isMillBillingPackage(profile?.packageType)).filter(c => !headers.includes(c.label));
  const handleAddColumn = (label: string) => {
    if (!label || headers.includes(label)) return;
    setHeaders(prev => [...prev, label]);
    setPreviewData(prev => prev.map(row => ({ ...row, [label]: row[label] ?? '' })));
  };

  // ── Split "JAANZARA TG0968CD 36X40 PLAIN" into name + Size + Colour ─────────────────────────────
  // Suggests, never forces: the shopkeeper clicks the button, sees the new columns in the editable
  // table, can fix any cell (or undo), and only then imports. Rows that end up with the same
  // Product Name are saved by the server as ONE product with colour/size variants.
  const canSplitTitles = ['product', 'purchase', 'stock'].includes(importType)
    && headers.includes('Product Name') && headers.includes('Colour') && headers.includes('Size');
  const splittableCount = canSplitTitles
    ? previewData.filter(r => !String(r['Colour'] ?? '').trim() && !String(r['Size'] ?? '').trim()
        && parseVariantTitle(String(r['Product Name'] ?? '')).confidence !== 'low').length
    : 0;
  const splitDoneCount = canSplitTitles ? previewData.filter(r => r.__origName !== undefined).length : 0;
  const productCountAfterSplit = canSplitTitles
    ? new Set(previewData.map(r => baseKey(String(r['Product Name'] ?? ''))).filter(Boolean)).size
    : 0;

  const refreshMatches = async (rows: any[]) => {
    setCheckingMatches(true);
    try {
      const res = await api.post('/wholesale-import/check-matches', { importType, data: rows });
      setRowMatches(res.data?.matches || []);
    } catch { setRowMatches([]); } finally { setCheckingMatches(false); }
  };

  const splitTitles = async () => {
    const rows = previewData.map(r => {
      if (String(r['Colour'] ?? '').trim() || String(r['Size'] ?? '').trim()) return r;
      const p = parseVariantTitle(String(r['Product Name'] ?? ''));
      if (p.confidence === 'low') return r;
      return { ...r, __origName: r['Product Name'], 'Product Name': p.baseName, Size: p.size, Colour: p.color };
    });
    setPreviewData(rows);
    validateData(rows, headers);
    setRowDecisions(new Array(rows.length).fill(undefined));
    await refreshMatches(rows);
  };

  const undoSplitTitles = async () => {
    const rows = previewData.map(r => {
      if (r.__origName === undefined) return r;
      const { __origName, ...rest } = r;
      return { ...rest, 'Product Name': __origName, Size: '', Colour: '' };
    });
    setPreviewData(rows);
    validateData(rows, headers);
    setRowDecisions(new Array(rows.length).fill(undefined));
    await refreshMatches(rows);
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
      // Select ALL rows (not just the rendered preview) so the entire file imports.
      setSelectedRows(previewData.map((_, i) => i));
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

  // Canonical price-column labels this review table can ever show — see
  // lib/importTemplates.ts (productColumns has MRP/Selling Price/Cost Price;
  // the 'purchase' template has MRP/Unit Cost only, no Selling Price).
  const PRICE_FIELD_LABELS = ['MRP', 'Selling Price', 'Cost Price', 'Unit Cost'];
  const priceHeaders = headers.filter(h => PRICE_FIELD_LABELS.includes(h));

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const computeAdjustedCell = (oldVal: string, value: number, mode: 'percent' | 'amount'): string => {
    const n = Number(oldVal) || 0;
    const next = mode === 'percent' ? n * (1 + value / 100) : n + value;
    return String(Math.max(0, round2(next)));
  };

  // Bulk path — every currently-ticked row's pctAdjustField, in one go.
  // A %-based bump on a blank/zero cell can only ever stay zero (0 × 1.25 =
  // 0), so those rows are skipped rather than silently "succeeding" with no
  // visible change — matches RetailImport.tsx's applyMarkup() `bump()` guard.
  const applyPctAdjust = () => {
    const v = Number(pctAdjustValue);
    if (!pctAdjustField) { setPctAdjustNote('Pick a field first'); return; }
    if (!isFinite(v) || v === 0) { setPctAdjustNote('Enter a non-zero value first'); return; }
    if (selectedRows.length === 0) { setPctAdjustNote('Select at least one row first, or use the +/- next to a single row'); return; }
    let touched = 0;
    setPreviewData(prev => {
      const next = [...prev];
      selectedRows.forEach(i => {
        const oldVal = Number(next[i][pctAdjustField]) || 0;
        if (pctAdjustMode === 'percent' && oldVal <= 0) return; // nothing to take a % of
        next[i] = { ...next[i], [pctAdjustField]: computeAdjustedCell(String(next[i][pctAdjustField] ?? ''), v, pctAdjustMode) };
        touched++;
      });
      return next;
    });
    const label = v > 0 ? `+${v}` : `${v}`;
    const unit = pctAdjustMode === 'percent' ? '%' : '₹';
    if (touched === 0) {
      setPctAdjustNote(`None of the selected rows have a ${pctAdjustField} value yet — a % increase needs an existing amount to work from. Set a starting ${pctAdjustField} first (type it in directly, or use "Fill Missing Only" below), or switch to ₹ to add a fixed amount instead.`);
    } else if (touched < selectedRows.length) {
      setPctAdjustNote(`Updated ${pctAdjustField} on ${touched} of ${selectedRows.length} row(s) by ${label}${unit} — ${selectedRows.length - touched} row(s) skipped (no existing ${pctAdjustField} value to adjust).`);
    } else {
      setPctAdjustNote(`Updated ${pctAdjustField} on ${touched} row(s) by ${label}${unit}`);
    }
  };

  // Single-row path — the little +/- next to one price cell, independent of
  // any row selection. Reuses the same typed amount + %/₹ mode above.
  const nudgeCell = (rowIndex: number, header: string, sign: 1 | -1) => {
    const v = Number(pctAdjustValue);
    if (!isFinite(v) || v === 0) { setPctAdjustNote('Type a % or ₹ amount above first'); return; }
    setPreviewData(prev => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [header]: computeAdjustedCell(String(next[rowIndex][header] ?? ''), sign * v, pctAdjustMode) };
      return next;
    });
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

  // Configurable client batch size (mirrors server databaseBatchSize).
  const DB_BATCH_SIZE = Math.max(1, Number(process.env.NEXT_PUBLIC_IMPORT_DB_BATCH_SIZE) || 100);
  const RESUME_KEY = `ks_import_job_${importType}`;

  /**
   * Streaming import: the file is saved in batches of DB_BATCH_SIZE rows, one
   * request per batch, each incrementing a single durable ImportLog job. Progress
   * (rows / batch / speed / ETA) updates live and a checkpoint is persisted after
   * every batch so a failure resumes from the next unsaved row — never page 1.
   */
  const handleExecuteImport = async (startOffset = 0, existingLogId: string | null = null) => {
    setIsProcessing(true);
    setResumeState(null);
    const total = previewData.length;
    const totalBatches = Math.ceil(total / DB_BATCH_SIZE);
    const t0 = Date.now();
    let importLogId = existingLogId;
    let offset = startOffset;
    const acc = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const allProductIds: string[] = [];
    const allErrors: string[] = [];
    let billPhotoAttachFailed = false;
    let millSupplierId: string | null = null;
    let millExtrasResult: any = null;
    // Plain local var, NOT the `progress` state — this whole function runs as
    // one long-lived async closure, so reading React state mid-function only
    // ever sees the value from when the function was first called (state
    // updates re-render the component, they don't refresh a closure already
    // in flight). A local var is the only way a later batch's simulated
    // speed can actually pick up an earlier batch's REAL measured speed.
    let lastRealRps = 0;
    setProgress({ processed: offset, total, created: 0, updated: 0, skipped: 0, failed: 0,
      batch: Math.floor(offset / DB_BATCH_SIZE), totalBatches, rps: 0, etaSec: 0, stage: 'Saving products…' });

    // Persist the dataset ONCE so a tab reload mid-import can restore rows and
    // resume. Guarded — very large files may exceed localStorage; in-session
    // resume still works even if this write is skipped.
    if (startOffset === 0) {
      try {
        localStorage.setItem(`${RESUME_KEY}_data`, JSON.stringify({ rows: previewData, decisions: rowDecisions, headers, fileName: files[0]?.name || null, importType }));
      } catch { /* quota — reload-resume unavailable for this file, in-session still works */ }
    }

    try {
      for (let b = Math.floor(offset / DB_BATCH_SIZE); offset < total; b++) {
        const sliceStart = offset;
        const slice = previewData.slice(offset, offset + DB_BATCH_SIZE).map(({ __origName, ...r }: any) => r);
        const sliceDecisions = rowDecisions.slice(offset, offset + DB_BATCH_SIZE);
        const sliceCount = slice.length;

        // The progress bar/stats only advance once per BATCH (one HTTP round
        // trip), not per row — so whenever a batch's row count is >= the
        // whole import (the common case: most shopkeeper imports are a
        // dozen-odd rows from one bill, well under DB_BATCH_SIZE's default
        // of 100), the bar sat frozen at its starting value for the entire
        // request, then jumped straight to "done" with no visible movement
        // in between. Simulate a smooth, honest-effort creep forward while
        // this batch's request is in flight — clamped to 95% of the slice so
        // it can never claim a row is saved before the server confirms it —
        // then the real numbers below always win once the response lands.
        const assumedRps = lastRealRps > 0 ? lastRealRps : 4;
        const simCap = sliceStart + Math.max(1, Math.floor(sliceCount * 0.95));
        const simStartedAt = Date.now();
        const simInterval = setInterval(() => {
          const elapsed = (Date.now() - simStartedAt) / 1000;
          const simulated = Math.min(simCap, sliceStart + Math.floor(elapsed * assumedRps));
          const simRps = elapsed > 0.5 ? Math.round(simulated / elapsed) : assumedRps;
          const remaining = total - simulated;
          const simEta = simRps > 0 ? Math.round(remaining / simRps) : 0;
          setProgress(prev => prev ? {
            ...prev,
            processed: simulated,
            batch: b + 1,
            rps: simRps,
            etaSec: simEta,
            stage: 'Saving products…',
          } : prev);
        }, 250);

        // Retry the batch up to 2 times; on final failure we stop and offer resume.
        let res: any = null;
        try {
          for (let attempt = 0; attempt < 2 && !res; attempt++) {
            try {
              res = await api.post('/wholesale-import/execute', {
                importType, data: slice, godownId: selectedGodown, existingPolicy,
                rowDecisions: sliceDecisions,
                fileName: files[0]?.name || null,
                stats: offset === 0 ? extractionStats : null,
                totalRows: total,
                importLogId,
                // Purchase-invoice supplier panel overrides — only sent for the
                // first batch of a purchase import so the server doesn't re-apply
                // enrichment / re-increment balance on every subsequent chunk.
                supplier: (importType === 'purchase' && offset === 0) ? purchaseSupplier : undefined,
                broker: (importType === 'purchase' && offset === 0 && isMillBillingPackage(profile?.packageType) && purchaseBroker.name.trim()) ? purchaseBroker : undefined,
                charges: (importType === 'purchase' && offset === 0) ? [
                  ...purchaseCharges.filter(c => c.name.trim() || c.amount !== '').map(c => ({ name: c.name.trim(), amount: c.amount })),
                  // Charge columns added to the review table (Hamali, Freight …): one bill per import, so each column's total is one bill charge.
                  ...CHARGE_COLUMNS.filter(l => headers.includes(l) && !(isMillBillingPackage(profile?.packageType) && MILL_OWN_COST.test(l))).map(l => ({ name: l, amount: previewData.reduce((a, r) => a + (parseFloat(String(r[l] ?? '').replace(/[₹,\s]/g, '')) || 0), 0) })).filter(c => c.amount > 0),
                ] : undefined,
              });
            } catch (e) {
              if (attempt === 1) throw e;
            }
          }
        } finally {
          clearInterval(simInterval);
        }
        const s = res.data.summary || {};
        importLogId = s.importLogId || importLogId;
        if (s.supplierId && !millSupplierId) millSupplierId = s.supplierId;
        acc.created += s.created || 0; acc.updated += s.updated || 0;
        acc.skipped += s.skipped || 0; acc.failed += (s.failed ?? (s.rowErrors?.length || 0));
        if (Array.isArray(s.rowErrors)) allErrors.push(...s.rowErrors);
        if (Array.isArray(s.productIds)) allProductIds.push(...s.productIds);

        // Auto-attach the scanned bill photo(s) to the supplier's Payment
        // History row that this import just created — otherwise the shopkeeper
        // has to re-upload the same file they already scanned. Only fires on
        // the first batch of a purchase import (that's the only batch that
        // creates the SupplierTransaction, and where server returns supplier
        // ids). Best-effort: any failure here just leaves the import as-is;
        // the products/stock changes are already committed.
        //
        // Retries each upload once — this step runs immediately after the
        // main import's own DB writes, right when the connection pool is
        // still under the most load, so a single transient "too many
        // connections" blip here (observed live) silently dropped the photo
        // even though the invoice/supplier/products all saved fine. A short
        // pause + one retry rides out that same transient window instead of
        // giving up on the first hiccup; `billPhotoAttachFailed` still
        // surfaces on the done screen if it fails twice, so the shopkeeper
        // knows to attach it manually rather than assuming it's there.
        if (importType === 'purchase' && s.supplierId && s.supplierTransactionId && files.length > 0) {
          try {
            // /suppliers/[id] has no GET; use the transactions endpoint which
            // returns supplier.documents alongside the ledger — that's what
            // the Suppliers page itself reads to hydrate the Bill Photos strip.
            const supplierRes = await api.get(`/suppliers/${s.supplierId}/transactions`);
            const existingDocs: any[] = supplierRes.data?.supplier?.documents || [];
            const newDocs: any[] = [];
            for (const file of files) {
              let up: any = null;
              for (let attempt = 0; attempt < 2 && !up; attempt++) {
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('folder', 'supplier-docs');
                  up = await api.post('/upload', fd);
                } catch (uploadErr) {
                  if (attempt === 1) throw uploadErr;
                  await new Promise(r => setTimeout(r, 1500));
                }
              }
              if (up?.data?.url) {
                newDocs.push({
                  id: crypto.randomUUID(),
                  url: up.data.url,
                  uploadedAt: new Date().toISOString(),
                  name: file.name || undefined,
                  transactionId: s.supplierTransactionId,
                });
              }
            }
            if (newDocs.length > 0) {
              await api.patch(`/suppliers/${s.supplierId}`, { documents: [...existingDocs, ...newDocs] });
            }
            if (newDocs.length < files.length) billPhotoAttachFailed = true;
          } catch (billPhotoErr) {
            console.warn('Auto-attach scanned bill to supplier failed:', billPhotoErr);
            billPhotoAttachFailed = true;
          }
        }

        offset = Math.min(offset + DB_BATCH_SIZE, total);
        const elapsed = (Date.now() - t0) / 1000;
        const doneThisRun = offset - startOffset;
        const rps = elapsed > 0 ? doneThisRun / elapsed : 0;
        if (rps > 0) lastRealRps = rps;
        setProgress({ processed: offset, total, ...acc, batch: b + 1, totalBatches,
          rps: Math.round(rps), etaSec: rps > 0 ? Math.round((total - offset) / rps) : 0, stage: 'Saving products…' });

        // Durable checkpoint → resume-from-here if the tab reloads mid-import.
        try { localStorage.setItem(RESUME_KEY, JSON.stringify({ importLogId, offset, total, fileName: files[0]?.name || null })); } catch {}
      }

      if (importType === 'purchase' && isMillBillingPackage(profile?.packageType) && millBill && millSupplierId && (millOpts.gateEntry || millOpts.freight || millOpts.lots)) {
        try {
          const first = previewData[0] || {};
          const invKey = Object.keys(first).find(k => ['invoicenumber', 'billnumber', 'invoice'].includes(k.toLowerCase().replace(/[\s_-]/g, '')));
          const inv = invKey ? String(first[invKey] ?? '').trim() : '';
          const mr = await api.post('/mill/purchase-extras', { supplierId: millSupplierId, invoiceNumber: inv || undefined, millBill, options: millOpts });
          millExtrasResult = { ok: true, ...mr.data };
        } catch (me: any) {
          millExtrasResult = { ok: false, error: me?.response?.data?.error || me?.message || 'Failed', supplierId: millSupplierId };
        }
      }
      localStorage.removeItem(RESUME_KEY);
      try { localStorage.removeItem(`${RESUME_KEY}_data`); } catch {}
      setSummary({ millExtras: millExtrasResult, totalProcessed: total, created: acc.created, updated: acc.updated, skipped: acc.skipped, rowErrors: allErrors, productIds: allProductIds, billPhotoAttachFailed });
      setStep('done');
      import('swr').then(({ mutate }) => {
        mutate(key => typeof key === 'string' && key.startsWith('/products'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/master-data'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/customers'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/godowns'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/billing'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/suppliers'), undefined, { revalidate: true });
        mutate(key => typeof key === 'string' && key.startsWith('/activity'), undefined, { revalidate: true });
      });
      useUdharStore.getState().silentRefresh();
    } catch (err: any) {
      // Completed batches are already saved server-side. Offer to resume from `offset`.
      setResumeState({ importLogId, offset });
      const errorData = err.response?.data || {};
      alert(`Import paused at row ${offset} of ${total}. ${offset} rows already saved — click "Resume Import" to continue from here.\n\n${errorData.error || errorData.detail || err.message || ''}`);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // Print labels for exactly what this import touched. The execute route
  // only returns ids (see app/api/v1/wholesale-import/execute/route.ts) —
  // fetch full rows once here rather than growing the response per-batch.
  const handlePrintImportedLabels = async () => {
    const ids: string[] = summary?.productIds || [];
    if (ids.length === 0) return;
    setPrintingLabels(true);
    try {
      const res = await api.get('/products');
      const idSet = new Set(ids);
      const imported = (res.data || []).filter((p: any) => idSet.has(p.id));

      // Neither import path forces a barcode when the file doesn't provide
      // one (unlike the Add-Product form), so persist a real code for any
      // row missing one BEFORE printing it — the same "never print something
      // that isn't also saved" fix as BarcodeQRModal.tsx, otherwise the
      // label would encode a value the scanner can never resolve back.
      const rows = await Promise.all(imported.map(async (p: any) => {
        let barcode = p.barcode;
        if (!barcode) {
          barcode = `PRD-${String(p.id).substring(0, 8).toUpperCase()}`;
          try { await api.put(`/products/${p.id}`, { barcode }); } catch { /* best-effort, matches BarcodeQRModal's own fallback */ }
        }
        return { name: p.name, barcode, sellingPrice: p.sellingPrice, mrp: p.mrp };
      }));

      await printLabelSheet(rows, { title: `${importType === 'purchase' ? 'Purchase Import' : 'Stock Import'} — Labels` });
    } catch (err) {
      console.error('Failed to print import labels:', err);
      alert('Failed to load products for printing. Try again from the Products page instead.');
    } finally {
      setPrintingLabels(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => {
            if (step === 'preview' && previewData.length > 0) {
              setConfirmBack(true);
              return;
            }
            onBack();
          }} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft size={20} /> Back to Import Types
          </button>
          {confirmBack && (
            <div className="flex items-center gap-2 text-sm bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-1.5">
              <span className="text-red-700 dark:text-red-400 font-medium">Discard {previewData.length} rows?</span>
              <button onClick={onBack} className="px-2 py-0.5 bg-red-600 text-white rounded font-bold text-xs hover:bg-red-700">Yes</button>
              <button onClick={() => setConfirmBack(false)} className="px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">No</button>
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold capitalize text-slate-900 dark:text-white">
          {importType.replace('-', ' ')} Import
        </h2>
      </div>

      {step === 'upload' && (
        <Card className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <CardContent className="p-12">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept=".csv,.xlsx,.xls,.pdf,image/*" />
            {/* Camera capture — on a phone this opens the rear camera directly so
                the shopkeeper can photograph a supplier bill / stock list. */}
            <input type="file" ref={cameraInputRef} onChange={handleFileChange} className="hidden" accept="image/*" capture="environment" />
            
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${
                isProcessing
                  ? 'border-emerald-400/40 bg-slate-50 dark:bg-slate-900/60 pointer-events-none'
                  : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-500/5'
              }`}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-10 w-full max-w-xs">
                  {/* Icon with progress ring */}
                  <div className="relative mb-6">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-700" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                        className="text-emerald-500"
                        strokeDasharray="213"
                        strokeDashoffset="53"
                        style={{ animation: 'dash 2s ease-in-out infinite' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <FileText size={26} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>

                  <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">Analysing your file…</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">{loadingText.replace(/^🤖\s*/,'')}</p>

                  <style>{`
                    @keyframes dash {
                      0%   { stroke-dashoffset: 213; }
                      50%  { stroke-dashoffset: 0; }
                      100% { stroke-dashoffset: -213; }
                    }
                  `}</style>
                </div>
              ) : (
                <>
                  <Upload size={48} className="text-slate-400 mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Drop your file here</h3>
                  <p className="text-slate-500 text-sm mb-6">Supports CSV, Excel, PDF, and Images</p>
                  
                  <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center max-w-sm">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                      💡 Note: The AI reads the ENTIRE file — every page and every row — before showing results. Text PDFs are read in full (all pages, hundreds/thousands of rows); scanned PDFs and photos are read page-by-page. Large files just take a little longer.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button className="bg-emerald-500 text-slate-900 px-6 py-2.5 rounded-xl font-bold hover:bg-emerald-400 transition-colors">
                      Browse Files
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                      className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-6 py-2.5 rounded-xl font-bold hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      <Camera size={18} /> Take Photo
                    </button>
                  </div>

                  <div className="flex items-center gap-3 w-full max-w-xs my-5">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-[11px] font-bold uppercase text-slate-400">or</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startManualEntry(); }}
                    className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-6 py-2.5 rounded-xl font-bold hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <PencilLine size={18} /> Enter Manually
                  </button>
                  <p className="text-slate-400 text-xs mt-2">No file? Type the rows in yourself — same table you'd get from a scan.</p>
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
                {canSplitTitles && splittableCount > 0 && (
                  <button
                    type="button"
                    onClick={splitTitles}
                    disabled={isProcessing}
                    title="Splits names like 'JAANZARA TG0968CD 36X40 PLAIN' into name + Size + Colour so one model becomes ONE product with variants"
                    className="flex items-center gap-1.5 px-3 py-2 border border-violet-400 bg-violet-50 dark:bg-violet-500/10 rounded-lg text-violet-700 dark:text-violet-300 font-semibold hover:bg-violet-100 dark:hover:bg-violet-500/20 text-sm"
                  >
                    Split size &amp; colour from name ({splittableCount})
                  </button>
                )}
                {canSplitTitles && splitDoneCount > 0 && (
                  <button
                    type="button"
                    onClick={undoSplitTitles}
                    disabled={isProcessing}
                    title={`${splitDoneCount} rows split — ${productCountAfterSplit} products after grouping. Click to restore the original names.`}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-amber-500 text-sm"
                  >
                    Undo split · {productCountAfterSplit} products
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={isProcessing}
                  title="Add a blank row to type into"
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-50 text-sm font-bold"
                >
                  <PlusCircle size={15} /> Add Row
                </button>
                {addableColumns.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => handleAddColumn(e.target.value)}
                    disabled={isProcessing}
                    title="Add a product field as a new column"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-50 text-sm font-bold bg-white dark:bg-slate-900 cursor-pointer outline-none"
                  >
                    <option value="">+ Column</option>
                    {addableColumns.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                )}
                <button onClick={() => {
                  if (previewData.length > 0) {
                    const ok = window.confirm(
                      `Are you sure you want to cancel?\n\nThe scanned data (${previewData.length} rows) will be lost and you'll need to scan the file again.`
                    );
                    if (!ok) return;
                  }
                  setStep('upload');
                }} disabled={isProcessing} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                  Cancel
                </button>
                {resumeState ? (
                  <button
                    onClick={() => handleExecuteImport(resumeState.offset, resumeState.importLogId)}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-amber-500 text-slate-900 rounded-lg font-bold hover:bg-amber-400 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    Resume from row {resumeState.offset}
                  </button>
                ) : (
                  <button
                    onClick={() => handleExecuteImport()}
                    disabled={isProcessing || errors.length > 0 || willImportCount === 0}
                    className="px-6 py-2 bg-emerald-500 text-slate-900 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    Import {willImportCount} record{willImportCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Live Progress Engine ── */}
            {progress && (
              <div className="mb-5 p-5 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" /> {progress.stage}
                  </span>
                  <span className="text-sm font-mono text-slate-600 dark:text-slate-300">
                    {progress.processed} / {progress.total} rows
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-slate-500">Batch</span><br /><span className="font-bold text-slate-800 dark:text-slate-200">{progress.batch} / {progress.totalBatches}</span></div>
                  <div><span className="text-slate-500">Saved</span><br /><span className="font-bold text-emerald-600 dark:text-emerald-400">{progress.created + progress.updated}</span></div>
                  <div><span className="text-slate-500">Speed</span><br /><span className="font-bold text-slate-800 dark:text-slate-200">{progress.rps} rows/s</span></div>
                  <div><span className="text-slate-500">ETA</span><br /><span className="font-bold text-slate-800 dark:text-slate-200">{progress.etaSec > 0 ? `${progress.etaSec}s` : '—'}</span></div>
                </div>
              </div>
            )}

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

            {/* Purchase-invoice supplier panel — only for the 'purchase' flow.
                Confirm / edit the supplier before the import fires; the row grid
                below already handles per-product edits. */}
            {importType === 'purchase' && (
              <div className="mb-5 p-5 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      Supplier Details
                      {supplierLookupDone && supplierMatch && (
                        <span className="text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Existing supplier</span>
                      )}
                      {supplierLookupDone && !supplierMatch && purchaseSupplier.name.trim() && (
                        <span className="text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Will be created</span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Confirm before importing — the invoice total will be added to this supplier's balance and their Payment History.</p>
                  </div>
                  {supplierMatch && (
                    <div className="text-right text-[11px]">
                      <div className="text-slate-500">Current balance</div>
                      <div className={`font-black ${supplierMatch.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        ₹{Math.round(supplierMatch.balance).toLocaleString('en-IN')}
                      </div>
                      {supplierMatch.creditLimit > 0 && (
                        <div className="text-slate-400 mt-0.5">Limit ₹{Math.round(supplierMatch.creditLimit).toLocaleString('en-IN')}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Supplier Name *</span>
                    <input value={purchaseSupplier.name} onChange={e => setPurchaseSupplier(s => ({ ...s, name: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Sharma Traders" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Mobile</span>
                    <input value={purchaseSupplier.mobile} onChange={e => setPurchaseSupplier(s => ({ ...s, mobile: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" inputMode="numeric" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">GSTIN</span>
                    <input value={purchaseSupplier.gst} onChange={e => setPurchaseSupplier(s => ({ ...s, gst: e.target.value.toUpperCase() }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" maxLength={15} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Address</span>
                    <input value={purchaseSupplier.address} onChange={e => setPurchaseSupplier(s => ({ ...s, address: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Credit Days (payment terms)</span>
                    <input type="number" min="0" step="1" value={purchaseSupplier.creditDays} onChange={e => setPurchaseSupplier(s => ({ ...s, creditDays: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. 30" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Credit Limit (₹)</span>
                    <input type="number" min="0" step="1" value={purchaseSupplier.creditLimit} onChange={e => setPurchaseSupplier(s => ({ ...s, creditLimit: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. 50000" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Amount Paid Now (₹)</span>
                    <input type="number" min="0" step="1" value={purchaseSupplier.paidAmount} onChange={e => setPurchaseSupplier(s => ({ ...s, paidAmount: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0" />
                    <span className="block text-[10px] text-slate-400 mt-1">The rest becomes owed. Leave 0 if the whole bill is on credit.</span>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">Lot / Batch No. <span className="normal-case text-slate-400 font-normal">(optional)</span></span>
                    <input value={purchaseSupplier.batchNumber} onChange={e => setPurchaseSupplier(s => ({ ...s, batchNumber: e.target.value }))} className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. LOT-001" />
                    <span className="block text-[10px] text-slate-400 mt-1">Applied to all items on this bill. Rows with their own batch column take priority.</span>
                  </label>
                </div>
              </div>
            )}

            {importType === 'purchase' && (
              <div className="mb-5 p-5 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5" data-testid="import-charges">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Bill Charges</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-3">Hamali, freight, loading … read from the bill. They are added to this purchase and to what the supplier is owed — not to Products or Stock. Edit, add or remove any line.</p>
                {purchaseCharges.length === 0 && <p className="text-xs text-slate-400 mb-2">No charges found on the bill.</p>}
                <div className="space-y-2">
                  {purchaseCharges.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2 items-center">
                      <input value={c.name} onChange={e => setPurchaseCharges(list => list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Charge name (e.g. Hamali)"
                        className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm min-w-0" />
                      <input type="number" min="0" step="0.01" value={c.amount} onChange={e => setPurchaseCharges(list => list.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="₹"
                        className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
                      <button type="button" onClick={() => setPurchaseCharges(list => list.filter((_, j) => j !== i))} aria-label="Remove charge"
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button type="button" onClick={() => setPurchaseCharges(list => [...list, { name: '', amount: '' }])}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-dashed border-amber-500 text-amber-700 dark:text-amber-400">+ Add charge</button>
                  {purchaseCharges.length > 0 && (
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Charges total: ₹{purchaseCharges.reduce((a, c) => a + (Number(c.amount) > 0 ? Number(c.amount) : 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  )}
                </div>
                {isMillBillingPackage(profile?.packageType) && (
                  <div className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-500/20" data-testid="import-broker">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">Broker (optional)</h5>
                    <p className="text-[11px] text-slate-500 mb-2">A broker record is created in Party → Brokers (or reused) and the commission is logged as owed to them. It is not added to what the supplier is owed.</p>
                    <div className="grid grid-cols-[1fr_8rem] gap-2">
                      <input value={purchaseBroker.name} onChange={e => setPurchaseBroker(b => ({ ...b, name: e.target.value }))} placeholder="Broker name" className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm min-w-0" />
                      <input type="number" min="0" step="0.01" value={purchaseBroker.commission} onChange={e => setPurchaseBroker(b => ({ ...b, commission: e.target.value }))} placeholder="Commission ₹" className="h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {importType === 'purchase' && isMillBillingPackage(profile?.packageType) && millBill && (() => {
              const set = (k: keyof MillBill, v: any) => setMillBill(b => (b ? { ...b, [k]: v } : b));
              const num = (v: string) => (v === '' ? null : Number(v));
              const inp = 'h-9 px-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm min-w-0 w-full';
              const bad = freightMismatch(millBill);
              return (
                <div className="mb-5 p-5 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/5" data-testid="import-mill-bill">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Mill purchase details — truck, driver &amp; freight</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 mb-3">Read from the bill. Handwriting can be misread — please check names, mobile numbers and amounts before importing. Empty fields are simply skipped.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <MillField label="Truck number"><input className={inp} value={millBill.vehicleNumber} onChange={e => set('vehicleNumber', e.target.value.toUpperCase())} /></MillField>
                    <MillField label="Driver name"><input className={inp} value={millBill.driverName} onChange={e => set('driverName', e.target.value)} /></MillField>
                    <MillField label="Driver mobile"><input className={inp} inputMode="numeric" value={millBill.driverMobile} onChange={e => set('driverMobile', e.target.value.replace(/\D/g, '').slice(0, 10))} /></MillField>
                    <MillField label="Truck owner"><input className={inp} value={millBill.truckOwnerName} onChange={e => set('truckOwnerName', e.target.value)} /></MillField>
                    <MillField label="Owner mobile"><input className={inp} inputMode="numeric" value={millBill.truckOwnerMobile} onChange={e => set('truckOwnerMobile', e.target.value.replace(/\D/g, '').slice(0, 10))} /></MillField>
                    <MillField label="Transport company"><input className={inp} value={millBill.transportCompany} onChange={e => set('transportCompany', e.target.value)} /></MillField>
                    <MillField label="Total freight ₹"><input className={inp} type="number" min="0" value={millBill.freightTotal ?? ''} onChange={e => set('freightTotal', num(e.target.value))} /></MillField>
                    <MillField label="Advance ₹"><input className={inp} type="number" min="0" value={millBill.freightAdvance ?? ''} onChange={e => set('freightAdvance', num(e.target.value))} /></MillField>
                    <MillField label="Balance ₹"><input className={inp} type="number" min="0" value={millBill.freightBalance ?? ''} onChange={e => set('freightBalance', num(e.target.value))} /></MillField>
                    <MillField label="Hamali ₹"><input className={inp} type="number" min="0" value={millBill.hamali ?? ''} onChange={e => set('hamali', num(e.target.value))} /></MillField>
                    <MillField label="Total bags"><input className={inp} type="number" min="0" value={millBill.totalBags ?? ''} onChange={e => set('totalBags', num(e.target.value))} /></MillField>
                    <MillField label="Broker (commission is set in the Broker box above)"><input className={inp} value={millBill.broker} onChange={e => { set('broker', e.target.value); setPurchaseBroker(b => ({ ...b, name: e.target.value })); }} /></MillField>
                  </div>
                  {bad && <p className="mt-2 text-xs font-semibold text-red-600">Freight total must equal advance + balance — fix one of them.</p>}
                  {(millBill.sellerBank.bankName || millBill.sellerBank.accountNo) && (
                    <p className="mt-2 text-[11px] text-slate-500">Seller bank on the bill: {[millBill.sellerBank.bankName, millBill.sellerBank.branch, millBill.sellerBank.accountNo, millBill.sellerBank.ifsc].filter(Boolean).join(' · ')}</p>
                  )}
                  <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-500/20 space-y-1.5 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={millOpts.gateEntry} onChange={e => setMillOpts(o => ({ ...o, gateEntry: e.target.checked }))} /> Create inward Gate Entry (truck, driver{millBill.hamali ? ', hamali' : ''})</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={millOpts.freight} onChange={e => setMillOpts(o => ({ ...o, freight: e.target.checked }))} /> Record freight in the transporter's account</label>
                    {millOpts.freight && (millBill.freightAdvance ?? 0) > 0 && (
                      <div className="pl-6 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">Advance was paid by
                        <select className="h-8 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900" value={millOpts.advancePaidBy} onChange={e => setMillOpts(o => ({ ...o, advancePaidBy: e.target.value as any }))}>
                          <option value="seller">the seller (no cash out of the mill)</option>
                          <option value="mill">the mill (cash)</option>
                          <option value="skip">don't record the advance</option>
                        </select>
                      </div>
                    )}
                    <label className="flex items-center gap-2"><input type="checkbox" checked={millOpts.lots} onChange={e => setMillOpts(o => ({ ...o, lots: e.target.checked }))} /> Create Raw Material lot(s) for the milling stock</label>
                  </div>
                </div>
              );
            })()}

            {/* Price % Adjust — increase/decrease MRP / Cost / Selling by a %
                or ₹, either for every ticked row at once, or per-row via the
                +/- next to that row's own price cell (see the header note
                below). Kept separate from the generic "Select Field / New
                Value" toolbar below, which only SETS an absolute value —
                this is relative, and price-column-specific. */}
            {priceHeaders.length > 0 && (
              <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 p-3 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300 self-center flex items-center gap-1.5">
                    <Percent size={14} /> Adjust price by %/₹
                  </span>
                  <select
                    value={pctAdjustField}
                    onChange={e => setPctAdjustField(e.target.value)}
                    className="text-sm bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
                  >
                    <option value="" disabled hidden>-- Select Field --</option>
                    {priceHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <input
                    type="number" inputMode="decimal"
                    placeholder={pctAdjustMode === 'percent' ? '10' : '5'}
                    value={pctAdjustValue}
                    onChange={e => { setPctAdjustValue(e.target.value); setPctAdjustNote(''); }}
                    className="text-sm bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-1.5 w-24 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
                  />
                  <div className="flex bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg p-0.5">
                    {(['percent', 'amount'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setPctAdjustMode(m)}
                        className={`px-3 py-1 rounded-md text-sm font-bold ${pctAdjustMode === m ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}>
                        {m === 'percent' ? '%' : '₹'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={applyPctAdjust}
                    disabled={!pctAdjustField || pctAdjustValue === '' || selectedRows.length === 0}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
                  >
                    Apply to Selected{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
                  </button>
                </div>
                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/70">
                  Positive increases, negative (e.g. -10) decreases. Tick rows above and hit Apply, or leave rows unticked and use the <span className="font-bold">+ / −</span> next to any single row's {priceHeaders.join('/')} box.
                </p>
                {pctAdjustNote && <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">{pctAdjustNote}</p>}
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
                    <option value="" disabled hidden>-- Select Field --</option>
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
                        checked={selectedRows.length === previewData.length && previewData.length > 0}
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
                  {previewData.slice(pageStart, pageEnd).map((row, localIdx) => {
                    const i = pageStart + localIdx;
                    const match = rowMatches[i];
                    const action = effectiveAction(i);
                    const isExisting = match?.status === 'existing';
                    const isSelected = selectedRows.includes(i);
                    return (
                    <Fragment key={i}>
                    <tr className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 text-slate-900 dark:text-slate-300 group ${action === 'skip' ? 'opacity-45' : ''} ${isSelected ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : ''}`}>
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
                          <div className="flex items-center gap-0.5">
                            {PRICE_FIELD_LABELS.includes(h) && (
                              <button type="button" onClick={() => nudgeCell(i, h, -1)} title={`Decrease by the amount above`}
                                className="shrink-0 p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                                <Minus size={12} />
                              </button>
                            )}
                            <input
                              type="text"
                              value={String(row[h] ?? '')}
                              onChange={(e) => handleCellEdit(i, h, e.target.value)}
                              className="w-full min-w-[70px] px-3 py-1.5 bg-transparent border border-transparent rounded-lg hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-colors"
                            />
                            {PRICE_FIELD_LABELS.includes(h) && (
                              <button type="button" onClick={() => nudgeCell(i, h, 1)} title={`Increase by the amount above`}
                                className="shrink-0 p-1 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                                <Plus size={12} />
                              </button>
                            )}
                          </div>
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
                    {row._warning && (
                      <tr className="bg-amber-50/60 dark:bg-amber-900/20">
                        <td colSpan={headers.length + 3} className="px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                          ⚠️ {String(row._warning)}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — every row is now editable across pages */}
            {previewData.length > 0 && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-slate-700 dark:text-slate-200">{pageStart + 1}</span>–<span className="font-bold text-slate-700 dark:text-slate-200">{pageEnd}</span> of <span className="font-bold text-slate-700 dark:text-slate-200">{previewData.length}</span> rows
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    Rows per page
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {[25, 50, 100, 200, 500].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      title="First page"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      title="Previous page"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="flex items-center gap-1 px-2 text-sm text-slate-600 dark:text-slate-300">
                      <span>Page</span>
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={currentPage}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v)) setCurrentPage(Math.max(1, Math.min(totalPages, v)));
                        }}
                        className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm text-center text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span>of <span className="font-bold text-slate-700 dark:text-slate-200">{totalPages}</span></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      title="Next page"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      title="Last page"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
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

            {summary.millExtras && (
              <div className={'mt-6 max-w-lg mx-auto text-left p-4 bg-white dark:bg-slate-900 border rounded-xl ' + (summary.millExtras.ok ? 'border-emerald-500/30' : 'border-red-500/30')} data-testid="import-mill-result">
                {summary.millExtras.ok ? (
                  <>
                    <h4 className="font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2"><CheckCircle size={16} /> Mill records created</h4>
                    <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-0.5">
                      {summary.millExtras.gateEntry && <li>Gate Entry {summary.millExtras.gateEntry.entryNumber} — {summary.millExtras.gateEntry.vehicleNumber}</li>}
                      {summary.millExtras.freight && !summary.millExtras.freight.alreadyRecorded && <li>Freight ₹{Number(summary.millExtras.freight.total).toLocaleString('en-IN')} to {summary.millExtras.freight.transporter}{summary.millExtras.freight.advance > 0 ? ` (advance ₹${Number(summary.millExtras.freight.advance).toLocaleString('en-IN')}, balance ₹${Number(summary.millExtras.freight.balance).toLocaleString('en-IN')})` : ''}</li>}
                      {(summary.millExtras.lots || []).map((l: any) => <li key={l.id}>Raw material lot {l.lotNumber} — {l.product}, {Number(l.quantity).toLocaleString('en-IN')} {l.unit}</li>)}
                    </ul>
                    {(summary.millExtras.skipped || []).length > 0 && <p className="text-xs text-amber-600 mt-2">Skipped: {summary.millExtras.skipped.join(' ')}</p>}
                  </>
                ) : (
                  <>
                    <h4 className="font-bold flex items-center gap-2 text-red-600 mb-2"><AlertCircle size={16} /> Truck / freight details not saved</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">The purchase itself saved correctly, but the mill records (gate entry, freight, lot) could not be created: {summary.millExtras.error}. Add them from Gate Entry / Freight / Raw Material.</p>
                  </>
                )}
              </div>
            )}

            {summary.billPhotoAttachFailed && (
              <div className="mt-6 max-w-lg mx-auto text-left p-4 bg-white dark:bg-slate-900 border border-amber-500/30 rounded-xl">
                <h4 className="font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                  <AlertCircle size={16} /> Bill photo not attached
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  The purchase, supplier and stock all saved correctly, but the scanned bill photo couldn't be attached to the supplier (a temporary connection issue). Open the supplier's page and upload it there.
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {summary.productIds?.length > 0 && (
                <button
                  onClick={handlePrintImportedLabels}
                  disabled={printingLabels}
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg font-bold"
                >
                  {printingLabels ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                  Print Barcode Labels ({summary.productIds.length})
                </button>
              )}
              <button onClick={onBack} className="px-6 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                Start Another Import
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
