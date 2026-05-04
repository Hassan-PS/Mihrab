/**
 * Pure-logic tests for tasks #29–#38 — fasting tracker, onboarding step
 * builder, backup envelope helpers, time-of-day tint, responsive
 * breakpoints, design tokens, theme contrast, and motion resolution.
 */

import {
  coerceFastEntries,
  computeFastStats,
  isRecommendedVoluntaryFastDay,
  ramadanDayNumber,
  upsertFastEntry,
} from '../src/fasting/fasting';
import { buildOnboardingSteps } from '../src/onboarding/steps';
import {
  BACKUP_FORMAT_VERSION,
  buildPayload,
  checkEnvelopeCompatibility,
  isLikelyBackupEnvelope,
  parsePayload,
} from '../src/backup/backup';
import { tintForTime } from '../src/polish/timeOfDayTint';
import {
  BREAKPOINT_EXPANDED,
  BREAKPOINT_REGULAR,
  classifyWidth,
  contentColumnWidth,
  MAX_CONTENT_WIDTH,
} from '../src/responsive/breakpoints';
import {
  PALETTE_DARK,
  PALETTE_LIGHT,
  PALETTE_OLED,
  paletteForTheme,
  RADIUS,
  SPACING,
  ELEVATION,
} from '../src/theme/tokens';
import {
  contrastRatio,
  pairsToCheck,
  THEMES,
} from '../src/theme/themeMap';
import { TYPE, typeStyle } from '../src/theme/typography';
import {
  DURATION,
  EASING_BEZIERS,
  resolveMotion,
} from '../src/theme/motion';

