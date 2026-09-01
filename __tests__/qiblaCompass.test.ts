/**
 * The Qibla compass, restored.
 *
 * The screen never went anywhere — route registered, deep link `qibla`,
 * dial, announcer, all of it. What went was the way in: the tile that
 * opened it was removed with the quick-actions grid in July and nothing
 * replaced it, so a working screen was reachable only by typing a URL.
 * These tests pin the way back in and, more importantly, the Android
 * heading rewrite that came with it.
 *
 * ── WHY THE ANDROID HALF MATTERED ─────────────────────────────────────
 *
 * Android read the magnetometer alone and computed `atan2(-x, y)`. That
 * is a heading only while the phone is flat, and it is MAGNETIC north
 * with no declination applied — while `qiblaBearingFrom` returns a
 * bearing from TRUE north. Two silent errors on a screen whose only job
 * is to point somewhere.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { normalizeHeadingDeg, qiblaBearingFrom } from '../src/utils/qibla';

const repo = (...parts: string[]) =>
  readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

/**
 * Source with comments stripped.
 *
 * "This file no longer mentions X" is the assertion, and the file's own
 * doc comment explaining why it no longer does X would satisfy the naive
 * version of it — which is exactly the trap that let an earlier version
 * of a test in this repo pass against its own documentation.
 */
const code = (...parts: string[]) =>
  repo(...parts)
    .split('\n')
    .filter(line => {
      const l = line.trim();
      return !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*');
    })
    .join('\n');

const ANDROID_PARTS = [
  'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
  'CompassModule.kt',
] as const;
const ANDROID_MODULE = repo(...ANDROID_PARTS);
/** …and the same file with its (long) comments stripped. */
const ANDROID_CODE = code(...ANDROID_PARTS);

describe('the bearing the chip shows', () => {
  // Checked against the directions these cities are publicly known to
  // pray in, not against this function's own output — the point is that
  // the maths agrees with the world. 3° of tolerance because published
  // figures differ slightly with the Kaaba coordinates each source uses.
  const cases: Array<[string, number, number, number]> = [
    ['Casablanca', 33.5731, -7.5898, 94],
    ['Stockholm', 59.3293, 18.0686, 148],
    ['Jakarta', -6.2088, 106.8456, 295],
    ['Cape Town', -33.9249, 18.4241, 23],
    ['New York', 40.7128, -74.006, 58],
  ];

  for (const [city, lat, lng, expected] of cases) {
    test(`${city} points about ${expected}°`, () => {
      const actual = qiblaBearingFrom(lat, lng);
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3);
    });
  }

  test('is always a compass bearing, never negative or over 360', () => {
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lng = -180; lng < 180; lng += 30) {
        const b = qiblaBearingFrom(lat, lng);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
      }
    }
  });

  test('from the Kaaba itself it is still a number, not NaN', () => {
    expect(Number.isFinite(qiblaBearingFrom(21.422487, 39.826206))).toBe(true);
  });

  test('the needle is the bearing minus the heading, wrapped', () => {
    // What CompassScreen draws. Facing the Qibla puts the needle at 0.
    const qibla = qiblaBearingFrom(59.3293, 18.0686);
    expect(normalizeHeadingDeg(qibla - qibla)).toBe(0);
    // Facing due north puts it at the bearing itself.
    expect(normalizeHeadingDeg(qibla - 0)).toBeCloseTo(qibla, 6);
    // And a heading past north wraps rather than going negative.
    expect(normalizeHeadingDeg(qibla - (qibla + 10))).toBeCloseTo(350, 6);
  });
});

