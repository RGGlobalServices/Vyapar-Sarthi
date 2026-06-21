import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kiranamanager.app',
  appName: 'Kirana Manager',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // Points to your hosted production application
    url: 'https://app.vyaparsarthii.com/',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      androidSplashResourceName: "splash",
      androidScaleType: "FIT_CENTER",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#FF0000",
      splashFullScreen: true,
      splashImmersive: true,
      backgroundColor: "#FFFFFF",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#FFFFFF",
      overlaysWebView: false
    }
  }
};

export default config;
