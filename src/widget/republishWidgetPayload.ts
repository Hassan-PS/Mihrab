/**
 * Rebuild and push the widget payload FROM THE STORES, with no screen mounted.
 *
 * The payload used to have exactly one writer, and it lived inside
 * `HomeScreen` — two calls to `syncPrayerWidget`, one on focus and one on an
 * effect. Nothing else in the app ever wrote it. That is a structural bug, not
 * a missing feature, and it had teeth:
 *
 *   - The bottom tabs are lazy, so `HomeScreen` only mounts once Today has
 *     been focused. Every deep link the widgets themselves fire —
 *     `mihrab://log`, `mihrab://tasbih`, `mihrab://quran`, `mihrab://read/:id`
 *     — opens the app WITHOUT mounting it. Tap a widget, do the thing it asked
 *     you to do, and the widget kept its old numbers for the whole session.
 *   - `notifyPracticeChanged()` from the notification actions and the
 *     end-of-day prompt fired into an empty listener set whenever the app was
 *     closed, because the only subscriber was a hook inside that screen.
 *   - The widget tap queues drain at app root, usually finishing AFTER
 *     HomeScreen's first push, so those taps landed in the journal with
 *     nothing scheduled to republish them.
 *
 * So the payload is built here instead, from the same places the app reads
 * everything else: settings, the on-disk prayer cache, and the practice /
 * quran / tasbih stores. `HomeScreen` still pushes — it has a live GPS fix and
 * a freshly reverse-geocoded city name before either has been written back to
 * settings, so its copy is the better one when it exists. This is what makes
 * sure there IS a copy the rest of the time.
 *
 * CACHE-ONLY, then on-device. This never fetches: a republish is triggered by
 * a bead being counted, and a burst of network requests behind a bead is not a
 * trade anyone would make. When the cache has nothing for today — a fresh
 * install, a city the user has just moved to — it falls back to computing the
 * window with adhan.js locally, which is the same safety net the hook uses and
 * is exact enough for a home screen.
 */
import { AppState } from 'react-native';
import { setActiveClockFormat } from '../utils/activeClock';
import { refreshSystemIs24Hour } from '../native/SystemClock';
import i18n from '../i18n';
import { subscribePractice } from '../practice/practiceStore';
import { subscribeQuranState } from '../quran/quranState';
import { subscribeTasbihState } from '../tasbih/tasbihStore';
import {
  WIDGET_WINDOW_DAYS,
  cachedDaysFrom,
  type DayWindowParams,
} from '../prayer/widgetDayWindow';
import { computeLocalAdhanTimes } from '../providers/localAdhan';
import { computeSeasonalTreatment } from '../seasonal/treatments';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../settings/effectiveProvider';
import { findPreset } from '../settings/locationPresets';
import { applyOffsets } from '../settings/prayerOffsets';
import { loadSettings } from '../settings/storage';
import type { PrayerAppSettings } from '../settings/types';
import type { TimingsMap } from '../types/prayer';
import { addDays } from '../utils/prayerTimes';
import { filterOptionalTimes, injectNightTimes } from '../utils/nightTimes';
import { collectWidgetExtras } from './collectWidgetExtras';
import { syncPrayerWidget } from './syncPrayerWidget';

/** Why a republish was asked for. Kept for the warn line and for tests. */
export type RepublishReason =
  | 'launch'
  | 'foreground'
  | 'practice'
  | 'reading'
  | 'tasbih'
  | 'language'
  | 'queue-drain'
  /** The refresh glyph on a home-screen widget — see `widgetRefreshTask`. */
  | 'widget-refresh';

/**
 * Long enough to swallow a tasbih round's tail, short enough to feel live.
 *
 * Thirty-three taps is thirty-three reads of the encrypted journal and
 * thirty-three writes to an App Group plist for a number that is only
 * interesting once the user stops tapping.
 */
export const REPUBLISH_COALESCE_MS = 1500;

/**
 * The coordinates to build for, or null when there are none worth building
 * from.
 *
 * `(0, 0)` is the app's "no location set yet" sentinel, not a place in the
 * Gulf of Guinea, and `buildWidgetPayload` throws on it rather than send
 * anyone prayer times for the coast of Ghana. Bail here instead, so a payload
 * that cannot be built leaves the last good one in place rather than
 * propagating a rejection through the caller.
 */
function coordsFor(
  settings: PrayerAppSettings,
): { latitude: number; longitude: number } | null {
  const c = resolveCoordsFromSettings(settings);
  if (c == null) return null;
  if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  if (c.latitude === 0 && c.longitude === 0) return null;
  return c;
}

/**
 * The location line, from settings alone.
 *
 * Two decimals rather than the four Home shows: a widget states where its
 * times are for, and a home screen is read over shoulders. `shortPlaceLabel`
 * inside `buildWidgetPayload` does the trimming, so the full label goes in.
 */
