/**
 * The Live Activity style picker says what the phone can draw.
 *
 * It offered three designs on every Android with previews that matched
 * none of the native builders. Below API 36 the builder ignores the
 * design (MihrabLiveActivityModule.kt, `buildLegacy`), so the three were
 * buttons that did nothing; on 36 and 37 they are real but `countdown`
 * looks different on each. The model in liveActivityDesign.ts is the one
 * source for both the enabled state and the preview variant.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LIVE_ACTIVITY_DESIGNS,
  LIVE_ACTIVITY_STYLES_MIN_API,
  liveActivityDesignSupport,
  liveActivityRenderer,
} from '../src/settings/liveActivityDesign';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('which builder draws the card', () => {
  it('matches the native dispatch', () => {
    // The Kotlin `when`: >= 37 → Android 17 path, >= 36 → Android 16, else legacy.
    const kt = read('android/app/src/main/java/com/prayer_times/MihrabLiveActivityModule.kt');
    expect(kt).toMatch(/Build\.VERSION\.SDK_INT >= 37 ->/);
    expect(kt).toMatch(/Build\.VERSION\.SDK_INT >= 36 ->/);
    expect(liveActivityRenderer(35)).toBe('legacy');
    expect(liveActivityRenderer(36)).toBe('android16');
    expect(liveActivityRenderer(37)).toBe('android17');
    expect(liveActivityRenderer(40)).toBe('android17');
    expect(LIVE_ACTIVITY_STYLES_MIN_API).toBe(36);
  });

  it('the legacy builder ignores the design, so nothing is enabled there', () => {
    const kt = read('android/app/src/main/java/com/prayer_times/MihrabLiveActivityModule.kt');
    // `design` is read inside the 16 and 17 builders only.
    const legacy = kt.slice(kt.indexOf('private fun buildLegacy'), kt.indexOf('private fun buildLegacy') + 3000);
    expect(legacy).not.toMatch(/optString\("design"/);
    const s = liveActivityDesignSupport(34);
    expect(s.stylesSupported).toBe(false);
    for (const d of LIVE_ACTIVITY_DESIGNS) expect(s.enabled[d]).toBe(false);
  });

  it('enables every design from Android 16', () => {
    for (const api of [36, 37]) {
      const s = liveActivityDesignSupport(api);
      expect(s.stylesSupported).toBe(true);
      for (const d of LIVE_ACTIVITY_DESIGNS) expect(s.enabled[d]).toBe(true);
    }
  });
});

describe('the picker', () => {
  const card = read('src/screens/settings/LiveActivityCard.tsx');

  it('derives enabled state and preview from the model, by API level', () => {
    expect(card).toMatch(/liveActivityDesignSupport\(\s*typeof Platform\.Version === 'number' \? Platform\.Version : 0,?\s*\)/);
    expect(card).toMatch(/disabled=\{!enabled\}/);
    expect(card).toMatch(/accessibilityState=\{\{ selected, disabled: !enabled \}\}/);
    expect(card).toMatch(/renderer=\{support\.stylesSupported \? support\.renderer : 'android16'\}/);
  });

  it('shows the card the phone actually draws when styles are unsupported', () => {
    expect(card).toMatch(/renderer="legacy"/);
    expect(card).toMatch(/settings\.laDesignNeedsAndroid16/);
    for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      expect(JSON.parse(read(`src/i18n/locales/${l}.json`)).settings.laDesignNeedsAndroid16).toBeTruthy();
    }
  });

  it('previews follow the builders, not a sketch', () => {
    // Countdown on 17 is a MetricStyle row; on 16 a big minute-resolution title.
    expect(card).toMatch(/renderer === 'android17'[\s\S]*?>At<\/Text>[\s\S]*?>In<\/Text>/);
    // Fitted to the miniature rather than allowed out of it.
    expect(card).toMatch(/styles\.pvBig[\s\S]{0,160}adjustsFontSizeToFit[\s\S]{0,80}2:18\s*<\/Text>/);
    // Timeline/markers: three segments (the next three events), not seven equal ones.
    expect(card).toMatch(/const segments = \[0\.35, 0\.25, 0\.4\]/);
    expect(card).not.toMatch(/\[0, 1, 2, 3, 4, 5, 6\]\.map/);
    // Markers add points and a tracker.
    expect(card).toMatch(/design === 'markers' \?[\s\S]*?styles\.pvPoint/);
    expect(card).toMatch(/design === 'markers' \?[\s\S]*?styles\.pvTracker/);
  });
});
