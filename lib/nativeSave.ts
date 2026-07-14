'use client';

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Blob downloads via `<a download>` don't work inside the Capacitor Android
// WebView — there's no native DownloadListener wired up, so the click is a
// silent no-op. On native platforms we instead write the file to cache and
// hand it to the OS share sheet, which lets the user save it to Downloads,
// Drive, WhatsApp, etc. — the standard, permission-free way to "download" a
// file from an embedded WebView. Returns true if handled natively (caller
// should skip its normal web download path), false on web (fall through).
export async function saveOrShareBlob(blob: Blob, filename: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const base64 = await blobToBase64(blob);
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: filename,
      url: result.uri,
    });
    return true;
  } catch (err) {
    console.error('Native save/share failed:', err);
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — Filesystem.writeFile wants raw base64.
      resolve(result.substring(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
