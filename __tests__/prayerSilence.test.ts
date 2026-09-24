/**
 * "Silence the phone at prayer time" — issue #60.
 *
 * The arithmetic that turns prayer events and the setting into quiet
 * windows, the shape of the setting on disk, and what the sync hands the
 * native side. The clockwork itself is Kotlin and runs with the app
 * closed; these tests are about giving it the right list.
 */
// Built inside the factory: `jest.mock` is hoisted above every declaration
// in this file, so a module-level object referenced from here would still
// be undefined when the wrapper first reads `NativeModules`.
jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (o: { android?: unknown }) => o.android },
  NativeModules: {
    PrayerSilence: {
      hasAccess: jest.fn(async () => true),
      requestAccess: jest.fn(async () => undefined),
      setWindows: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
      isActive: jest.fn(async () => false),
    },
  },
}));

import { NativeModules } from 'react-native';
import {
  DEFAULT_PRAYER_SILENCE,
  SILENCE_PRAYERS,
  coercePrayerSilence,
  toggleSilencePrayer,
  type PrayerSilenceSettings,
} from '../src/settings/prayerSilence';
import {
  buildSilenceWindows,
  syncPrayerSilence,
} from '../src/notifications/prayerSilence';

const mockNative = (
  NativeModules as unknown as { PrayerSilence: Record<string, jest.Mock> }
).PrayerSilence;

// Wednesday 2026-09-23 and the Friday after it, local time, just after
// midnight so every window of the day is still ahead.
const WED = new Date(2026, 8, 23, 0, 30, 0);
const FRI = new Date(2026, 8, 25, 0, 30, 0);
const at = (day: Date, h: number, m: number) => {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
};
const MIN = 60_000;

const all: PrayerSilenceSettings = { ...DEFAULT_PRAYER_SILENCE, enabled: true };

const dayEvents = (day: Date) => [
  { name: 'Fajr', at: at(day, 4, 30) },
  { name: 'Sunrise', at: at(day, 6, 15) },
  { name: 'Dhuhr', at: at(day, 12, 45) },
  { name: 'Asr', at: at(day, 16, 5) },
  { name: 'Maghrib', at: at(day, 19, 0) },
  { name: 'Isha', at: at(day, 20, 30) },
];

