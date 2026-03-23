import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roan.solace',
  appName: 'Solace',
  webDir: 'out',
  server: {
    // Keep a secure context on Android WebView for improved API/browser compatibility.
    androidScheme: 'https',
  },
};

export default config;
