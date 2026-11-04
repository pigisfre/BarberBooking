import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, useColorScheme: () => 'light' }));
const { createTheme } = await import('./theme');

describe('createTheme', () => {
  for (const scheme of ['light', 'dark'] as const) {
    // accentDark: {} e quello che arriva davvero quando brand.json contiene null (serializzazione di Expo)
    for (const brand of [undefined, { accent: '#2f52b8', accentDark: null }, { accent: '#7a1f2b' }, { accent: '#2f52b8', accentDark: {} as never }]) {
      it(`${scheme} ${brand?.accent ?? 'base'}`, () => {
        const t = createTheme(scheme, brand);
        for (const [k, v] of Object.entries(t.c)) expect(typeof v, k).toBe('string');
        expect(t.c.onAccent).toMatch(/^#/);
        expect(t.staff(1).bg).toMatch(/^#/);
      });
    }
  }
});
