import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFakeDataLayer, createSupabaseDataLayer, defaultTokenStorage, type DataLayer } from '@bb/api';
import type { BrandTheme } from '@bb/ui';

/** Il brand arriva da app.config.ts (brands/<id>/brand.json). */
export interface BrandConfig {
  id: string;
  salonName: string;
  theme: BrandTheme;
  backend: { supabaseUrl?: string; supabaseAnonKey?: string; fakeServerUrl?: string };
  features: { multiStaff: boolean };
  legal: { businessName: string; supportEmail: string; privacyUrl?: string };
  demo?: { staffEmail?: string; staffPassword?: string };
}

export const brand = (Constants.expoConfig?.extra?.brand ?? {}) as BrandConfig;

/**
 * Backend:
 *  - EXPO_PUBLIC_BACKEND=fake  -> server finto locale (pnpm dev:server), comodo per sviluppare offline
 *  - altrimenti, se il brand ha supabaseUrl -> Supabase
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY sovrascrivono il brand (es. un progetto di prova).
 */
export function createDataLayer(): DataLayer {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? brand.backend?.supabaseUrl;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? brand.backend?.supabaseAnonKey;
  const storageKey = `bb.${brand.id}.client.session`;
  if (process.env.EXPO_PUBLIC_BACKEND !== 'fake' && url && key) {
    return createSupabaseDataLayer({ url, publishableKey: key, storageKey, storage: Platform.OS === 'web' ? undefined : AsyncStorage });
  }
  const baseUrl = process.env.EXPO_PUBLIC_FAKE_URL ?? brand.backend?.fakeServerUrl ?? 'http://localhost:8787';
  return createFakeDataLayer({ baseUrl, storage: defaultTokenStorage(storageKey) });
}
