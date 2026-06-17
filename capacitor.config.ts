import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kiranamanager.app',
  appName: 'Kirana Manager',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