describe('the way back in', () => {
  const home = repo('src', 'screens', 'HomeScreen.tsx');
  const card = repo('src', 'screens', 'home', 'TodayCard.tsx');
  const chip = repo('src', 'screens', 'home', 'QiblaChip.tsx');

  test('the home screen computes a bearing and can open the compass', () => {
    expect(home).toContain('qiblaBearingFrom');
    expect(home).toContain("navigation.navigate('Compass')");
    expect(home).toContain('onOpenQibla={handleOpenQibla}');
    expect(home).toContain('qiblaBearing={qiblaBearing}');
  });

  test('no fix means no chip, rather than a confident wrong bearing', () => {
    // 0,0 is in the Atlantic and its Qibla is a real number that would be
    // wrong everywhere, so the guard is the feature.
    expect(home).toMatch(/if \(lat == null \|\| lng == null\) return null;/);
    expect(chip).toMatch(/if \(bearing == null\) return null;/);
  });

  test('the chip sits in the hero, not in one of the two hero bodies', () => {
    // Rendered in the shared wrapper so it survives scrolling to another
    // day, when the hero swaps to HeroOtherDay.
    expect(card).toContain('<QiblaChipCorner');
    const heroWrapAt = card.indexOf('styles.heroWrap');
    const chipAt = card.indexOf('<QiblaChipCorner');
    expect(heroWrapAt).toBeGreaterThan(-1);
    expect(chipAt).toBeGreaterThan(heroWrapAt);
  });

  test('and is rendered AFTER the heroes, or it cannot be tapped', () => {
    // Found on a device: drawn before them the chip appeared exactly
    // right and swallowed every tap, because the hero's eyebrow is a
    // full-width Text overlapping the corner and a later sibling wins
    // the hit test whatever zIndex says.
    const chipAt = card.indexOf('<QiblaChipCorner');
    const heroTodayAt = card.indexOf('<HeroToday');
    const heroOtherAt = card.indexOf('<HeroOtherDay');
    expect(heroTodayAt).toBeGreaterThan(-1);
    expect(heroOtherAt).toBeGreaterThan(-1);
    expect(chipAt).toBeGreaterThan(heroTodayAt);
    expect(chipAt).toBeGreaterThan(heroOtherAt);
  });

  test('the chip is labelled for screen readers in every language', () => {
    expect(chip).toContain("t('home.qiblaChipA11y'");
    expect(chip).toContain("t('home.qiblaChipHint')");
  });
});

describe('the Android heading', () => {
  test('uses the fused rotation vector, not the raw magnetometer', () => {
    expect(ANDROID_MODULE).toContain('Sensor.TYPE_ROTATION_VECTOR');
    expect(ANDROID_MODULE).toContain('getRotationMatrixFromVector');
  });

  test('falls back to accelerometer + magnetic field, still tilt-corrected', () => {
    expect(ANDROID_MODULE).toContain('Sensor.TYPE_ACCELEROMETER');
    expect(ANDROID_MODULE).toContain('Sensor.TYPE_MAGNETIC_FIELD');
    // getRotationMatrix, not atan2 of two axes — that is the whole point.
    expect(ANDROID_MODULE).toContain('SensorManager.getRotationMatrix(');
  });

  test('remaps for the display rotation, or it is 90° out in landscape', () => {
    expect(ANDROID_MODULE).toContain('remapCoordinateSystem');
    for (const rotation of ['ROTATION_90', 'ROTATION_180', 'ROTATION_270']) {
      expect(ANDROID_MODULE).toContain(`Surface.${rotation}`);
    }
  });

  test('corrects magnetic north to true north with the local declination', () => {
    expect(ANDROID_MODULE).toContain('GeomagneticField');
    expect(ANDROID_MODULE).toContain('.declination');
    expect(ANDROID_MODULE).toMatch(/magneticAzimuth \+ declination/);
  });

  test('emits the same event and shape as the iOS module', () => {
    const ios = repo('ios', 'PrayerApp', 'CompassModule.swift');
    for (const src of [ANDROID_MODULE, ios]) {
      expect(src).toContain('CompassHeading');
      expect(src).toContain('heading');
      expect(src).toContain('accuracy');
    }
  });

  test('negative accuracy keeps its meaning: do not trust this', () => {
    // The JS side branches on `accuracy < 0` to show the calibration
    // prompt, a convention taken from CoreLocation.
    expect(ANDROID_MODULE).toContain('ACCURACY_UNRELIABLE = -1');
    const hook = repo('src', 'screens', 'compass', 'useCompassSensor.ts');
    expect(hook).toContain('data.accuracy < 0');
  });

  test('watches the magnetometer for its ACCURACY, not its readings', () => {
    // The reference does this and the reason is not obvious: the fused
    // rotation vector reports an accuracy of its own that stays high
    // while the magnetic field around it is distorted, which is the one
    // case the calibration prompt exists for. So the magnetometer is
    // registered alongside it, slowly, purely for onAccuracyChanged.
    expect(ANDROID_MODULE).toContain('SENSOR_DELAY_NORMAL');
    expect(ANDROID_MODULE).toMatch(
      /if \(sensor\?\.type != Sensor\.TYPE_MAGNETIC_FIELD\) return/,
    );
    // …and its raw values are ignored on that path.
    expect(ANDROID_MODULE).toMatch(/if \(usingRotationVector\) return/);
  });

  test('never asks a non-visual context for the display', () => {
    // Found by opening the screen: `reactApplicationContext.display`
    // throws UnsupportedOperationException — "Tried to obtain display
    // from a Context not associated with one" — on the sensor thread,
    // which took the whole app down.
    expect(ANDROID_CODE).not.toMatch(/reactApplicationContext\.display/);
    expect(ANDROID_MODULE).toContain('currentActivity');
    expect(ANDROID_MODULE).toContain('DisplayManager');
  });

  test('is registered, or the module would not exist at runtime', () => {
    const app = repo(
      'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
      'MainApplication.kt',
    );
    expect(app).toContain('add(CompassPackage())');
  });
});

