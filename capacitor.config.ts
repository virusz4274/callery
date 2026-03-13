import type { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';
const productionUrl = 'https://vosift.virusz4274.tech';
const devUrl = 'http://10.0.0.169:9000';

const config: CapacitorConfig = {
  appId: 'com.coarde.vosift',
  appName: 'Vosift',
  webDir: 'public',

  // Load the app from remote server (keeps Server Actions working)
  server: {
    // Dynamically switch URL based on environment
    url: isProduction ? productionUrl : devUrl,
    cleartext: !isProduction, // Allow HTTP only in development
  },

  android: {
    // Allow mixed content (HTTP images on HTTPS pages if needed)
    allowMixedContent: true,
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