describe('buildSilenceWindows', () => {
  it('opens each window before the adhan and closes it after', () => {
    const w = buildSilenceWindows(dayEvents(WED), all, WED);
    const asr = w.find(x => x.prayers.includes('Asr'))!;
    expect(asr.start).toBe(at(WED, 16, 5).getTime() - 5 * MIN);
    expect(asr.end).toBe(at(WED, 16, 5).getTime() + 30 * MIN);
  });

  it('is only for the prayers chosen, and never for sunrise', () => {
    const w = buildSilenceWindows(
      dayEvents(WED),
      { ...all, prayers: ['Fajr', 'Isha'] },
      WED,
    );
    expect(w.map(x => x.prayers)).toEqual([['Fajr'], ['Isha']]);
    expect(
      buildSilenceWindows(dayEvents(WED), all, WED).some(x =>
        (x.prayers as string[]).includes('Sunrise'),
      ),
    ).toBe(false);
  });

  it('is nothing with the switch off or nothing chosen', () => {
    expect(
      buildSilenceWindows(dayEvents(WED), { ...all, enabled: false }, WED),
    ).toEqual([]);
    expect(
      buildSilenceWindows(dayEvents(WED), { ...all, prayers: [] }, WED),
    ).toEqual([]);
  });

  it('merges windows that touch or overlap into one, naming both', () => {
    // Maghrib 19:00 and Isha 19:20, a northern summer: 18:55–19:30 and
    // 19:15–19:50 become one 18:55–19:50.
    const events = [
      { name: 'Maghrib', at: at(WED, 19, 0) },
      { name: 'Isha', at: at(WED, 19, 20) },
    ];
    const w = buildSilenceWindows(events, all, WED);
    expect(w).toHaveLength(1);
    expect(w[0].prayers).toEqual(['Maghrib', 'Isha']);
    expect(w[0].start).toBe(at(WED, 18, 55).getTime());
    expect(w[0].end).toBe(at(WED, 19, 50).getTime());
  });

  it('drops windows already over, keeps one that is on', () => {
    const now = at(WED, 16, 20); // inside Asr's window, after Dhuhr's
    const w = buildSilenceWindows(dayEvents(WED), all, now);
    expect(w.map(x => x.prayers[0])).toEqual(['Asr', 'Maghrib', 'Isha']);
  });

  it('takes Friday Dhuhr as Jumuah, with its own length', () => {
    const w = buildSilenceWindows(dayEvents(FRI), all, FRI);
    const j = w.find(x => x.prayers.includes('Jumuah'))!;
    expect(j).toBeDefined();
    expect(w.some(x => x.prayers.includes('Dhuhr'))).toBe(false);
    expect(j.start).toBe(at(FRI, 12, 45).getTime() - 5 * MIN);
    expect(j.end).toBe(at(FRI, 12, 45).getTime() + 60 * MIN);
  });

  it('holds Jumuah at the fixed time when one is set', () => {
    const w = buildSilenceWindows(
      dayEvents(FRI),
      { ...all, jumuahTime: '13:30' },
      FRI,
    );
    const j = w.find(x => x.prayers.includes('Jumuah'))!;
    expect(j.start).toBe(at(FRI, 13, 25).getTime());
    expect(j.end).toBe(at(FRI, 14, 30).getTime());
  });

  it('leaves Friday Dhuhr an ordinary Dhuhr when Jumuah is not chosen', () => {
    const w = buildSilenceWindows(
      dayEvents(FRI),
      { ...all, prayers: ['Dhuhr'], jumuahTime: '13:30' },
      FRI,
    );
    expect(w).toHaveLength(1);
    expect(w[0].prayers).toEqual(['Dhuhr']);
    expect(w[0].end).toBe(at(FRI, 12, 45).getTime() + 30 * MIN);
  });

  it('does not touch a weekday Dhuhr with the fixed Jumuah time', () => {
    const w = buildSilenceWindows(
      dayEvents(WED),
      { ...all, jumuahTime: '13:30' },
      WED,
    );
    const d = w.find(x => x.prayers.includes('Dhuhr'))!;
    expect(d.start).toBe(at(WED, 12, 40).getTime());
  });

  it('comes out sorted and non-overlapping across several days', () => {
    const events = [
      ...dayEvents(WED),
      ...dayEvents(new Date(2026, 8, 24)),
      ...dayEvents(FRI),
    ];
    const w = buildSilenceWindows(events, all, WED);
    for (let i = 1; i < w.length; i++) {
      expect(w[i].start).toBeGreaterThanOrEqual(w[i - 1].end);
    }
    expect(w).toHaveLength(15);
  });
});

describe('coercePrayerSilence', () => {
  it('is the default for nothing, and keeps a good blob', () => {
    expect(coercePrayerSilence(undefined)).toEqual(DEFAULT_PRAYER_SILENCE);
    const good: PrayerSilenceSettings = {
      enabled: true,
      prayers: ['Asr', 'Jumuah'],
      leadMinutes: 10,
      durationMinutes: 45,
      jumuahDurationMinutes: 90,
      jumuahTime: '13:30',
    };
    expect(coercePrayerSilence(good)).toEqual(good);
  });

  it('puts each bad field back to its default and keeps the rest', () => {
    const c = coercePrayerSilence({
      enabled: 'yes',
      prayers: ['Asr', 'Tea', 'Fajr'],
      leadMinutes: 7,
      durationMinutes: 31,
      jumuahDurationMinutes: '60',
      jumuahTime: '25:99',
    });
    expect(c).toEqual({
      enabled: false,
      prayers: ['Fajr', 'Asr'],
      leadMinutes: DEFAULT_PRAYER_SILENCE.leadMinutes,
      durationMinutes: 30,
      jumuahDurationMinutes: 60,
      jumuahTime: null,
    });
  });

  it('keeps the prayers in their canonical order when toggled', () => {
    expect(toggleSilencePrayer(['Isha'], 'Fajr')).toEqual(['Fajr', 'Isha']);
    expect(toggleSilencePrayer(['Fajr', 'Isha'], 'Fajr')).toEqual(['Isha']);
    expect(toggleSilencePrayer([], 'Jumuah')).toEqual(['Jumuah']);
    expect(SILENCE_PRAYERS).toEqual([
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
      'Jumuah',
    ]);
  });
});

