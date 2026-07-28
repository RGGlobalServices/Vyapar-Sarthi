'use client';
import { Capacitor } from '@capacitor/core';
import WebCameraScanner from './WebCameraScanner';
import NativeCameraScanner from './NativeCameraScanner';

interface CameraScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  continuous?: boolean;
}

/**
 * Dispatches to the real native scanner (Google ML Kit, the actual device
 * camera rendered behind the WebView — no getUserMedia, no video element,
 * none of the WebView permission/sizing bugs) when running inside the
 * packaged Capacitor app, and to the html5-qrcode/getUserMedia fallback
 * everywhere else (browser tab, "Add to Home Screen" PWA).
 */
export default function CameraScanner(props: CameraScannerProps) {
  if (Capacitor.isNativePlatform()) {
    return <NativeCameraScanner {...props} />;
  }
  return <WebCameraScanner {...props} />;
}
