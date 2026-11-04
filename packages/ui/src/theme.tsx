/**
 * Tema: token di replica/design/tokens.json + colore del brand del cliente.
 * I componenti leggono SOLO da qui (ruoli: c.surface, c.textMuted, ...), mai esadecimali.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useColorScheme, type TextStyle } from 'react-native';
import tokens from '../../../replica/design/tokens.json';
import { darkAccentFrom, deriveBrand, type Palette } from './brand';

type Raw = typeof tokens.color.light;
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
export type Colors = { [K in keyof Raw as Camel<K & string>]: string };

const camel = (p: Palette) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k.replace(/-(\w)/g, (_, x: string) => x.toUpperCase()), v])) as Colors;

export type TypeVariant = Exclude<keyof typeof tokens.type, '_about'>;

export interface BrandTheme {
  accent: string;
  accentDark?: string | null;
  appearance?: 'system' | 'light' | 'dark';
}

export interface Theme {
  scheme: 'light' | 'dark';
  c: Colors;
  /** stile di testo pronto per <Text style>; tracking in px (0 su iOS: lo gestisce il font di sistema) */
  type: Record<TypeVariant, TextStyle>;
  space: (n: number) => number;
  radius: { xs: number; sm: number; md: number; lg: number; xl: number; pill: number };
  shadow: { card: string; pop: string; sheet: string; lift: string };
  motion: typeof tokens.motion;
  layout: typeof tokens.layout;
  material: typeof tokens.material.light;
  staff: (index: number) => { bg: string; ink: string };
}

function buildType(): Record<TypeVariant, TextStyle> {
  const out = {} as Record<TypeVariant, TextStyle>;
  for (const [k, v] of Object.entries(tokens.type)) {
    if (k.startsWith('_') || typeof v !== 'object') continue;
    out[k as TypeVariant] = {
      fontSize: v.size,
      lineHeight: v.line,
      fontWeight: String(v.weight) as TextStyle['fontWeight'],
      letterSpacing: Platform.OS === 'ios' ? 0 : v.tracking * v.size,
    };
  }
  return out;
}
const TYPE = buildType();

export function createTheme(scheme: 'light' | 'dark', brand?: BrandTheme): Theme {
  let palette: Palette = { ...tokens.color[scheme] };
  if (typeof brand?.accent === 'string' && brand.accent) {
    const dark = typeof brand.accentDark === 'string' && brand.accentDark ? brand.accentDark : null;
    const accent = scheme === 'dark' ? dark ?? darkAccentFrom(brand.accent, tokens.color.dark.surface) : brand.accent;
    palette = deriveBrand(palette, accent, scheme === 'dark');
  }
  const c = camel(palette);
  const { _about: _r, ...radius } = tokens.radius;
  const { _about: _s, ...shadow } = tokens.shadow;
  return {
    scheme,
    c,
    type: TYPE,
    space: (n) => n,
    radius,
    shadow,
    motion: tokens.motion,
    layout: tokens.layout,
    material: tokens.material[scheme],
    staff: (i) => {
      const n = ((((i - 1) % 6) + 6) % 6) + 1;
      return { bg: palette[`staff-${n}-bg`]!, ink: palette[`staff-${n}-ink`]! };
    },
  };
}

const ThemeCtx = createContext<Theme | null>(null);

export function ThemeProvider({ brand, children }: { brand?: BrandTheme; children: ReactNode }) {
  const system = useColorScheme();
  const scheme: 'light' | 'dark' =
    brand?.appearance === 'light' || brand?.appearance === 'dark' ? brand.appearance : system === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => createTheme(scheme, brand), [scheme, brand]);
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error('ThemeProvider mancante');
  return t;
}
