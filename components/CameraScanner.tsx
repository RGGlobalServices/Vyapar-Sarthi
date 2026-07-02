'use client';
import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CameraScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  continuous?: boolean;
}

export default function CameraScanner({ onScan, onClose, continuous = false }: CameraScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedOnce = useRef(false);
  const lastScanned = useRef<{ text: string; time: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    const html5QrCode = new Html5Qrcode('qr-reader-container', {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
      ]
    });
    scannerRef.current = html5QrCode;

    html5QrCode.start(
      { facingMode: 'environment' },
      {
        fps: 15,
      },
      (decodedText) => {
        if (!mounted) return;
        
        if (!continuous) {
          if (!scannedOnce.current) {
            scannedOnce.current = true;
            onScan(decodedText);
            playBeep();
          }
        } else {
          // Continuous mode: prevent scanning the SAME code within 2 seconds
          const now = Date.now();
          if (
            lastScanned.current &&
            lastScanned.current.text === decodedText &&
            now - lastScanned.current.time < 2000
          ) {
            return; // ignore duplicate scan
          }
          
          lastScanned.current = { text: decodedText, time: now };
          onScan(decodedText);
          playBeep();
        }
      },
      (errorMessage) => {
        // ignore parse errors
      }
    ).catch((err) => {
      if (mounted) {
        console.error('Scanner start error:', err);
        setError('Could not access camera. Please allow camera permissions.');
      }
    });

    function playBeep() {
      try {
        const audio = new Audio('/beep.mp3');
        audio.play().catch(() => {});
      } catch (e) {}
    }

    return () => {
      mounted = false;
      try {
        if (scannerRef.current?.isScanning) {
          scannerRef.current.stop()
            .then(() => {
              try { scannerRef.current?.clear(); } catch (e) {}
            })
            .catch((e) => {
              console.warn("Scanner stop warning", e);
              try { scannerRef.current?.clear(); } catch (err) {}
            });
        } else {
          try { scannerRef.current?.clear(); } catch (e) {}
        }
      } catch (e) {
        console.warn("Scanner cleanup caught", e);
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/90 z-[300] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
        <div className="flex items-center gap-2 text-white/80">
          <Camera size={20} />
          <span className="font-bold tracking-wider uppercase text-sm">Scan Barcode / QR</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Main Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center p-6 bg-red-500/10 border border-red-500/30 rounded-2xl max-w-sm">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <p className="text-white font-bold mb-2">Camera Error</p>
            <p className="text-slate-400 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* The Html5Qrcode library injects its own video element into this container */}
            <div id="qr-reader-container" className="absolute inset-0 w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full" dangerouslySetInnerHTML={{ __html: '' }} />
            
            {/* Viewfinder Overlay/Guides */}
            <div className="relative z-10 w-[70vw] max-w-[250px] aspect-square pointer-events-none">
              {/* Scanning reticle */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-red-500/80 shadow-[0_0_15px_#ef4444] animate-[scan_1.5s_ease-in-out_infinite]" />
              </div>

              {/* Corner marks */}
              <div className="absolute top-[-2px] left-[-2px] w-10 h-10 border-t-[5px] border-l-[5px] border-emerald-500 rounded-tl-xl" />
              <div className="absolute top-[-2px] right-[-2px] w-10 h-10 border-t-[5px] border-r-[5px] border-emerald-500 rounded-tr-xl" />
              <div className="absolute bottom-[-2px] left-[-2px] w-10 h-10 border-b-[5px] border-l-[5px] border-emerald-500 rounded-bl-xl" />
              <div className="absolute bottom-[-2px] right-[-2px] w-10 h-10 border-b-[5px] border-r-[5px] border-emerald-500 rounded-br-xl" />
            </div>
          </>
        )}
      </div>

      {/* Footer Text */}
      <div className="absolute bottom-10 left-0 w-full text-center z-10">
        <p className="text-white/60 text-sm font-medium bg-black/40 inline-block px-4 py-2 rounded-full backdrop-blur-md">
          Align code within the frame to scan
        </p>
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { transform: translateY(-130px); }
          50% { transform: translateY(130px); }
          100% { transform: translateY(-130px); }
        }
      `}</style>
    </div>
  );
}
