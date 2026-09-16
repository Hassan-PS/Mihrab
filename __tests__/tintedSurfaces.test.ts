/**
 * Verdant theme (`tintedSurfaces`) — curated preset themes, not a wash —
 * must stay legible, and must bar custom hex.
 *
 * Builds the brand palette for every selectable accent, in light and dark,
 * with the mode ON, and asserts that:
 *
 *   • body text still clears WCAG AA (4.5:1) on themed surfaces;
 *   • muted text still clears AA on its own control ground;
 *   • custom hex is coerced to brand green under Verdant;
 *   • presets keep their own accent solid (not forced to green);
 *   • light is the release look (surfaces untouched); dark is one hue, a
 *     monotonic ladder, the accent on top of the chroma hierarchy — from
 *     one OKLCH formula, no per-accent hex table.
 *
 * And that with the mode OFF, every accent-surface token collapses to its
 * neutral counterpart.
 */
import { buildAppPalette, darkTonalSurfaces, verdantTintHue } from '../src/theme/appPalette';
import { contrastRatio } from '../src/theme/themeMap';
import { hexToOklch } from '../src/theme/oklch';
import type { AppAccentId } from '../src/settings/types';

const PRESET_ACCENTS: AppAccentId[] = [
  'green',
  'teal',
  'blue',
  'amber',
  'rose',
  'violet',
];

const CUSTOM_HEXES = ['#22c55e', '#ff0000', '#000000', '#ffffff', '#6b7280'];

const PRESET_SOLID: Record<
  Exclude<AppAccentId, 'custom'>,
  { light: string; dark: string }
> = {
  green: { light: '#1F5F4A', dark: '#46A081' },
  teal: { light: '#0d9488', dark: '#5eead4' },
  blue: { light: '#2563eb', dark: '#7dd3fc' },
  amber: { light: '#b45309', dark: '#fbbf24' },
  rose: { light: '#9F2D4D', dark: '#E58FA6' },
  violet: { light: '#5B4B9E', dark: '#B4A6E8' },
};

type Case = { accentId: AppAccentId; customHex: string; isDark: boolean };

const CASES: Case[] = [];
for (const isDark of [false, true]) {
  for (const accentId of PRESET_ACCENTS) {
    CASES.push({ accentId, customHex: '#22c55e', isDark });
  }
  for (const customHex of CUSTOM_HEXES) {
    CASES.push({ accentId: 'custom', customHex, isDark });
  }
}

