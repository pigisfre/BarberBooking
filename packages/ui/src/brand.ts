/**
 * Colori del brand del cliente: stesso algoritmo di replica/design/build_tokens.py
 * (il test brand.test.ts confronta i due risultati). Dato un "accent", ricava
 * on-accent, accent-text e accent-tint sempre leggibili (WCAG AA).
 */
export type Palette = Record<string, string>;

function hexToRgb(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

// Python usa round() "bancario" (alla pari): lo replichiamo per avere gli stessi esadecimali
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, roundHalfEven(c))).toString(16).padStart(2, '0')).join('');
}

export function luminance(h: string): number {
  const ch = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(h).map(ch) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex(ra.map((x, i) => x + (rb[i]! - x) * t));
}

export function readableOn(accent: string, backgrounds: string[], toward: string, need = 4.5): string | null {
  for (let i = 0; i <= 100; i++) {
    const c = mix(accent, toward, i / 100);
    if (backgrounds.every((bg) => contrast(c, bg) >= need)) return c;
  }
  return null;
}

/** Sostituisce i token brand della palette. Lancia se il colore non si puo rendere leggibile. */
export function deriveBrand(theme: Palette, accentIn: string, dark: boolean): Palette {
  const surface = theme.surface!;
  const bg = theme.bg!;
  let accent = accentIn;
  if (contrast(accent, surface) < 3) {
    const fixed = readableOn(accent, [surface, bg], dark ? '#ffffff' : '#000000', 3);
    if (!fixed) throw new Error(`accent ${accentIn}: impossibile renderlo visibile`);
    accent = fixed;
  }
  const white = '#ffffff';
  const ink = '#0b0b0d';
  const on = contrast(white, accent) >= contrast(ink, accent) ? white : ink;
  if (contrast(on, accent) < 4.5) throw new Error(`accent ${accentIn}: nessun testo leggibile sopra`);
  const tint = mix(surface, accent, dark ? 0.22 : 0.1);
  const text = readableOn(accent, [surface, bg, tint], dark ? '#ffffff' : '#000000');
  if (!text) throw new Error(`accent ${accentIn}: impossibile ricavare accent-text`);
  return { ...theme, accent, 'on-accent': on, 'accent-text': text, 'accent-tint': tint };
}

/** Per il tema scuro, se il brand non da "accentDark": l'accent schiarito quanto basta su surface scuro. */
export function darkAccentFrom(accent: string, darkSurface: string): string {
  return readableOn(accent, [darkSurface], '#ffffff', 3) ?? accent;
}
