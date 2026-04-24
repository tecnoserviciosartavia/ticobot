import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL || 'https://tu-dominio.com';

const config: CapacitorConfig = {
  appId: 'com.ticocast.ticobot',
  appName: 'TicoBot',
  webDir: 'public/build',
  server: {
    url: serverUrl,
    cleartext: true,
  },
};

export default config;
