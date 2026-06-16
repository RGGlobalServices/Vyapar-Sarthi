'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CameraScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    let mounted = true;
    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    async function startScanner() {
      try {
        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (videoInputDevices.length === 0) {
          if (mounted) setError('No camera found on this device.');
          return;
        }

        // Prefer back camera if available
        const backCamera = videoInputDevices.find((d: any) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
        const selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;

        if (videoRef.current) {
          codeReader.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current,
            (result, err) => {
              if (result) {
                if (mounted) {
                  onScan(result.getText());
                }
              }
              if (err && err.name !== 'NotFoundException') {
                console.error(err);
              }
            }
          );
        }
      } catch (err) {
        if (mounted) {
          console.error('Scanner error:', err);
          setError('Could not start camera. Please check permissions.');
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      (codeReader as any).reset?.();
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
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            
            {/* Viewfinder Overlay/Guides */}
            <div className="relative z-10 w-[70vw] max-w-[300px] aspect-square">
              {/* Dark overlay around the square */}
              <div className="absolute inset-[-1000px] border-[1000px] border-black/50 pointer-events-none" />
              
              {/* Scanning reticle */}
              <div className="absolute inset-0 border-2 border-emerald-500/50 flex items-center justify-center pointer-events-none">
                <div className="w-full h-0.5 bg-emerald-500/80 shadow-[0_0_10px_#10b981] animate-[scan_2s_ease-in-out_infinite]" />
              </div>

              {/* Corner marks */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500" />
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