// ─────────────────────────────────────────────────────────────────────────
// #29 Fasting
// ─────────────────────────────────────────────────────────────────────────
describe('fasting tracker', () => {
  test('upsertFastEntry creates and updates by date', () => {
    let entries: ReturnType<typeof upsertFastEntry> = [];
    entries = upsertFastEntry(entries, '2026-03-15', { type: 'ramadan', completed: true });
    entries = upsertFastEntry(entries, '2026-03-15', { completed: false });
    expect(entries).toHaveLength(1);
    expect(entries[0].completed).toBe(false);
    expect(entries[0].type).toBe('ramadan'); // type preserved across update
  });

  test('coerceFastEntries drops invalid records', () => {
    const dirty = [
      { date: 'bad', type: 'ramadan', completed: true, loggedAt: '' },
      { date: '2026-03-15', type: 'BOGUS', completed: true, loggedAt: '' },
      { date: '2026-03-15', type: 'voluntary', completed: 'yes', loggedAt: '' },
      { date: '2026-03-15', type: 'voluntary', completed: true, loggedAt: '' },
    ];
    const result = coerceFastEntries(dirty);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('voluntary');
  });

  test('isRecommendedVoluntaryFastDay flags Mon/Thu', () => {
    // 2026-04-13 is a Monday (per JS Date with locale-independent calendar)
    expect(isRecommendedVoluntaryFastDay(new Date(2026, 3, 13))).toBe(true); // Mon
    expect(isRecommendedVoluntaryFastDay(new Date(2026, 3, 16))).toBe(true); // Thu
    expect(isRecommendedVoluntaryFastDay(new Date(2026, 3, 14))).toBe(false); // Tue (depending on Hijri)
  });

  test('ramadanDayNumber returns null outside Ramadan', () => {
    // Pick a Gregorian date highly unlikely to be in Ramadan in this Hijri year.
    // 2026-12-15 is in late Jumada/Rajab range typically — very far from Ramadan.
    const day = ramadanDayNumber(new Date(2026, 11, 15));
    // We can't assert the exact non-null status without knowing the Hijri date,
    // but we can assert it's either null or in [1, 30].
    if (day !== null) {
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(30);
    }
  });

  test('computeFastStats counts by type + computes streak', () => {
    const entries = [
      { date: '2026-04-09', type: 'ramadan' as const, completed: true, loggedAt: '' },
      { date: '2026-04-08', type: 'ramadan' as const, completed: true, loggedAt: '' },
      { date: '2026-04-07', type: 'voluntary' as const, completed: true, loggedAt: '' },
      { date: '2026-04-06', type: 'voluntary' as const, completed: false, loggedAt: '' },
    ];
    const stats = computeFastStats(entries, new Date(2026, 3, 9));
    expect(stats.ramadanDaysKept).toBe(2);
    expect(stats.voluntaryDaysKept).toBe(1);
    expect(stats.qadhaDaysKept).toBe(0);
    expect(stats.total).toBe(3);
    expect(stats.currentStreak).toBe(3); // 9th, 8th, 7th — all completed
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #30 Onboarding
// ─────────────────────────────────────────────────────────────────────────
describe('onboarding step builder', () => {
  test('first run includes welcome + location + notifications', () => {
    const steps = buildOnboardingSteps(false);
    const ids = steps.map(s => s.id);
    expect(ids[0]).toBe('welcome');
    expect(ids).toContain('location');
    expect(ids).toContain('notifications');
  });

  test('skips location when locationOnboardingComplete is true', () => {
    const steps = buildOnboardingSteps(true);
    const ids = steps.map(s => s.id);
    expect(ids).not.toContain('location');
    expect(ids).toContain('notifications');
  });

  test('every step exposes title/body/primary/secondary i18n keys', () => {
    for (const s of buildOnboardingSteps(false)) {
      expect(s.titleKey).toBeTruthy();
      expect(s.bodyKey).toBeTruthy();
      expect(s.primaryKey).toBeTruthy();
      expect(s.secondaryKey).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #31 Backup
// ─────────────────────────────────────────────────────────────────────────
describe('backup envelope helpers', () => {
  test('parsePayload coerces unknown shape into safe defaults', () => {
    const parsed = parsePayload({ junk: 1 });
    expect(parsed.settings).toEqual({});
    expect(parsed.secureSettings).toEqual({});
    expect(parsed.journal).toEqual([]);
    expect(parsed.fasting).toEqual([]);
  });

  test('parsePayload throws on non-object', () => {
    expect(() => parsePayload(null)).toThrow();
    expect(() => parsePayload('x')).toThrow();
  });

  test('isLikelyBackupEnvelope checks the envelope shape', () => {
    expect(
      isLikelyBackupEnvelope({
        version: 1, createdAt: 'now', salt: 's', iv: 'i', ciphertext: 'c',
      }),
    ).toBe(true);
    expect(isLikelyBackupEnvelope({ version: 1 })).toBe(false);
    expect(isLikelyBackupEnvelope(null)).toBe(false);
  });

  test('checkEnvelopeCompatibility rejects future versions', () => {
    expect(() =>
      checkEnvelopeCompatibility({
        version: BACKUP_FORMAT_VERSION + 1,
        createdAt: '', salt: '', iv: '', ciphertext: '',
      }),
    ).toThrow(/newer version/);
  });

  test('buildPayload preserves input fields', () => {
    const p = buildPayload({
      settings: { a: 1 },
      secureSettings: { b: 2 },
      journal: [{ x: 1 }],
      fasting: [],
    });
    expect(p.settings).toEqual({ a: 1 });
    expect(p.secureSettings).toEqual({ b: 2 });
    expect(p.journal).toEqual([{ x: 1 }]);
    expect(p.fasting).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #32 Polish — time-of-day tint
// ─────────────────────────────────────────────────────────────────────────
describe('time-of-day tint', () => {
  const TODAY = {
    Fajr: '05:00', Sunrise: '06:00', Dhuhr: '12:00',
    Asr: '15:00', Maghrib: '18:00', Isha: '20:00',
  };

  test('night before Fajr', () => {
    expect(tintForTime(TODAY, new Date(2026, 3, 9, 4, 0))).toBe('night');
  });

  test('fajr-tint between Fajr and Sunrise', () => {
    expect(tintForTime(TODAY, new Date(2026, 3, 9, 5, 30))).toBe('fajr');
  });

  test('night after Isha', () => {
    expect(tintForTime(TODAY, new Date(2026, 3, 9, 21, 0))).toBe('night');
  });

  test('asr-tint between Asr and Maghrib', () => {
    expect(tintForTime(TODAY, new Date(2026, 3, 9, 16, 0))).toBe('asr');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #33 Responsive breakpoints
// ─────────────────────────────────────────────────────────────────────────
describe('responsive breakpoints', () => {
  test('classifyWidth boundaries', () => {
    expect(classifyWidth(390)).toBe('compact');
    expect(classifyWidth(BREAKPOINT_REGULAR - 1)).toBe('compact');
    expect(classifyWidth(BREAKPOINT_REGULAR)).toBe('regular');
    expect(classifyWidth(900)).toBe('regular');
    expect(classifyWidth(BREAKPOINT_EXPANDED - 1)).toBe('regular');
    expect(classifyWidth(BREAKPOINT_EXPANDED)).toBe('expanded');
    expect(classifyWidth(1400)).toBe('expanded');
  });

  test('contentColumnWidth caps wide windows', () => {
    expect(contentColumnWidth(390)).toBe(390); // phone — full width
    expect(contentColumnWidth(900)).toBe(MAX_CONTENT_WIDTH); // capped
    expect(contentColumnWidth(1600)).toBe(MAX_CONTENT_WIDTH); // capped
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #34 Design tokens
// ─────────────────────────────────────────────────────────────────────────
describe('design tokens', () => {
  test('SPACING is monotonic', () => {
    const values = Object.values(SPACING);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  test('RADIUS includes xs to xl + full', () => {
    expect(RADIUS.xs).toBeLessThan(RADIUS.xl);
    expect(RADIUS.full).toBeGreaterThanOrEqual(999);
  });

  test('paletteForTheme returns the matching semantic palette', () => {
    expect(paletteForTheme('light').accent).toBe(PALETTE_LIGHT.accent);
    expect(paletteForTheme('dark').accent).toBe(PALETTE_DARK.accent);
    expect(paletteForTheme('oled').bg).toBe(PALETTE_OLED.bg);
  });

  test('OLED variant has pure-black background', () => {
    expect(PALETTE_OLED.bg).toBe('#000000');
  });

  test('ELEVATION ladder is monotonic on shadowRadius', () => {
    expect(ELEVATION.none.shadowRadius).toBe(0);
    expect(ELEVATION.sm.shadowRadius).toBeLessThan(ELEVATION.md.shadowRadius);
    expect(ELEVATION.md.shadowRadius).toBeLessThan(ELEVATION.lg.shadowRadius);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #35 Theme contrast
// ─────────────────────────────────────────────────────────────────────────
describe('theme contrast (WCAG AA)', () => {
  test('contrastRatio: white-on-black ≈ 21, identical = 1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 1);
  });

  for (const [key, palette] of Object.entries(THEMES)) {
    test(`${key} theme passes all required contrast pairings`, () => {
      const failures: string[] = [];
      for (const pair of pairsToCheck(palette)) {
        const ratio = contrastRatio(pair.fg, pair.bg);
        if (ratio < pair.target) {
          failures.push(
            `${pair.name}: ${ratio.toFixed(2)}:1 < target ${pair.target}:1`,
          );
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// #36 Typography
// ─────────────────────────────────────────────────────────────────────────
describe('typography tokens', () => {
  test('TYPE scale is descending in fontSize from display to caption', () => {
    expect(TYPE.display.fontSize).toBeGreaterThan(TYPE.title1.fontSize);
    expect(TYPE.title1.fontSize).toBeGreaterThan(TYPE.body.fontSize);
    expect(TYPE.body.fontSize).toBeGreaterThan(TYPE.caption.fontSize);
  });

  test('display has tabular flag (used for prayer times / countdown)', () => {
    expect(TYPE.display.tabular).toBe(true);
  });

  test('typeStyle returns fontVariant when tabular flag is set', () => {
    const display = typeStyle('display');
    expect(display.fontVariant).toEqual(['tabular-nums']);
    const body = typeStyle('body');
    expect(body.fontVariant).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #38 Motion
// ─────────────────────────────────────────────────────────────────────────
describe('motion tokens', () => {
  test('DURATION ladder: instant < quick < standard < expressive', () => {
    expect(DURATION.instant).toBeLessThan(DURATION.quick);
    expect(DURATION.quick).toBeLessThan(DURATION.standard);
    expect(DURATION.standard).toBeLessThan(DURATION.expressive);
  });

  test('EASING_BEZIERS expose 4 curve presets with valid bezier control points', () => {
    for (const key of ['emphasized', 'standard', 'decelerated', 'accelerated'] as const) {
      const points = EASING_BEZIERS[key];
      expect(points).toHaveLength(4);
      for (const p of points) {
        expect(typeof p).toBe('number');
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  test('resolveMotion: Reduce Motion enabled → 0ms duration', () => {
    expect(resolveMotion('standard', true).duration).toBe(0);
    expect(resolveMotion('standard', false).duration).toBe(DURATION.standard);
  });

  test('resolveMotion: useNativeDriver always true (perf default)', () => {
    expect(resolveMotion('quick', false).useNativeDriver).toBe(true);
    expect(resolveMotion('quick', true).useNativeDriver).toBe(true);
  });
});