describe('the magnetometer path is gone, not merely unused', () => {
  test('the hook no longer imports react-native-sensors', () => {
    const hook = code('src', 'screens', 'compass', 'useCompassSensor.ts');
    expect(hook).not.toContain('react-native-sensors');
    expect(hook).not.toContain('headingFromMagnetometer');
  });

  test('the helpers that produced a flat-phone bearing are deleted', () => {
    const math = code('src', 'screens', 'compass', 'sensorMath.ts');
    expect(math).not.toContain('export function headingFromMagnetometer');
    expect(math).not.toContain('export function magneticFieldScore');
  });
});

describe('the page does not exist on a Mac', () => {
  // A Mac has no magnetometer. The dial would sit at a fixed heading and
  // look broken, which is worse than the feature being absent — it is
  // why the tile was pulled in the first place. The BEARING is not a
  // sensor reading though, so the chip stays.
  test('the route is not registered there', () => {
    const nav = code('src', 'navigation', 'RootNavigator.tsx');
    expect(nav).toContain('isMacCatalyst');
    expect(nav).toMatch(/isMacCatalyst \? null : \(/);
  });

  test('the deep link is withheld to match, rather than dangling', () => {
    const linking = code('src', 'navigation', 'linking.ts');
    expect(linking).toMatch(
      /isMacCatalyst \? \{\} : \{ Compass: 'qibla' as const \}/,
    );
  });

  test('the home screen offers no way to open it', () => {
    const home = code('src', 'screens', 'HomeScreen.tsx');
    expect(home).toMatch(/isMacCatalyst\s*\?\s*undefined/);
  });

  test('but the chip still renders, as a readout', () => {
    // Keyed on the bearing, not on the callback — the bug this guards
    // against is `{onOpenQibla ? <chip/> : null}`, which would take the
    // chip away with the page.
    const card = code('src', 'screens', 'home', 'TodayCard.tsx');
    expect(card).not.toMatch(/onOpenQibla \? \(\s*<QiblaChipCorner/);
    expect(card).toContain('<QiblaChipCorner');

    const chip = code('src', 'screens', 'home', 'QiblaChip.tsx');
    // Without a press handler it is text, not a button.
    expect(chip).toMatch(/if \(!onPress\)/);
    expect(chip).toContain("accessibilityRole=\"text\"");
  });
});

describe('the cross-check note', () => {
  const banners = repo('src', 'screens', 'compass', 'StatusBanners.tsx');

  test('names the bearing, so the other app can be used against it', () => {
    expect(banners).toContain("t('compass.crossCheckTitle')");
    expect(banners).toContain("t('compass.crossCheckBody'");
    expect(banners).toContain('degrees:');
    // The screen passes the real bearing rather than the live heading:
    // the trigonometry is ours and certain, the sensor half is not.
    const screen = code('src', 'screens', 'CompassScreen.tsx');
    expect(screen).toContain('bearing={qibla}');
  });

  test('offers the button only once the device says it has one', () => {
    // Android has no compass in AOSP, so on a Pixel the honest answer is
    // no button. Rendering it unconditionally would be an offer that
    // opens nothing.
    expect(banners).toContain('hasSystemCompass');
    expect(banners).toMatch(/canOpen \? \(/);
  });

  test('the resolver never throws its way onto the screen', () => {
    const util = code('src', 'utils', 'systemCompass.ts');
    // Both probe and open swallow: this is an optional convenience and
    // must not be what breaks the compass.
    expect((util.match(/catch \{/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('Android declares the packages it queries, or it can never see them', () => {
    // Android 11 package visibility: getLaunchIntentForPackage returns
    // null for an installed app that is not declared, which looks exactly
    // like the vendor not shipping a compass.
    const manifest = repo('android', 'app', 'src', 'main', 'AndroidManifest.xml');
    expect(manifest).toContain('<queries>');
    const declared = [...manifest.matchAll(/<package android:name="([^"]+)"/g)]
      .map(m => m[1]);
    const queried = [...ANDROID_MODULE.matchAll(/"(com\.[a-z0-9.]*compass[a-z0-9.]*)"/g)]
      .map(m => m[1]);
    expect(queried.length).toBeGreaterThan(0);
    for (const pkg of queried) expect(declared).toContain(pkg);
  });

  test('iOS declares the scheme it probes, or canOpenURL always says no', () => {
    const plist = repo('ios', 'PrayerApp', 'Info.plist');
    expect(plist).toContain('LSApplicationQueriesSchemes');
    expect(plist).toContain('<string>compass</string>');
  });
});
