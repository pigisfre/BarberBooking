import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import tokens from '../../../replica/design/tokens.json';
import { contrast, darkAccentFrom, deriveBrand } from './brand';

const ROOT = resolve(__dirname, '../../..');
const KEYS = ['accent', 'on-accent', 'accent-text', 'accent-tint'] as const;

function python(accent: string) {
  const dir = mkdtempSync(join(tmpdir(), 'brand-'));
  writeFileSync(join(dir, 'b.json'), JSON.stringify({ accent }));
  execFileSync('python3', [join(ROOT, 'replica/design/build_tokens.py'), '--brand', join(dir, 'b.json'), '--out', dir], { stdio: 'pipe' });
  return JSON.parse(readFileSync(join(dir, 'tokens.resolved.json'), 'utf8')).color;
}

describe('colori del brand: TypeScript = Python', () => {
  for (const accent of ['#2f52b8', '#c9a227', '#7a1f2b', '#111111', '#b8f2d8', '#ffffff']) {
    it(accent, () => {
      const py = python(accent);
      const light = deriveBrand(tokens.color.light, accent, false);
      const dark = deriveBrand(tokens.color.dark, darkAccentFrom(accent, tokens.color.dark.surface), true);
      for (const k of KEYS) {
        expect(light[k], `light ${k}`).toBe(py.light[k]);
        expect(dark[k], `dark ${k}`).toBe(py.dark[k]);
      }
      expect(contrast(light['on-accent']!, light.accent!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark['accent-text']!, dark['accent-tint']!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
