'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarcodeScanner,
  BarcodeFormat,
  type Barcode,
} from '@capacitor-mlkit/barcode-scanning';
import { X, Camera, AlertCircle, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafeTranslations } from '@/lib/i18n/useSafeTranslations';
import { playScanBeep } from '@/lib/useBarcodeScanner';

interface CameraScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  continuous?: boolean;
}

const SCAN_FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.QrCode,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
];

/**
 * Native scanner for the Capacitor app shell — Google ML Kit renders the
 * REAL device camera behind the WebView (via `startScan`), so there is no
 * <video> element, no getUserMedia, and no WebView permission-bridging to go
 * wrong. The tradeoff: the page itself must go transparent for the camera to
 * show through (see body.native-scanner-active in app/globals.css), and the
 * one thing we render on top needs a stable id (#native-scanner-overlay)
 * that stylesheet targets.
 */
export default function NativeCameraScanner({ onScan, onClose, continuous = false }: CameraScannerProps) {
  const { safeT } = useSafeTranslations('Scanner');
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [starting, setStarting] = useState(true);
  const [flashOn, setFlashOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const scannedOnce = useRef(false);
  const lastScanned = useRef<{ text: string; time: number } | null>(null);
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const scanningRef = useRef(false);
  // Portal out of the billing page's own DOM tree — its root wrapper scrolls
  // internally (overflow-y-auto), and on some Android WebViews a `position:
  // fixed` descendant of a scrolling ancestor gets clipped to that ancestor's
  // box instead of the real viewport.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  useEffect(() => {
    let mounted = true;

    const handleBarcode = (barcode: Barcode) => {
      if (!mounted) return;
      const text = barcode.rawValue || barcode.displayValue;
      if (!text) return;
      if (!continuous) {
        if (scannedOnce.current) return;
        scannedOnce.current = true;
        playScanBeep(true);
        if (navigator.vibrate) navigator.vibrate([200]);
        setTimeout(() => onScan(text), 50);
        stopNativeScan();
      } else {
        const now = Date.now();
        if (lastScanned.current && lastScanned.current.text === text && now - lastScanned.current.time < 2000) return;
        lastScanned.current = { text, time: now };
        playScanBeep(true);
        if (navigator.vibrate) navigator.vibrate([200]);
        setTimeout(() => onScan(text), 50);
      }
    };

    const stopNativeScan = async () => {
      if (!scanningRef.current) return;
      scanningRef.current = false;
      document.body.classList.remove('native-scanner-active');
      try { await listenerRef.current?.remove(); } catch {}
      listenerRef.current = null;
      try { await BarcodeScanner.stopScan(); } catch {}
    };

    const start = async () => {
      setStarting(true);
      setError(null);
      setPermissionDenied(false);
      try {
        const { supported } = await BarcodeScanner.isSupported();
        if (!supported) {
          if (mounted) setError(safeT('cameraNotFoundError', 'No camera found on this device.'));
          return;
        }

        let status = await BarcodeScanner.checkPermissions();
        if (status.camera !== 'granted' && status.camera !== 'limited') {
          status = await BarcodeScanner.requestPermissions();
        }
        if (status.camera !== 'granted' && status.camera !== 'limited') {
          if (mounted) {
            setPermissionDenied(true);
            setError(safeT('cameraPermissionError', 'Camera access is blocked. Allow it in Settings to scan.'));
          }
          return;
        }

        try {
          const { available } = await BarcodeScanner.isTorchAvailable();
          if (mounted) setTorchAvailable(available);
        } catch {}

        listenerRef.current = await BarcodeScanner.addListener('barcodesScanned', (event) => {
          if (event.barcodes && event.barcodes.length > 0) handleBarcode(event.barcodes[0]);
        });

        document.body.classList.add('native-scanner-active');
        scanningRef.current = true;
        await BarcodeScanner.startScan({ formats: SCAN_FORMATS });
      } catch (err: any) {
        if (mounted) {
          console.error('Native scanner start error:', err);
          setError(safeT('cameraGenericError', 'Could not access camera. Please try again.'));
        }
        document.body.classList.remove('native-scanner-active');
      } finally {
        if (mounted) setStarting(false);
      }
    };

    start();

    return () => {
      mounted = false;
      stopNativeScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScan, continuous]);

  const openSettings = () => {
    BarcodeScanner.openSettings().catch(() => {});
  };

  const toggleFlash = async () => {
    try {
      if (flashOn) await BarcodeScanner.disableTorch();
      else await BarcodeScanner.enableTorch();
      setFlashOn(!flashOn);
    } catch (err) {
      console.warn('Torch not supported', err);
    }
  };

  if (!portalReady) return null;

  return createPortal(
    <div id="native-scanner-overlay" className="fixed inset-0 z-[300] flex flex-col">
      {/* Header — opaque chrome on top of the transparent live camera feed */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
        <div className="flex items-center gap-2 text-white/80">
          <Camera size={20} />
          <span className="font-bold tracking-wider uppercase text-sm">{safeT('scanBarcode', 'Scan Barcode / QR')}</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Main viewfinder area — transparent, the real camera shows straight through */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center p-6 bg-slate-950/90 border border-red-500/30 rounded-2xl max-w-sm">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <p className="text-white font-bold mb-2">{safeT('cameraError', 'Camera Error')}</p>
            <p className="text-slate-400 text-sm mb-4">{error}</p>
            {permissionDenied && (
              <button
                onClick={openSettings}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors"
              >
                <Settings size={16} /> {safeT('openSettings', 'Open App Settings')}
              </button>
            )}
            <button
              onClick={() => {
                setError(null);
                document.body.classList.remove('native-scanner-active');
                // Re-trigger the effect by toggling continuous/onScan identity
                // isn't available here, so just re-run the same start logic.
                BarcodeScanner.checkPermissions().then(() => window.location.reload());
              }}
              className="mt-4 block mx-auto inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-colors"
            >
              {safeT('tryAgain', 'Try Again')}
            </button>
          </div>
        ) : starting ? (
          <div className="bg-black/60 rounded-2xl px-6 py-4 text-white/80 text-sm font-bold">
            {safeT('startingCamera', 'Starting camera…')}
          </div>
        ) : (
          <div className="relative z-10 w-[70vw] max-w-[250px] aspect-square pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-0.5 bg-red-500/80 shadow-[0_0_15px_#ef4444] animate-[scan_1.5s_ease-in-out_infinite]" />
            </div>
            <div className="absolute top-[-2px] left-[-2px] w-10 h-10 border-t-[5px] border-l-[5px] border-emerald-500 rounded-tl-xl" />
            <div className="absolute top-[-2px] right-[-2px] w-10 h-10 border-t-[5px] border-r-[5px] border-emerald-500 rounded-tr-xl" />
            <div className="absolute bottom-[-2px] left-[-2px] w-10 h-10 border-b-[5px] border-l-[5px] border-emerald-500 rounded-bl-xl" />
            <div className="absolute bottom-[-2px] right-[-2px] w-10 h-10 border-b-[5px] border-r-[5px] border-emerald-500 rounded-br-xl" />
          </div>
        )}
      </div>

      {/* Footer — opaque chrome */}
      <div className="absolute bottom-10 left-0 w-full flex flex-col items-center gap-6 z-10 px-4">
        {!error && (
          <p className="text-white/80 text-sm font-bold tracking-wide bg-black/60 inline-block px-6 py-2.5 rounded-full backdrop-blur-md">
            {safeT('alignBarcode', 'Align barcode inside the frame')}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button onClick={onClose} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold backdrop-blur-md transition-colors">
            {safeT('cancel', 'Cancel')}
          </button>

          {torchAvailable && !error && (
            <button
              onClick={toggleFlash}
              className={cn('px-6 py-3 rounded-full font-bold backdrop-blur-md transition-colors flex items-center gap-2', flashOn ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20 text-white')}
            >
              <Zap size={16} /> {safeT('flash', 'Flash')}
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
    </div>,
    document.body
  );
}
