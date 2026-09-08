/**
 * The sky behind today's countdown follows the prayer being counted to,
 * is true to the hour whatever the theme, and carries its own ink.
 * See src/screens/home/skyModel.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  skyBodyPosition,
  skyFor,
  skyInk,
  skyPhaseFor,
  type SkyPhase,
} from '../src/screens/home/skyModel';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const PHASES: SkyPhase[] = ['night', 'predawn', 'dawn', 'morning', 'afternoon', 'sunset', 'dusk'];

/** WCAG relative luminance of a #rrggbb. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('which sky', () => {
  it('follows the target prayer through the day', () => {
    expect(skyPhaseFor('Fajr')).toBe('predawn');
    expect(skyPhaseFor('Sunrise')).toBe('dawn');
    expect(skyPhaseFor('Dhuhr')).toBe('morning');
    expect(skyPhaseFor('Asr')).toBe('afternoon');
    expect(skyPhaseFor('Maghrib')).toBe('sunset');
    expect(skyPhaseFor('Isha')).toBe('dusk');
    for (const k of ['Midnight', 'Lastthird', 'Firstthird', 'anything']) {
      expect(skyPhaseFor(k)).toBe('night');
    }
  });

  it('is the same sky in both themes — the hour decides, not the theme', () => {
    // `skyFor` takes no theme. A light app at midnight shows a dark sky.
    expect(skyFor.length).toBe(1);
    expect(luminance(skyFor('night').top)).toBeLessThan(0.05);
    expect(luminance(skyFor('morning').bottom)).toBeGreaterThan(0.8);
  });

  it('puts the sun in the day skies, the moon at night, stars only after dark', () => {
    expect(skyFor('morning').body).toBe('sun');
    expect(skyFor('sunset').body).toBe('sun');
    expect(skyFor('night').body).toBe('moon');
    expect(skyFor('predawn').body).toBe('moon');
    expect(skyFor('dusk').body).toBe('none');
    for (const p of PHASES) {
      expect(skyFor(p).stars).toBe(p === 'night' || p === 'predawn' || p === 'dusk');
    }
  });
});

describe('the ink', () => {
  it('reads on every sky it is set on, top and bottom, at AA or better', () => {
    // The countdown and the eyebrow sit over the whole gradient; whatever
    // Material You or the theme does, this text is the sky's own.
    for (const p of PHASES) {
      const sky = skyFor(p);
      const { text } = skyInk(sky);
      expect(contrast(text, sky.top)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, sky.bottom)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is light on the dark skies and dark on the light ones', () => {
    for (const p of PHASES) {
      const sky = skyFor(p);
      const mid = (luminance(sky.top) + luminance(sky.bottom)) / 2;
      expect(sky.ink).toBe(mid < 0.35 ? 'light' : 'dark');
    }
  });

  it('is what the hero paints its text, rail and date with', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    const hero = card.slice(card.indexOf('const HeroToday = memo('), card.indexOf('function HeroOtherDay'));
    expect(hero).toMatch(/const ink = skyInk\(skyFor\(skyPhaseFor\(target\.name\)\)\)/);
    expect(hero).not.toMatch(/palette\./);
    expect(hero).toMatch(/color: ink\.text/);
    expect(hero).toMatch(/backgroundColor: ink\.track/);
    expect(hero).toMatch(/backgroundColor: ink\.fill/);
  });
});

describe('where the body is', () => {
  it('rises towards sunrise and sets towards Maghrib', () => {
    expect(skyBodyPosition('dawn', 0).y).toBeGreaterThan(skyBodyPosition('dawn', 1).y);
    expect(skyBodyPosition('sunset', 0).y).toBeLessThan(skyBodyPosition('sunset', 1).y);
  });

  it('keeps to the top strip between the eyebrow and the Qibla chip', () => {
    for (const p of PHASES) {
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const { x, y } = skyBodyPosition(p, f);
        expect(x).toBeGreaterThanOrEqual(0.3);
        expect(x).toBeLessThanOrEqual(0.66);
        expect(y).toBeGreaterThan(0.05);
        expect(y).toBeLessThanOrEqual(0.32);
      }
    }
  });

  it('clamps progress', () => {
    expect(skyBodyPosition('night', -1)).toEqual(skyBodyPosition('night', 0));
    expect(skyBodyPosition('night', 7)).toEqual(skyBodyPosition('night', 1));
  });
});

describe('the drawing', () => {
  it('is painted at full strength, percent geometry, no horizon line', () => {
    const sky = read('src/screens/home/HeroSky.tsx');
    expect(sky).toMatch(/<Svg width="100%" height="100%">/);
    expect(sky).toMatch(/<Stop offset="0" stopColor=\{sky\.top\} \/>/);
    expect(sky).not.toMatch(/isDark|alpha|SKY_HORIZON|horizonY/);
    expect(sky).toMatch(/pointerEvents="none"/);
  });
});
