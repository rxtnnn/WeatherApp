import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'weatherApp',
  webDir: 'www',
  server: {
    allowNavigation: [
      'openweathermap.org',
      'api.openweathermap.org'
    ]
  }
};

export default config;
