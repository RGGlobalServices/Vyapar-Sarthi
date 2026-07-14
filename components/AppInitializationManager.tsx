'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem } from '@capacitor/filesystem';
import { LogOut } from 'lucide-react';

export default function AppInitializationManager() {
  const router = useRouter();
  const pathname = usePathname();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // --- 1. BACK BUTTON NAVIGATION ---
  useEffect(() => {
    let unlisten: any = null;
    let hasDummyState = false;
    
    // In next-intl, pathname usually strips the locale, so root is '/'
    const isRoot = pathname === '/' || pathname === '/en' || pathname === '/hi' || pathname === '/mr';

    if (Capacitor.isNativePlatform()) {
      const setupBackButton = async () => {
        unlisten = await App.addListener('backButton', (event) => {
          if (isRoot) {
            setShowExitConfirm(true);
          } else {
            if (event.canGoBack) {
              router.back();
            } else {
              router.push('/');
            }
          }
        });
      };
      setupBackButton();
    } else {
      // PWA / Desktop fallback
      const trapBackButton = () => {
        if (isRoot && !hasDummyState) {
          window.history.pushState({ trap: true }, '');
          hasDummyState = true;
        }
      };
      trapBackButton();

      const handlePopState = (e: PopStateEvent) => {
        if (isRoot) {
          setShowExitConfirm(true);
          window.history.pushState({ trap: true }, '');
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }

    return () => {
      if (unlisten) unlisten.remove();
    };
  }, [pathname, router]);

  // --- 2. FIRST LAUNCH PERMISSIONS (ANDROID) ---
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const requestPermissions = async () => {
      try {
        // Notifications — check actual OS-level status rather than a local
        // "did we ask before" flag. If a previous attempt silently failed (or
        // the user hasn't actually granted it yet), this re-prompts instead
        // of giving up forever after one try.
        const notifStatus = await LocalNotifications.checkPermissions();
        if (notifStatus.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        // Camera: check actual OS-level status rather than a local "did we
        // ask before" flag, same reasoning as notifications above — if the
        // user denied it on first install (or revoked it later in system
        // settings), we want to re-prompt on next launch instead of leaving
        // barcode scanning silently broken forever.
        const camStatus = await Camera.checkPermissions();
        if (camStatus.camera !== 'granted') {
          await Camera.requestPermissions();
        }

        // Filesystem: only relevant on Android ≤12 (scoped storage on 13+
        // needs no runtime prompt), and only if the plugin exposes it.
        if ((Filesystem as any).checkPermissions && (Filesystem as any).requestPermissions) {
          const fsStatus = await (Filesystem as any).checkPermissions();
          if (fsStatus?.publicStorage !== 'granted') {
            await (Filesystem as any).requestPermissions();
          }
        }
      } catch (error) {
        console.error('Failed to request permissions on startup', error);
      }
    };
    requestPermissions();
  }, []);

  const handleExitApp = () => {
    if (Capacitor.isNativePlatform()) {
      App.exitApp();
    } else {
      window.close();
    }
  };

  if (!showExitConfirm) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center">
            <LogOut size={32} strokeWidth={2.5} />
          </div>
          
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">Exit Application?</h3>
            <p className="text-slate-500 text-sm">Are you sure you want to close Vyapar Sarthi?</p>
          </div>

          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={() => setShowExitConfirm(false)}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExitApp}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/25"
            >
              Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
