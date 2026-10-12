'use client';

import { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Trash2, Loader2, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

type Props = {
  invoiceId: string;
  invoiceNumber?: string;
  initialImages: string[];
  onClose: () => void;
  onUpdated: (images: string[]) => void;
};

export default function BillImageModal({ invoiceId, invoiceNumber, initialImages, onClose, onUpdated }: Props) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'bill-images');
        const { data } = await api.post('/upload', fd);
        newUrls.push(data.url);
      }
      const updated = [...images, ...newUrls];
      await api.patch(`/purchases/${invoiceId}/bill-images`, { billImages: updated });
      setImages(updated);
      setActiveIdx(updated.length - 1);
      onUpdated(updated);
      toast.success(`${newUrls.length} photo${newUrls.length > 1 ? 's' : ''} uploaded`);
    } catch (e: any) {
      toast.error('Upload failed: ' + (e?.response?.data?.error || e.message));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(url: string) {
    if (!confirm('Delete this photo?')) return;
    setDeleting(url);
    try {
      const updated = images.filter(u => u !== url);
      await api.patch(`/purchases/${invoiceId}/bill-images`, { billImages: updated });
      setImages(updated);
      if (activeIdx >= updated.length) setActiveIdx(Math.max(0, updated.length - 1));
      onUpdated(updated);
      toast.success('Photo deleted');
    } catch (e: any) {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  const active = images[activeIdx];

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 max-h-[90vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 shrink-0">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <ImageIcon size={17} className="text-indigo-500" />
                Bill Photos
              </h2>
              {invoiceNumber && (
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{invoiceNumber}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm disabled:opacity-60 transition-colors"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={e => handleUpload(e.target.files)}
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {images.length === 0 ? (
              /* Empty state — big upload zone */
              <div
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                  <Upload size={24} className="text-indigo-500" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-700 dark:text-slate-300">बिलाचा फोटो अपलोड करा</p>
                  <p className="text-xs text-slate-500 mt-0.5">Click to upload bill photo / PDF</p>
                  <p className="text-[11px] text-slate-400 mt-1">JPG, PNG, HEIC, PDF supported</p>
                </div>
              </div>
            ) : (
              <>
                {/* Main image viewer */}
                <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {active?.toLowerCase().endsWith('.pdf') ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <ImageIcon size={36} className="text-slate-400" />
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">PDF Bill</p>
                      <a
                        href={active}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        Open PDF →
                      </a>
                    </div>
                  ) : (
                    <img
                      src={active}
                      alt={`Bill ${activeIdx + 1}`}
                      className="w-full object-contain max-h-72 cursor-zoom-in"
                      onClick={() => setLightbox(active)}
                    />
                  )}

                  {/* Navigation arrows (only if multiple) */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                        disabled={activeIdx === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/60 transition-colors"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        onClick={() => setActiveIdx(i => Math.min(images.length - 1, i + 1))}
                        disabled={activeIdx === images.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/60 transition-colors"
                      >
                        <ChevronRight size={18} />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/40 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {activeIdx + 1} / {images.length}
                      </div>
                    </>
                  )}

                  {/* Zoom + Delete overlay */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {!active?.toLowerCase().endsWith('.pdf') && (
                      <button
                        onClick={() => setLightbox(active)}
                        className="w-7 h-7 rounded-lg bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                        title="View full size"
                      >
                        <ZoomIn size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(active)}
                      disabled={deleting === active}
                      className="w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-60"
                      title="Delete this photo"
                    >
                      {deleting === active ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>

                {/* Thumbnail strip (multiple images) */}
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className={cn(
                          "shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors",
                          i === activeIdx
                            ? "border-indigo-500"
                            : "border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                        )}
                      >
                        {url.toLowerCase().endsWith('.pdf') ? (
                          <div className="w-full h-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <ImageIcon size={16} className="text-slate-400" />
                          </div>
                        ) : (
                          <img src={url} alt={`Bill ${i + 1}`} className="w-full h-full object-cover" />
                        )}
                      </button>
                    ))}
                    {/* Add more button */}
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                    >
                      <Upload size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Full size bill"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
