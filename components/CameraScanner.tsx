'use client';
import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
import { X, Camera, AlertCircle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafeTranslations } from '@/lib/i18n/useSafeTranslations';
import { playScanBeep } from '@/lib/useBarcodeScanner';

interface CameraScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  continuous?: boolean;
}

// A denied camera permission never re-prompts on its own — Android/iOS both
// require the user to flip it on from the app's system settings screen. On
// web there is no such screen to deep-link to, so that path only applies
// inside the native app shell.
function openAppSettings() {
  if (!Capacitor.isNativePlatform()) return;
  NativeSettings.open({
    optionAndroid: AndroidSettings.ApplicationDetails,
    optionIOS: IOSSettings.App,
  }).catch(() => {});
}

export default function CameraScanner({ onScan, onClose, continuous = false }: CameraScannerProps) {
  const { safeT } = useSafeTranslations('Scanner');
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedOnce = useRef(false);
  const lastScanned = useRef<{ text: string; time: number } | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [initDone, setInitDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!document.getElementById('qr-reader-container')) {
      return;
    }

    let html5QrCode: Html5Qrcode;
    try {
      html5QrCode = new Html5Qrcode('qr-reader-container', {
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
    } catch (err) {
      console.warn('Failed to instantiate Html5Qrcode:', err);
      return;
    }

    const startCamera = async () => {
      if ((window as any).scannerStopPromise) {
        await (window as any).scannerStopPromise;
        await new Promise(resolve => setTimeout(resolve, 300)); // Allow hardware to fully release
      }
      if (!mounted) return;

      const config = activeCameraId ? activeCameraId : { facingMode: 'environment' };
      try {
        await html5QrCode.start(
          config,
          { fps: 15 },
          (decodedText) => {
            if (!mounted) return;
            if (!continuous) {
              if (!scannedOnce.current) {
                scannedOnce.current = true;
                playBeep();
                if (navigator.vibrate) navigator.vibrate([200]);
                setTimeout(() => onScan(decodedText), 50);
              }
            } else {
              const now = Date.now();
              if (lastScanned.current && lastScanned.current.text === decodedText && now - lastScanned.current.time < 2000) return;
              lastScanned.current = { text: decodedText, time: now };
              playBeep();
              if (navigator.vibrate) navigator.vibrate([200]);
              setTimeout(() => onScan(decodedText), 50);
            }
          },
          () => {}
        );
      } catch (err) {
        if (mounted) {
          console.error('Scanner start error:', err);
          // NotAllowedError means the OS-level prompt already fired and was
          // denied (or was denied on an earlier visit) — calling getUserMedia
          // again will not show it a second time, so guide the user to
          // settings instead of repeating a request that can't succeed.
          if ((err as any)?.name === 'NotAllowedError') {
            setPermissionDenied(true);
            setError(safeT('cameraPermissionError', 'Camera access is blocked. Allow it in Settings to scan.'));
          } else {
            setError(safeT('cameraGenericError', 'Could not access camera. Please try again.'));
          }
        }
      }
    };

    startCamera();

    // Synthesised rather than loaded from /beep.mp3 — that file does not exist
    // in public/, so every scan has been silently failing to make a sound.
    function playBeep() {
      playScanBeep(true);
    }

    if (!initDone) {
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          setInitDone(true);
        }
      }).catch(() => {});
    }

    return () => {
      mounted = false;
      try {
        if (scannerRef.current?.isScanning) {
          (window as any).scannerStopPromise = scannerRef.current.stop()
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
  }, [onScan, continuous, activeCameraId]);

  const toggleFlash = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: !flashOn } as any] });
        setFlashOn(!flashOn);
      } catch (err) {
        console.warn('Flash not supported', err);
      }
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex(c => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setActiveCameraId(cameras[nextIndex].id);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[300] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
        <div className="flex items-center gap-2 text-white/80">
          <Camera size={20} />
          <span className="font-bold tracking-wider uppercase text-sm">{safeT('scanBarcode', 'Scan Barcode / QR')}</span>
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
            <p className="text-white font-bold mb-2">{safeT('cameraError', 'Camera Error')}</p>
            <p className="text-slate-400 text-sm mb-4">{error}</p>
            {permissionDenied && (
              Capacitor.isNativePlatform() ? (
                <button
                  onClick={openAppSettings}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors"
                >
                  <Settings size={16} /> {safeT('openSettings', 'Open App Settings')}
                </button>
              ) : (
                <p className="text-slate-500 text-xs">
                  {safeT('cameraSettingsHint', 'Go to your browser or system settings and allow camera access for this site.')}
                </p>
              )
            )}
          </div>
        ) : (
          <>
            {/* The Html5Qrcode library injects its own video element into this container */}
            <div 
              id="qr-reader-container" 
              className="absolute inset-0 w-full h-full overflow-hidden [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover [&_video]:!absolute [&_video]:!top-0 [&_video]:!left-0"
              dangerouslySetInnerHTML={{ __html: '' }} 
            />
            
            {/* Viewfinder Overlay/Guides — the huge box-shadow spread paints solid
                background everywhere outside this box, so the live camera feed is
                only visible through this square "cutout"; the rest reads as the
                normal dark scanner background instead of a full-screen preview. */}
            <div className="relative z-10 w-[70vw] max-w-[250px] aspect-square rounded-2xl shadow-[0_0_0_100vmax_rgba(2,6,23,0.94)] pointer-events-none">
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

      {/* Footer Text & Controls */}
      <div className="absolute bottom-10 left-0 w-full flex flex-col items-center gap-6 z-10 px-4">
        <p className="text-white/80 text-sm font-bold tracking-wide bg-black/60 inline-block px-6 py-2.5 rounded-full backdrop-blur-md">
          {safeT('alignBarcode', 'Align barcode inside the frame')}
        </p>

        <div className="flex items-center gap-4">
          <button onClick={onClose} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold backdrop-blur-md transition-colors">
            {safeT('cancel', 'Cancel')}
          </button>
          
          <button onClick={toggleFlash} className={cn("px-6 py-3 rounded-full font-bold backdrop-blur-md transition-colors flex items-center gap-2", flashOn ? "bg-amber-500 text-black" : "bg-white/10 hover:bg-white/20 text-white")}>
            {safeT('flash', 'Flash')}
          </button>

          {cameras.length > 1 && (
            <button onClick={switchCamera} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold backdrop-blur-md transition-colors flex items-center gap-2">
              {safeT('switchCamera', 'Switch')}
            </button>
          )}
        </div>
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
