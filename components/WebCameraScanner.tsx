'use client';
import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafeTranslations } from '@/lib/i18n/useSafeTranslations';
import { playScanBeep } from '@/lib/useBarcodeScanner';

interface CameraScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  continuous?: boolean;
}

// Web/PWA fallback scanner (html5-qrcode + getUserMedia). The dispatcher in
// CameraScanner.tsx only renders this outside the native app shell — inside
// the native shell NativeCameraScanner (ML Kit, real device camera, no
// WebView video element at all) is used instead, so there is no in-app
// settings deep-link to offer here.
export default function WebCameraScanner({ onScan, onClose, continuous = false }: CameraScannerProps) {
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
  const [retryCount, setRetryCount] = useState(0);

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
      setError(null);
      setPermissionDenied(false);
      if ((window as any).scannerStopPromise) {
        await (window as any).scannerStopPromise;
        await new Promise(resolve => setTimeout(resolve, 300)); // Allow hardware to fully release
      }
      if (!mounted) return;

      const config = activeCameraId ? activeCameraId : { facingMode: 'environment' };
      // Without an explicit resolution hint, some Android camera drivers hand
      // back a native-orientation (landscape) stream even while the phone is
      // held in portrait. html5-qrcode then sizes the <video> element to a
      // fixed pixel width measured once at start() and lets height follow the
      // stream's real aspect ratio — a landscape stream inside a portrait
      // container renders far shorter than the screen, showing live video in
      // roughly the top half and just our dark cutout/frame in the rest.
      // Requesting a near-square *ideal* resolution (not exact/required, so
      // devices that can't match it still work) steers the browser toward a
      // stream shape that actually fills a portrait viewfinder.
      const videoConstraints: MediaTrackConstraints = activeCameraId
        ? { deviceId: { exact: activeCameraId }, width: { ideal: 1080 }, height: { ideal: 1080 } }
        : { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } };
      try {
        await html5QrCode.start(
          config,
          { fps: 15, videoConstraints } as any,
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
          // html5-qrcode never rejects with the original DOMException — it
          // formats it into a plain string ("Error getting userMedia, error =
          // NotAllowedError: ...", see Html5QrcodeStrings.errorGettingUserMedia),
          // so `err.name === 'NotAllowedError'` can never match here. Match
          // against the stringified message instead, which is the only place
          // the original error name survives.
          const message = typeof err === 'string' ? err : ((err as any)?.message || (err as any)?.name || String(err));
          if (/NotAllowedError|PermissionDenied|Permission denied/i.test(message)) {
            // A denied permission never re-prompts on its own — calling
            // getUserMedia again won't show the OS/browser dialog a second
            // time, so guide the user to settings instead of repeating a
            // request that can't succeed.
            setPermissionDenied(true);
            setError(safeT('cameraPermissionError', 'Camera access is blocked. Allow it in Settings to scan.'));
          } else if (/NotFoundError|DevicesNotFound|no camera/i.test(message)) {
            setError(safeT('cameraNotFoundError', 'No camera found on this device.'));
          } else if (/NotReadableError|TrackStartError|in use/i.test(message)) {
            setError(safeT('cameraInUseError', 'Camera is in use by another app. Close it and try again.'));
          } else {
            setError(safeT('cameraGenericError', 'Could not access camera. Please try again.'));
          }
        }
      }
    };

    const startPromise = startCamera();

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
      const teardown = () => {
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
      // html5-qrcode calls videoElement.play() internally as part of start().
      // Tearing the video element down (stop/clear) while that promise is
      // still in flight — e.g. closing the scanner right after opening it, or
      // React re-running this effect quickly — rejects it with an unhandled
      // "AbortError: play() request was interrupted". Waiting for the start
      // attempt to settle first (success OR failure) before tearing down
      // avoids that race entirely.
      Promise.resolve(startPromise).catch(() => {}).then(teardown);
    };
  }, [onScan, continuous, activeCameraId, retryCount]);

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
              <div className="space-y-3">
                {/* Two SEPARATE permission layers can block this, and turning
                    one on doesn't touch the other: the phone's own App Info →
                    Permissions screen (whether the app/browser may use the
                    camera at all), and — independently — the browser's own
                    per-site decision (tap the lock/site-info icon next to the
                    address bar → Permissions → Camera). Denying the in-page
                    prompt once locks that site-level decision in place even
                    after the phone-level toggle is switched on. */}
                <p className="text-slate-500 text-xs">
                  {safeT('cameraSettingsHint', "Two things can block this — check both: (1) your phone's app permission for Camera, and (2) this site's own camera permission in your browser (tap the lock/info icon next to the address bar → Permissions → Camera → Allow).")}
                </p>
              </div>
            )}
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-colors"
            >
              {safeT('tryAgain', 'Try Again')}
            </button>
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
