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
  }
};

export default config;
