/**
 * The player must not tax the phone while nobody is looking at it.
 *
 * The app's own promise is that recitation keeps going with the screen
 * off. Everything that DRAWS the recitation — the position line, the word
 * highlight, the page that follows it — is worthless in a pocket and was
 * still running there: pollers against the native player at two and four
 * times a second, a store publish per word, fifteen line re-renders per
 * publish, a scroll per ayah of a page nobody could see, for as long as
 * the surah ran. These are the rules that keep it quiet.
 *
 * The Today countdown learned the same lesson earlier
 * (docs/design/background-power.md); this is the player catching up.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory()
      ? walk(path.join(dir, d.name))
      : /\.tsx?$/.test(d.name)
        ? [path.join(dir, d.name)]
        : [],
  );

describe('polling the player', () => {
  /**
   * `useProgress` from react-native-track-player is a timeout loop that
   * asks the bridge for the position every interval for as long as the
   * hook is mounted — it does not know whether the screen is on. The
   * only place it may be called is the wrapper that does know.
   */
  it('goes through the one hook that stops when nobody is looking', () => {
    const offenders = walk(path.join(REPO, 'src'))
      .filter(f => !f.endsWith('useProgressWhileActive.ts'))
      .filter(f =>
        fs
          .readFileSync(f, 'utf-8')
          .split('\n')
          // Code, not the comments that explain why it is not here.
          .some(line => /\buseProgress\(/.test(line) && !/^\s*(\*|\/\/)/.test(line)),
      )
      .map(f => path.relative(REPO, f));
    expect(offenders).toEqual([]);
  });

  it('is foreground AND focus, not focus alone', () => {
    const hook = read('src/quran/audio/useProgressWhileActive.ts');
    expect(hook).toMatch(/useIsActive\(\)/);
    expect(hook).toMatch(/useProgress\(active \? ms : IDLE_POLL_MS\)/);
    // An hour: "never" for a UI, and still a valid timer for the loop.
    expect(hook).toMatch(/IDLE_POLL_MS = 60 \* 60 \* 1000/);
  });
});

describe('the word being recited', () => {
  it('is published only while a human can see the line it lights', () => {
    for (const reader of [
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/MushafSpreadReader.tsx',
    ]) {
      const src = read(reader);
      expect(src).toMatch(
        /\{playback\.active && playback\.playing && uiActive \? \(\s*<ActiveWordProbe \/>\s*\) : null\}/,
      );
    }
    expect(read('src/screens/quran/TilawahScreen.tsx')).toMatch(
      /showPage && active && status\.active && status\.playing \? \(\s*<ActiveWordProbe/,
    );
  });
});

describe('the page that follows the recitation', () => {
  /**
   * With the app away the page is handed no recited ayah at all: no
   * re-tint per ayah, no follow-scroll, nothing for fifteen lines to
   * consider. One re-render out, one back — where the effects catch up
   * to wherever the reciter has got to. The PAGE turn itself still
   * happens in the core, because that is what keeps "continue reading"
   * honest after an hour of listening in a pocket.
   */
  it('is told nothing while the app is away', () => {
    for (const reader of [
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/MushafSpreadReader.tsx',
    ]) {
      const src = read(reader);
      expect(src).toMatch(/const uiActive = useIsActive\(\);/);
      expect(src).toMatch(/const playingRef = uiActive \? playback\.active : null;/);
    }
    // …but the reader core still turns the page.
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/setCurrentPage\(prev => \(page !== prev \? page : prev\)\)/);
  });
});

describe('the engine, per ayah', () => {
  const engine = read('src/quran/audio/playback.ts');

  /**
   * `getQueue()` hands the whole queue across the bridge — up to seven
   * hundred tracks with their urls, titles and artwork. Two jobs each
   * fetched their own copy on every track change, and the prefetch
   * fetched a third per file it finished: a few hundred kilobytes of
   * queue serialised every six seconds to answer "what is next".
   */
  it('looks at the queue once', () => {
    const onChange = engine.slice(
      engine.indexOf('Event.PlaybackActiveTrackChanged'),
      engine.indexOf('Event.PlaybackState'),
    );
    expect(onChange).toMatch(/snapshotQueue\(\)\.then/);
    expect(onChange).toMatch(/prefetchUpcoming\(snap\)/);
    expect(onChange).toMatch(/extendListening\(snap\)/);
    expect(engine.match(/TrackPlayer\.getQueue\(\)/g)).toHaveLength(1);
  });

  it('swaps a prefetched file in by index, not by scanning', () => {
    expect(engine).toMatch(/TrackPlayer\.getTrack\(i\)/);
    // Still never the entry the player may already be buffering.
    expect(engine).toMatch(/i < idx2 \+ 2/);
  });
});

describe('the other clock that was still ticking', () => {
  it('the Log minute tick stops in a pocket too', () => {
    const log = read('src/screens/LogScreen.tsx');
    expect(log).toMatch(/const logActive = useIsActive\(\);/);
    expect(log).toMatch(/if \(!isToday \|\| !logActive\) return;/);
  });
});
