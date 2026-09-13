/**
 * What the Today screen is allowed to wait for before it draws.
 *
 * The skeleton on first launch is `usePrayerDay` in `idle`, and it stays
 * up until the hook publishes `ready`. Measured on an emulator — cold
 * start, warm cache, three runs — that took ~915 ms from launch, and
 * 209 ms of it was one cache read the screen does not use: the widget's
 * longer day window (`cachedDaysFrom`), awaited before the state was
 * published. The prayer times were in hand at ~705 ms and the reader was
 * shown grey bars for another fifth of a second so the home-screen widget
 * could have its fortnight. Moving that one read after the publish took
 * the cold start to ~694 ms.
 *
 * ONE read, not two. The days behind (`cachedDaysBefore`) were measured
 * at 1 ms and moving them too broke the Today card outright — see the
 * third test below, which is the one worth reading.
 *
 * The hook is hard to exercise directly — React state, effects, AppState
 * and NetInfo listeners, which is why `usePrayerDay.failover.test.ts`
 * tests the recipe rather than the hook. So what is pinned here is the
 * ORDER, which is the whole property: nothing that the first paint does
 * not need may be awaited before the first paint.
 */
import { readFileSync } from 'fs';
import path from 'path';

const src = (p: string) =>
  readFileSync(path.join(__dirname, '..', p), 'utf8');

const HOOK = src('src/hooks/usePrayerDay.ts');
const HOME = src('src/screens/HomeScreen.tsx');

/**
 * Where the hook first publishes times to the screen, and where the
 * deferred follow-up is defined.
 *
 * Note what is NOT asserted: that the two cache reads appear LATER IN THE
 * FILE than the publish. They do not, and they should not have to — the
 * follow-up is a function defined above the publish and called after it,
 * so source order and execution order disagree on purpose. A test that
 * compared offsets would pass today and fail the first time somebody
 * moved the function, while a genuine regression — awaiting the reads
 * inline again — would slip through if it happened to sit lower down.
 * What matters is that the reads are INSIDE the deferred function.
 */
const readyAt = HOOK.indexOf("setState(prev => ({\n          phase: 'ready',");
const laterAt = HOOK.indexOf('const widgetWindowLater = async () => {');
/**
 * The body of the deferred follow-up — to its own closing brace, not to
 * the publish. The two are not the same place: `past` is read between
 * them, on purpose, and a slice that ran to the publish would swallow it
 * and report it as deferred.
 */
const deferred = HOOK.slice(laterAt, HOOK.indexOf('\n        };\n', laterAt));

describe('the first paint waits only for the times it draws', () => {
  it('reads the widget window inside the deferred follow-up', () => {
    expect(laterAt).toBeGreaterThan(-1);
    expect(readyAt).toBeGreaterThan(laterAt);
    // Still read — just not with a skeleton on screen.
    expect(deferred).toContain('await cachedDaysFrom(');
    // And read NOWHERE else, so no second call can creep onto the
    // critical path while this one stays put.
    expect(HOOK.match(/await cachedDaysFrom\(/g)).toHaveLength(1);
  });

  it('does not await the follow-up either', () => {
    // Awaiting it would put it back on the critical path by the back
    // door — `loadTimes` is what the caller awaits.
    expect(HOOK).toContain('void widgetWindowLater();');
    expect(HOOK).not.toMatch(/await widgetWindowLater\(\)/);
  });

  it('keeps the days behind ON the critical path', () => {
    // THE ONE THAT MATTERS, and the one this file was written after
    // getting wrong. `cachedDaysBefore` was measured at 1 ms of the
    // 209 — deferring it saved nothing — and the day carousel derives
    // its indices from `past.length`: HomeScreen slices the daruri span
    // at `table.past.length` and anchors the pager at
    // `addDays(baseDate, -table.past.length)`. Letting `past` grow from
    // empty to seven after the first paint slid those indices out from
    // under the pager, and the card drew an empty page under today's
    // date — every prayer row gone, on the one screen the app is for.
    //
    // So: read before the publish, and published with it.
    expect(deferred).not.toContain('cachedDaysBefore');
    const beforeReady = HOOK.slice(0, readyAt);
    expect(beforeReady).toContain('const pastRaw = await cachedDaysBefore(');
    expect(HOOK.match(/await cachedDaysBefore\(/g)).toHaveLength(1);
  });
});

describe('what the screen is handed in the meantime', () => {
  it('seeds widgetWeek with the week rather than leaving it short', () => {
    // `widgetWeek` promises to be "never shorter than `week`". Seeding it
    // with the week keeps that true at every instant rather than only
    // once the longer window lands — a widget payload built in the gap is
    // then a short window, never a truncated one.
    const firstReady = HOOK.slice(readyAt, readyAt + 900);
    expect(firstReady).toContain('widgetWeek: offsettedWeek,');
    // The real thing, in the same breath as the times it belongs to.
    expect(firstReady).toContain('past: offsettedPast,');
  });

  it('is read by a screen that tolerates the widget window being short', () => {
    // This is what makes deferring it safe: HomeScreen only ever reads
    // `widgetWeek` to build the widget payload, behind a fallback.
    expect(HOME).toContain('state.widgetWeek ?? week');
  });

  it('merges the real window back under both guards', () => {
    // A newer load, or a screen no longer in `ready`: merging then would
    // pair one location's fortnight with another's today.
    const merge = deferred;
    expect(merge).toMatch(
      /if \(gen !== loadGenerationRef\.current\) return;\s*setState\(prev =>\s*prev\.phase === 'ready' \? \{ \.\.\.prev, widgetWeek: offsettedWidgetWeek \}/,
    );
    // And touches nothing else — `past` in particular.
    expect(merge).not.toContain('past:');
  });
});

describe('the second pass, on the device clock', () => {
  // Measured relative to the process start rather than the host's clock,
  // which the first pass had trusted and which was skewed. The cache read
  // itself was 49 ms: 29 for the week and 19 for a status check that ran
  // AFTER it and re-read the same blob. And a second, identical pipeline
  // ran a second later on every launch, because the first GPS fix had no
  // city id to compare with and so always counted as a change of city.
  it('asks the cache status alongside the week rather than after it', () => {
    const started = HOOK.indexOf('const statusPromise = getCacheStatus(');
    const week = HOOK.indexOf('await Promise.allSettled(');
    expect(started).toBeGreaterThan(-1);
    expect(started).toBeLessThan(week);
    expect(HOOK).toContain('const needsCacheFill = await statusPromise;');
    expect(HOOK).not.toContain('await getCacheStatus(');
  });

  it('does not reload a city it already has on screen', () => {
    // The launch load came from saved coordinates and set no city id, so
    // `loadedCityIdRef.current !== summary.cityId` was `null !== id`:
    // always true, always a reload. The coordinates the times were loaded
    // against ARE the previous session's anchor, so comparing the fix's
    // anchor with them is the exact test for "same city".
    expect(HOOK).toContain('loadedCoordsRef.current = { lat: latitude, lng: longitude };');
    expect(HOOK).toMatch(
      /const cityChanged =\s*loadedCityIdRef\.current !== summary\.cityId && !sameAnchorAsLoaded;/,
    );
  });
});

describe('the boot path carries no measurement probes', () => {
  it('has no leftover timing logs', () => {
    // The numbers above came from `console.log` marks in index.js, the
    // settings provider and this hook. They shipped to nobody.
    for (const f of [
      'index.js',
      'src/hooks/usePrayerDay.ts',
      'src/context/PrayerSettingsContext.tsx',
    ]) {
      expect(src(f)).not.toContain('bootmark');
    }
  });
});
