import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kiranamanager.app',
  appName: 'Kirana Manager',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // TODO: Replace with your actual production URL (e.g., https://vyapar-sarthi.com)
    url: 'https://vyapar-sarthi.com',
    cleartext: true
  }
};

export default config;
