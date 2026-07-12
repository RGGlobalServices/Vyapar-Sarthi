'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Download, FileWarning, Loader2 } from 'lucide-react';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'bmp'];

export default function DocumentViewerModal({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string;
  onClose: () => void;
}) {
  const ext = (url.split('.').pop() || '').split('?')[0].toLowerCase();
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === 'pdf';
  const previewable = isImage || isPdf;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Fetch the file as a blob ourselves (instead of pointing <img>/<iframe> straight
  // at the remote URL) so we get explicit loading/error states and control over
  // the bytes — a bare src that fails (network, CORS) otherwise renders silently blank.
  useEffect(() => {
    if (!previewable) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setBlobUrl(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return buf;
        if (isImage) {
          const objectUrl = URL.createObjectURL(new Blob([buf]));
          setBlobUrl(objectUrl);
          setStatus('ready');
        }
        return buf;
      })
      .then(async (buf) => {
        if (cancelled || !isPdf || !buf) return;
        await renderPdf(buf as ArrayBuffer);
      })
      .catch((err) => {
        console.error('Document preview failed:', err);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, previewable]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Browsers vary in whether they have a built-in PDF viewer wired up for
  // <iframe>/<embed> (headless/embedded browser contexts often don't), so we
  // render pages onto <canvas> ourselves via pdf.js instead of trusting one.
  async function renderPdf(data: ArrayBuffer) {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const doc = await pdfjsLib.getDocument({ data }).promise;
      const container = pdfContainerRef.current;
      if (!container) return;
      container.innerHTML = '';

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'shadow-lg mb-3 max-w-full h-auto';
        container.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
      }
      setStatus('ready');
    } catch (err) {
      console.error('PDF render failed:', err);
      setStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-3xl h-[85vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{label}</h3>
          <div className="flex items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title="Download"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Download size={18} />
            </a>
            <button
              onClick={onClose}
              title="Close"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
          {!previewable ? (
            <div className="text-center p-8 text-slate-500">
              <FileWarning size={40} className="mx-auto mb-3 text-slate-400" />
              <p className="font-bold text-slate-700 dark:text-slate-300">Preview not available</p>
              <p className="text-sm mt-1">This file type can&apos;t be previewed in-browser. Use the download button above.</p>
            </div>
          ) : (
            <>
              {status === 'loading' && (
                <div className="text-center text-slate-500">
                  <Loader2 size={32} className="mx-auto mb-3 animate-spin text-indigo-500" />
                  <p className="text-sm font-medium">Loading preview…</p>
                </div>
              )}
              {status === 'error' && (
                <div className="text-center p-8 text-slate-500">
                  <FileWarning size={40} className="mx-auto mb-3 text-red-400" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">Couldn&apos;t load preview</p>
                  <p className="text-sm mt-1">The file may be unreachable right now. Use the download button above to try directly.</p>
                </div>
              )}
              {isImage && status === 'ready' && blobUrl && (
                <img src={blobUrl} alt={label} className="max-w-full max-h-full object-contain" />
              )}
              {/* Always mounted (not conditionally) so renderPdf's ref is available before pdf.js finishes parsing */}
              <div ref={pdfContainerRef} className={isPdf && status !== 'error' ? 'flex flex-col items-center' : 'hidden'} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
