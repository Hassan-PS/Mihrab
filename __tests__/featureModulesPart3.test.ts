/**
 * Tests for tasks #41 + #43 + #44 — seasonal treatments, sound design,
 * and design-QA invariants.
 */

import {
  computeSeasonalTreatment,
  isInTahajjudWindow,
} from '../src/seasonal/treatments';
import {
  ADHAN_PROFILES,
  findAdhanProfile,
  profilesExceedingIosLimit,
  profilesNeedingNormalization,
  shouldPlayUiSound,
} from '../src/sound/sound';

const TODAY = {
  Fajr: '05:00', Sunrise: '06:00', Dhuhr: '12:00',
  Asr: '15:00', Maghrib: '18:00', Isha: '20:00',
};

const TOMORROW = {
  ...TODAY, Fajr: '05:02', Sunrise: '06:02',
};

// ─────────────────────────────────────────────────────────────────────────
// #41 Seasonal treatments
// ─────────────────────────────────────────────────────────────────────────
describe('seasonal treatments', () => {
  test('Friday before Maghrib → jumuah=true', () => {
    // 2026-05-08 is a Friday.
    const t = computeSeasonalTreatment(TODAY, TOMORROW, new Date(2026, 4, 8, 10, 0));
    expect(t.jumuah).toBe(true);
  });

  test('Friday evening → jumuah=false', () => {
    const t = computeSeasonalTreatment(TODAY, TOMORROW, new Date(2026, 4, 8, 19, 0));
    expect(t.jumuah).toBe(false);
  });

  test('Saturday → jumuah=false', () => {
    const t = computeSeasonalTreatment(TODAY, TOMORROW, new Date(2026, 4, 9, 10, 0));
    expect(t.jumuah).toBe(false);
  });

  test('Tahajjud window: 1 hour after Isha until Fajr', () => {
    // 21:30 — 1.5 hours after Isha 20:00 → in window.
    expect(isInTahajjudWindow(TODAY, TOMORROW, new Date(2026, 4, 8, 21, 30))).toBe(true);
    // 20:30 — too soon after Isha (only 30 min), not yet "deep night".
    expect(isInTahajjudWindow(TODAY, TOMORROW, new Date(2026, 4, 8, 20, 30))).toBe(false);
    // 13:00 — afternoon, never in window.
    expect(isInTahajjudWindow(TODAY, TOMORROW, new Date(2026, 4, 8, 13, 0))).toBe(false);
  });

  test('eid flag is null on non-eid days', () => {
    const t = computeSeasonalTreatment(TODAY, TOMORROW, new Date(2026, 4, 8, 10, 0));
    expect(t.eid).toBeNull();
  });

  test('returned object has all six flags shaped correctly', () => {
    const t = computeSeasonalTreatment(TODAY, TOMORROW, new Date(2026, 4, 8, 10, 0));
    expect(typeof t.jumuah).toBe('boolean');
    expect(typeof t.ramadan).toBe('boolean');
    expect(typeof t.laylatAlQadrCandidate).toBe('boolean');
    expect(typeof t.tahajjudWindow).toBe('boolean');
    expect(t.eid === null || t.eid === 'fitr' || t.eid === 'adha').toBe(true);
    // event is either null or an object with id
    expect(t.event === null || typeof t.event.id === 'string').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #43 Sound design
// ─────────────────────────────────────────────────────────────────────────
describe('sound design', () => {
  test('all bundled adhan profiles target -16 LUFS', () => {
    for (const p of ADHAN_PROFILES) {
      expect(p.targetLufs).toBe(-16);
    }
  });

  test('no profile exceeds 30-second iOS limit', () => {
    expect(profilesExceedingIosLimit()).toEqual([]);
  });

  test('default profile is always normalised (no-op)', () => {
    expect(findAdhanProfile('default')?.normalized).toBe(true);
  });

  test('profilesNeedingNormalization lists the bundled voices that need the pipeline', () => {
    const needed = profilesNeedingNormalization();
    // Currently: every profile other than 'default' is awaiting normalisation.
    expect(needed).toContain('mishary');
    expect(needed).toContain('abdulBasit');
    expect(needed).not.toContain('default');
  });

  test('shouldPlayUiSound: default off (user must opt in)', () => {
    expect(
      shouldPlayUiSound({ uiSoundsEnabled: false, inTahajjudWindow: false }),
    ).toBe(false);
  });

  test('shouldPlayUiSound: tahajjud window suppresses even if enabled', () => {
    expect(
      shouldPlayUiSound({ uiSoundsEnabled: true, inTahajjudWindow: true }),
    ).toBe(false);
  });

  test('shouldPlayUiSound: silent mode suppresses', () => {
    expect(
      shouldPlayUiSound({
        uiSoundsEnabled: true,
        inTahajjudWindow: false,
        silentMode: true,
      }),
    ).toBe(false);
  });

  test('shouldPlayUiSound: enabled + clear context plays', () => {
    expect(
      shouldPlayUiSound({
        uiSoundsEnabled: true,
        inTahajjudWindow: false,
        silentMode: false,
      }),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #44 Design QA invariants
// ─────────────────────────────────────────────────────────────────────────
describe('design QA invariants', () => {
  test('component library exports the expected primitives', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ui = require('../src/components/ui');
    expect(ui).toHaveProperty('Card');
    expect(ui).toHaveProperty('Button');
    expect(ui).toHaveProperty('Banner');
    expect(ui).toHaveProperty('EmptyState');
    expect(ui).toHaveProperty('Skeleton');
  });

  test('icon module exports the in-house Islamic motifs', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const icons = require('../src/theme/icons');
    expect(icons).toHaveProperty('CrescentIcon');
    expect(icons).toHaveProperty('MihrabArchIcon');
    expect(icons).toHaveProperty('EightPointStarIcon');
    expect(icons).toHaveProperty('TasbihIcon');
    expect(icons).toHaveProperty('BookIcon');
    expect(icons).toHaveProperty('MosqueIcon');
  });

  test('motion module exports the four named easing curves', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('../src/theme/motion');
    expect(m.EASING_BEZIERS.emphasized).toBeDefined();
    expect(m.EASING_BEZIERS.standard).toBeDefined();
    expect(m.EASING_BEZIERS.decelerated).toBeDefined();
    expect(m.EASING_BEZIERS.accelerated).toBeDefined();
  });

  test('typography exposes nine type tokens with the documented names', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TYPE } = require('../src/theme/typography');
    const expected = [
      'display', 'title1', 'title2', 'title3', 'headline',
      'body', 'callout', 'footnote', 'caption',
    ];
    for (const k of expected) expect(TYPE).toHaveProperty(k);
  });
});