function labelFor(settings: PrayerAppSettings): string {
  if (settings.locationMode !== 'manual') {
    if (settings.autoLocationLabel) return settings.autoLocationLabel;
    if (
      settings.lastFetchedLatitude != null &&
      settings.lastFetchedLongitude != null
    ) {
      return `${settings.lastFetchedLatitude.toFixed(2)}°, ${settings.lastFetchedLongitude.toFixed(2)}°`;
    }
    return '';
  }
  const preset = findPreset(
    settings.locationPresets ?? [],
    settings.activeLocationPresetId,
  );
  if (preset) return preset.name;
  if (settings.manualLocationLabel) return settings.manualLocationLabel;
  return `${settings.manualLatitude.toFixed(2)}°, ${settings.manualLongitude.toFixed(2)}°`;
}

/**
 * The window, raw — cache first, adhan.js second, nothing third.
 *
 * Gapless: both readers stop at the first day they cannot produce, because
 * every consumer of these arrays indexes them as `today + i`.
 */
async function rawWindow(
  params: DayWindowParams,
  now: Date,
): Promise<TimingsMap[]> {
  const cached = await cachedDaysFrom(0, params, now);
  if (cached.length > 0) return cached;

  const local: TimingsMap[] = [];
  for (let i = 0; i < WIDGET_WINDOW_DAYS; i++) {
    try {
      local.push(
        computeLocalAdhanTimes({
          latitude: params.latitude,
          longitude: params.longitude,
          date: addDays(now, i),
          calculationMethod: params.calculationMethod,
          school: params.school,
        }).timings,
      );
    } catch {
      break;
    }
  }
  return local;
}

/**
 * Rebuild the payload and push it.
 *
 * Resolves `false` when there was nothing honest to build — no location yet,
 * no schedule on disk and no way to compute one. It never throws: a republish
 * is a background courtesy, and the worst outcome it may cause is leaving the
 * previous payload in place.
 */
export async function republishWidgetPayload(
  reason: RepublishReason,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const settings = await loadSettings();
    const coords = coordsFor(settings);
    if (coords == null) return false;

    // The clock preference lives in a module singleton that only the
    // settings PROVIDER sets, and this can run from a headless task, from
    // a notification's background handler, or at launch before the
    // provider's effect has fired. Left alone, the singleton says 'auto'
    // with no device answer, which resolves to 24-hour — and a 12-hour
    // user who tapped the widget's refresh glyph with the app killed
    // watched it flip to "17:31" until the app was next opened. Same
    // situation, and same fix, as `language` further down.
    setActiveClockFormat(settings.clockFormat);
    await refreshSystemIs24Hour();

    const params: DayWindowParams = {
      provider: getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coords,
      ),
      latitude: coords.latitude,
      longitude: coords.longitude,
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    };

    const raw = await rawWindow(params, now);
    if (raw.length === 0) return false;

    // Offsets are applied at read time and the night times are derived from
    // the PREVIOUS day's Maghrib, so this has to run over the whole window at
    // once, in this order, before anything is sliced off it.
    const window = injectNightTimes(
      raw.map(day => applyOffsets(day, settings.prayerOffsets)),
    );
    const optional = {
      // Sunrise is not optional on a widget: a table with a gap where it
      // should be reads as missing data rather than as a preference.
      Sunrise: true,
      Midnight: settings.islamicMidnightEnabled,
      Lastthird: settings.lastThirdEnabled,
      Firstthird: settings.firstThirdEnabled,
    };
    const week = window.map(day => filterOptionalTimes(day, optional));

    const seasonal = computeSeasonalTreatment(window[0], window[1], now);
    const extras = await collectWidgetExtras({
      timings: week[0],
      now,
      // Explicit rather than i18n's current value: this can run from a
      // headless task where the app's i18n has not been initialised, and a
      // widget quietly stuck in English is the failure that hides.
      language: settings.language ?? i18n.language,
    });

    await syncPrayerWidget(
      week[0],
      week[1],
      now,
      labelFor(settings),
      { lat: coords.latitude, lng: coords.longitude },
      { jumuah: seasonal.jumuah, ramadan: seasonal.ramadan, eid: seasonal.eid },
      week,
      extras,
    );
    return true;
  } catch (e) {
    console.warn(`republishWidgetPayload (${reason}):`, e);
    return false;
  }
}

/**
 * Watch everything the widget shows, and republish when any of it moves.
 *
 * Started once from the app root rather than from a screen — that is the whole
 * point. Returns the teardown.
 */
export function startWidgetPayloadSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = (reason: RepublishReason) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void republishWidgetPayload(reason);
    }, REPUBLISH_COALESCE_MS);
  };

  const unsubscribe = [
    subscribePractice(() => schedule('practice')),
    subscribeQuranState(() => schedule('reading')),
    subscribeTasbihState(() => schedule('tasbih')),
  ];

  // Localized names travel in the payload — surah titles, dhikr, the prayer
  // names themselves. The Live Activity already rebuilt on a language change
  // and the widget did not, so it sat in the old language until something
  // unrelated moved.
  const onLanguage = () => schedule('language');
  i18n.on('languageChanged', onLanguage);

  // Coming back to the app is the moment the queues drain and the day may
  // have rolled. Immediate rather than coalesced: nothing is bursting here.
  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') void republishWidgetPayload('foreground');
  });

  void republishWidgetPayload('launch');

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    unsubscribe.forEach(fn => fn());
    i18n.off('languageChanged', onLanguage);
    appState.remove();
  };
}