describe('syncPrayerSilence', () => {
  beforeEach(() => {
    mockNative.setWindows.mockClear();
    mockNative.clear.mockClear();
  });

  const today = {
    Fajr: '04:30',
    Sunrise: '06:15',
    Dhuhr: '12:45',
    Asr: '16:05',
    Maghrib: '19:00',
    Isha: '20:30',
  };

  it('hands the native side the windows and the words to print', async () => {
    const now = at(WED, 10, 0);
    const spans = await syncPrayerSilence({
      settings: all,
      today,
      tomorrow: today,
      baseDate: WED,
      hour12: false,
      now,
    });
    expect(spans.length).toBeGreaterThanOrEqual(8);
    expect(mockNative.setWindows).toHaveBeenCalledTimes(1);
    const [windows, endLabel, channel] = mockNative.setWindows.mock
      .calls[0] as unknown as [
      { start: number; end: number; title: string; text: string }[],
      string,
      string,
    ];
    expect(windows[0].title).toBe('Silenced for Dhuhr');
    expect(windows[0].text).toBe('Until 13:15');
    expect(windows[0].start).toBe(at(WED, 12, 40).getTime());
    expect(endLabel).toBe('End now');
    expect(channel).toBe('Silence at prayer time');
  });

  it('includes a window that opened before the app did', async () => {
    // 16:20: Asr's adhan was 15 minutes ago and its window runs to 16:35.
    const spans = await syncPrayerSilence({
      settings: all,
      today,
      baseDate: WED,
      now: at(WED, 16, 20),
    });
    expect(spans[0].prayers).toEqual(['Asr']);
    expect(spans[0].start).toBeLessThan(at(WED, 16, 20).getTime());
  });

  it('clears the native side when the switch is off', async () => {
    await syncPrayerSilence({
      settings: { ...all, enabled: false },
      today,
      baseDate: WED,
      now: WED,
    });
    expect(mockNative.clear).toHaveBeenCalledTimes(1);
    expect(mockNative.setWindows).not.toHaveBeenCalled();
  });
});

/**
 * The Android side is Kotlin and cannot run here, so what is checked is
 * that the pieces the wrapper relies on are declared: the permission the
 * rule needs, the receiver the alarms and the boot arrive at, the
 * package the module is registered through, and the method names the
 * two sides agree on.
 */
describe('the Android side is wired', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const root = path.join(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it('declares the policy permission and the receiver', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android\.permission\.ACCESS_NOTIFICATION_POLICY/);
    const receiver =
      /<receiver\s+android:name="\.PrayerSilenceReceiver"[\s\S]*?<\/receiver>/.exec(
        manifest,
      );
    expect(receiver).not.toBeNull();
    expect(receiver![0]).toMatch(/android:exported="false"/);
    expect(receiver![0]).toMatch(/android\.intent\.action\.BOOT_COMPLETED/);
    expect(receiver![0]).toMatch(/android\.intent\.action\.TIMEZONE_CHANGED/);
  });

  it('registers the package and exposes the methods the wrapper calls', () => {
    expect(
      read('android/app/src/main/java/com/prayer_times/MainApplication.kt'),
    ).toMatch(/add\(PrayerSilencePackage\(\)\)/);
    const module = read(
      'android/app/src/main/java/com/prayer_times/PrayerSilenceModule.kt',
    );
    for (const name of [
      'hasAccess',
      'requestAccess',
      'setWindows',
      'clear',
      'isActive',
    ]) {
      expect(module).toMatch(new RegExp(`@ReactMethod\\s+fun ${name}\\(`));
    }
    expect(module).toMatch(/getName\(\): String = "PrayerSilence"/);
  });

  it('turns the quiet on through a rule of its own, never the global switch (Q+)', () => {
    const core = read(
      'android/app/src/main/java/com/prayer_times/PrayerSilence.kt',
    );
    expect(core).toMatch(/addAutomaticZenRule/);
    expect(core).toMatch(/setAutomaticZenRuleState/);
    // The direct filter is the pre-Q fallback only, and restored only if
    // it is still ours.
    const direct = core.match(/setInterruptionFilter\(/g) ?? [];
    expect(direct).toHaveLength(2);
  });
});
