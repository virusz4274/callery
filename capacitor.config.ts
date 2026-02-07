import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coarde.vosift',
  appName: 'Vosift',
  webDir: 'public',

  // Load the app from remote server (keeps Server Actions working)
  server: {
    // For development, use your local IP (find with `ipconfig getifaddr en0`)
    // For production, use your deployed URL: 'https://your-domain.com'
    url: 'http://10.0.0.186:9000',
    cleartext: true, // Allow HTTP for development
  },

  android: {
    // Allow mixed content (HTTP images on HTTPS pages if needed)
    allowMixedContent: true,
  },
};

export default config;

