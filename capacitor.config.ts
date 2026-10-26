import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thot.hollowhouse.sevennights',
  appName: 'The Hollow House: Seven Nights',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
