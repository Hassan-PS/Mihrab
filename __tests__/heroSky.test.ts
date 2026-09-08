/**
 * The sky behind today's countdown follows the prayer being counted to.
 * See src/screens/home/skyModel.ts for the model and why it is a wash.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  skyBodyPosition,
  skyFor,
  skyPhaseFor,
  type SkyPhase,
} from '../src/screens/home/skyModel';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const PHASES: SkyPhase[] = ['night', 'predawn', 'dawn', 'morning', 'afternoon', 'sunset', 'dusk'];

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

  it('is a wash: never opaque, deeper in the dark theme', () => {
    for (const p of PHASES) {
      const light = skyFor(p, false);
      const dark = skyFor(p, true);
      expect(light.alpha).toBeLessThanOrEqual(0.35);
      expect(dark.alpha).toBeLessThanOrEqual(0.6);
      expect(dark.alpha).toBeGreaterThan(light.alpha);
      for (const c of [light.top, light.bottom, light.glow, dark.top, dark.bottom, dark.glow]) {
        expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('puts the sun in the day skies, the moon at night, stars only after dark', () => {
    expect(skyFor('morning', false).body).toBe('sun');
    expect(skyFor('sunset', true).body).toBe('sun');
    expect(skyFor('night', false).body).toBe('moon');
    expect(skyFor('predawn', true).body).toBe('moon');
    expect(skyFor('dusk', false).body).toBe('none');
    for (const p of PHASES) {
      const s = skyFor(p, false);
      expect(s.stars).toBe(p === 'night' || p === 'predawn' || p === 'dusk');
    }
  });
});

describe('where the body is', () => {
  it('rises towards sunrise and sets towards Maghrib', () => {
    expect(skyBodyPosition('dawn', 0).y).toBeGreaterThan(skyBodyPosition('dawn', 1).y);
    expect(skyBodyPosition('sunset', 0).y).toBeLessThan(skyBodyPosition('sunset', 1).y);
    // And stays in the top strip, clear of the countdown.
    expect(skyBodyPosition('sunset', 1).y).toBeLessThanOrEqual(0.32);
  });

  it('keeps to the top strip between the eyebrow and the Qibla chip', () => {
    // The first cut put a glowing moon behind the "5h" of the countdown.
    for (const p of PHASES) {
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const { x, y } = skyBodyPosition(p, f);
        expect(x).toBeGreaterThanOrEqual(0.3);
        expect(x).toBeLessThanOrEqual(0.66);
        expect(y).toBeGreaterThan(0.05);
        expect(y).toBeLessThanOrEqual(0.32);
      }
    }
    const mid = skyBodyPosition('morning', 0.5).y;
    expect(mid).toBeLessThan(skyBodyPosition('morning', 0).y);
    expect(mid).toBeLessThan(skyBodyPosition('morning', 1).y);
  });

  it('clamps progress', () => {
    expect(skyBodyPosition('night', -1)).toEqual(skyBodyPosition('night', 0));
    expect(skyBodyPosition('night', 7)).toEqual(skyBodyPosition('night', 1));
  });
});

describe('the hero mounts it', () => {
  it('under the countdown, out to the card edges, moving with the rail', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/<HeroSky\s+targetKey=\{target\.name\}/);
    expect(card).toMatch(/progress=\{rail \? Math\.round\(rail\.pct \* 100\) \/ 100 : 0\}/);
    expect(card).toMatch(/bleed=\{\{/);
    const sky = read('src/screens/home/HeroSky.tsx');
    expect(sky).toMatch(/pointerEvents="none"/);
    // Percent geometry only: the same drawing fits every hero size.
    expect(sky).toMatch(/<Svg width="100%" height="100%">/);
    // No horizon line: it ran through the date under the countdown.
    expect(sky).not.toMatch(/SKY_HORIZON|horizonY/);
  });
});
