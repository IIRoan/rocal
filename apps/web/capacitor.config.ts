import type { CapacitorConfig } from '@capacitor/cli';

const isProduction = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.roan.solace',
  appName: 'Solace',
  webDir: 'out',
  server: {
    // Local auth debugging runs against the backend API URL via adb reverse.
    // Keep dev on `http://localhost` so cookie semantics match. Production stays https.
    ...(isProduction
      ? {
          url: 'https://solace.onl',
        }
      : {}),
    androidScheme: isProduction ? 'https' : 'http',
  },
};

export default config;
