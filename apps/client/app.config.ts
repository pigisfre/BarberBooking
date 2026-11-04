import type { ConfigContext, ExpoConfig } from 'expo/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadBrand } = require('../../brands/load.js');

/** Configurazione per cliente: BRAND=<id> sceglie brands/<id>/brand.json (default: demo). */
export default ({ config }: ConfigContext): ExpoConfig => {
  const { brand, asset } = loadBrand(process.env.BRAND);
  const app = brand.apps.client;
  const icon = asset(brand.assets?.appIcon) ?? './assets/images/icon.png';
  const splash = asset(brand.assets?.splash) ?? './assets/images/splash-icon.png';
  return {
    ...config,
    name: app.name,
    slug: `${brand.id}-client`,
    scheme: app.scheme,
    version: '0.1.0',
    orientation: 'default',
    icon,
    userInterfaceStyle: 'automatic',
    ios: { bundleIdentifier: app.iosBundleId, supportsTablet: true },
    android: {
      package: app.androidPackage,
      adaptiveIcon: {
        backgroundColor: '#ffffff',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
    },
    web: { output: 'single', favicon: asset(brand.assets?.favicon) ?? './assets/images/favicon.png', name: app.name },
    plugins: ['expo-router', ['expo-splash-screen', { image: splash, imageWidth: 76, backgroundColor: '#ffffff' }]],
    experiments: { reactCompiler: true },
    extra: { app: 'client', brand },
  };
};
