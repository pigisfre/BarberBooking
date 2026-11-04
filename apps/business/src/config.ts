import Constants from 'expo-constants';
import { createFakeDataLayer, defaultTokenStorage, type DataLayer } from '@bb/api';
import type { BrandTheme } from '@bb/ui';

/** Il brand del cliente (il barbiere) arriva da app.config.ts (brands/<id>/brand.json). */
export interface BrandConfig {
  id: string;
  salonName: string;
  theme: BrandTheme;
  backend: { supabaseUrl: string | null; supabaseAnonKey: string | null; fakeServerUrl?: string };
  features: { multiStaff: boolean };
  legal: { businessName: string; supportEmail: string; privacyUrl: string | null };
}

export const brand = (Constants.expoConfig?.extra?.brand ?? {}) as BrandConfig;

/**
 * Data layer: per ora il backend finto (pnpm dev:server). replica-backend aggiungera
 * l'implementazione Supabase con la stessa firma, scelta quando brand.backend.supabaseUrl e impostato.
 */
export function createDataLayer(): DataLayer {
  const baseUrl = process.env.EXPO_PUBLIC_FAKE_URL ?? brand.backend?.fakeServerUrl ?? 'http://localhost:8787';
  return createFakeDataLayer({ baseUrl, storage: defaultTokenStorage(`bb.${brand.id}.business.session`) });
}
