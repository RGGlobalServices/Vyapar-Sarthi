import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vyaparsarthii.app',
  appName: 'Vyapar Sarthi',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    url: 'https://app.vyaparsarthii.com/',
    cleartext: false,
  },
  android: {
    // Standard Chrome Android UA so Cloudflare doesn't flag the WebView as a bot.
    // Without this, Cloudflare Bot Fight Mode returns a challenge HTML page
    // instead of the actual app response.
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      backgroundColor: '#0f172a',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: false,
    },
  },
};

export default config;