describe('Verdant theme stays legible', () => {
  for (const { accentId, customHex, isDark } of CASES) {
    const label = `${accentId}${
      accentId === 'custom' ? `(${customHex})` : ''
    } · ${isDark ? 'dark' : 'light'}`;

    it(`keeps AA contrast — ${label}`, () => {
      const p = buildAppPalette(isDark, false, accentId, customHex, true);
      const text = p.textSolid;
      const muted = p.mutedSolid;

      expect(contrastRatio(text, String(p.bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text, String(p.card))).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(text, String(p.accentSurface)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(text, String(p.accentSurfaceStrong)),
      ).toBeGreaterThanOrEqual(4.5);

      expect(
        contrastRatio(muted, String(p.controlBg)),
      ).toBeGreaterThanOrEqual(4.5);

      expect(
        contrastRatio(p.onAccentSurface, String(p.accentSurface)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(p.onAccentSurface, String(p.accentSurfaceStrong)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('Verdant accent rules', () => {
  for (const isDark of [false, true]) {
    for (const accentId of PRESET_ACCENTS) {
      it(`keeps preset accent — ${accentId} · ${isDark ? 'dark' : 'light'}`, () => {
        const p = buildAppPalette(isDark, false, accentId, '#ff0000', true);
        const expected = PRESET_SOLID[accentId as Exclude<AppAccentId, 'custom'>][
          isDark ? 'dark' : 'light'
        ];
        expect(p.accentSolid).toBe(expected);
      });
    }

    it(`coerces custom hex to green — ${isDark ? 'dark' : 'light'}`, () => {
      const p = buildAppPalette(isDark, false, 'custom', '#ff0000', true);
      expect(p.accentSolid).toBe(isDark ? '#46A081' : '#1F5F4A');
    });
  }

});

/**
 * Light is the release look; dark is a disciplined tonal theme.
 *
 * Light: with Verdant ON, every surface is exactly what it is with Verdant
 * OFF — warm parchment, the accent as ink and soft highlights. Dark: one
 * hue, a ladder that lifts toward light, the accent on top of the chroma
 * hierarchy, and contrast floors — the disciplines the palette comment
 * describes, pinned.
 */
describe('Verdant: light untouched, dark disciplined', () => {
  const lch = (v: unknown) => hexToOklch(String(v));
  const hueDiff = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);

  for (const accentId of PRESET_ACCENTS) {
    it(`light: surfaces are the release look, untouched — ${accentId}`, () => {
      const on = buildAppPalette(false, false, accentId, '#22c55e', true);
      const off = buildAppPalette(false, false, accentId, '#22c55e', false);
      expect(on.bg).toBe(off.bg);
      expect(on.card).toBe(off.card);
      expect(on.controlBg).toBe(off.controlBg);
      expect(on.border).toBe(off.border);
      expect(on.accentSurface).toBe(off.bg);
      expect(on.accentSurfaceStrong).toBe(off.card);
      expect(on.accentHairline).toBe(off.border);
      // The accent itself is unchanged too — it keeps doing what it did.
      expect(on.accentSolid).toBe(off.accentSolid);
      expect(on.accentBg).toBe(off.accentBg);
      // The toggle still holds, so native hints and the card can route on it.
      expect(on.tintedSurfaces).toBe(true);
    });

    it(`dark: clearly the colour, ladder lifts toward light — ${accentId}`, () => {
      const p = buildAppPalette(true, false, accentId, '#22c55e', true);
      const L = (v: unknown) => lch(v).L;
      const C = (v: unknown) => lch(v).C;
      expect(L(p.bg)).toBeGreaterThanOrEqual(0.17);
      expect(L(p.bg)).toBeLessThanOrEqual(0.22);
      expect(C(p.bg)).toBeGreaterThanOrEqual(0.02);
      expect(C(p.bg)).toBeLessThanOrEqual(0.05);
      // bg < chrome < card < controlBg < strong < border.
      expect(L(p.accentSurface)).toBeGreaterThan(L(p.bg));
      expect(L(p.card)).toBeGreaterThan(L(p.accentSurface));
      expect(L(p.controlBg)).toBeGreaterThan(L(p.card));
      expect(L(p.accentSurfaceStrong)).toBeGreaterThan(L(p.controlBg));
      expect(L(p.border)).toBeGreaterThan(L(p.accentSurfaceStrong));
      // Muted-ink AA ceiling on the controls ground.
      expect(L(p.controlBg)).toBeLessThanOrEqual(0.29);
      // Accent on top of the chroma hierarchy.
      expect(C(p.accentSolid)).toBeGreaterThan(C(p.accentSurfaceStrong));
    });

    it(`dark: carries the accent's own hue on every surface — ${accentId}`, () => {
      const p = buildAppPalette(true, false, accentId, '#22c55e', true);
      const hue = verdantTintHue(accentId, true);
      for (const v of [p.bg, p.card, p.accentSurface, p.accentSurfaceStrong]) {
        expect(hueDiff(lch(v).h, hue)).toBeLessThanOrEqual(12);
      }
    });
  }
});

describe('mode off is the untouched default', () => {
  for (const isDark of [false, true]) {
    it(`collapses tokens to neutral — ${isDark ? 'dark' : 'light'}`, () => {
      const off = buildAppPalette(isDark, false, 'green', '#22c55e', false);
      expect(off.accentSurface).toBe(off.bg);
      expect(off.accentSurfaceStrong).toBe(off.card);
      expect(off.accentHairline).toBe(off.border);
      expect(off.tintedSurfaces).toBe(false);

      const on = buildAppPalette(isDark, false, 'green', '#22c55e', true);
      expect(on.tintedSurfaces).toBe(true);
      // Only dark does surface work; light is the release look either way.
      if (isDark) {
        expect(on.bg).not.toBe(off.bg);
        expect(on.accentSurfaceStrong).not.toBe(off.accentSurfaceStrong);
      } else {
        expect(on.bg).toBe(off.bg);
      }
    });
  }
});

describe('OLED pure-black chrome bands stay distinct', () => {
  it('keeps absolute black bg and themed bands for green', () => {
    const p = buildAppPalette(true, true, 'green', '#22c55e', true);
    expect(p.bg).toBe('#000000');
    expect(String(p.accentSurface).toLowerCase()).not.toBe('#000000');
    expect(String(p.accentSurfaceStrong).toLowerCase()).not.toBe('#000000');
    expect(p.accentSolid).toBe('#46A081');
  });

  it('sinks Verdant elevates below the mid-dark table', () => {
    const mid = buildAppPalette(true, false, 'green', '#22c55e', true);
    const oled = buildAppPalette(true, true, 'green', '#22c55e', true);
    // Same hue family, darker step — cards and bands must not float as
    // bright as mid-dark Verdant does on a pure-black page.
    const darker = (a: string, b: string) => {
      const n = (h: string) => parseInt(h.slice(1), 16);
      return n(a) < n(b);
    };
    expect(darker(String(oled.card), String(mid.card))).toBe(true);
    expect(
      darker(String(oled.accentSurface), String(mid.accentSurface)),
    ).toBe(true);
    expect(
      darker(String(oled.accentSurfaceStrong), String(mid.accentSurfaceStrong)),
    ).toBe(true);
    expect(contrastRatio(oled.textSolid, String(oled.card))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(oled.mutedSolid, String(oled.controlBg)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * System colours in dark take the SAME ladder Verdant paints, in the live
 * wallpaper hue — so a Material You colour is pronounced on every surface,
 * not only on the accent. Pinned on the shared builder with a few hues a
 * wallpaper might hand over.
 */
describe('system colours share the dark ladder', () => {
  const lch = (v: unknown) => hexToOklch(String(v));
  const hueDiff = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);
  const base = buildAppPalette(true, false, 'green', '#22c55e', false);
  const oled = buildAppPalette(true, true, 'green', '#22c55e', false);

  for (const h of [30, 120, 210, 300]) {
    it(`hue ${h}: lifts toward light, keeps AA, carries the hue`, () => {
      const sfc = darkTonalSurfaces(base, h);
      const L = (v: unknown) => lch(v).L;
      expect(L(sfc.accentSurface)).toBeGreaterThan(L(sfc.bg));
      expect(L(sfc.card)).toBeGreaterThan(L(sfc.accentSurface));
      expect(L(sfc.controlBg)).toBeGreaterThan(L(sfc.card));
      expect(L(sfc.accentSurfaceStrong)).toBeGreaterThan(L(sfc.controlBg));
      expect(L(sfc.controlBg)).toBeLessThanOrEqual(0.29);
      expect(contrastRatio(base.textSolid, String(sfc.bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(base.mutedSolid, String(sfc.controlBg))).toBeGreaterThanOrEqual(4.5);
      for (const v of [sfc.bg, sfc.card, sfc.accentSurface, sfc.accentSurfaceStrong]) {
        expect(hueDiff(lch(v).h, h)).toBeLessThanOrEqual(12);
      }
    });
  }

  it('OLED keeps absolute black and sinks the elevates', () => {
    const sfc = darkTonalSurfaces(oled, 120);
    expect(sfc.bg).toBe('#000000');
    expect(String(sfc.card).toLowerCase()).not.toBe('#000000');
    expect(lch(sfc.card).L).toBeLessThan(lch(darkTonalSurfaces(base, 120).card).L);
  });
});
