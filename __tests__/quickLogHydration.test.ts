/**
 * The check on Today records nothing until the journal has been read.
 *
 * `useQuickLog` writes "the journal it holds, plus this prayer". Before the
 * practice store hydrates, the journal it holds is `[]` — and `[]` plus one
 * entry, written to disk, is the user's record replaced by a single line
 * (issue #38). Source pins, because the hook needs a mounted tree and the
 * whole point is the two lines that run before anything renders.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('useQuickLog', () => {
  const src = read('src/journal/quickLog.ts');

  it('tracks whether the store has hydrated', () => {
    expect(src).toMatch(/hydratedRef\.current = store\.hydrated/);
  });

  it('refuses to toggle — or to record an answer — before it has', () => {
    const toggle = src.slice(src.indexOf('const toggle = useCallback('));
    const guard = toggle.indexOf("if (!hydratedRef.current) return 'nothing';");
    const write = toggle.indexOf('await persist(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write);
    const record = src.slice(src.indexOf('const record = useCallback('));
    expect(record.indexOf('if (!hydratedRef.current) return;')).toBeLessThan(
      record.indexOf('await persist('),
    );
  });
});

describe('the check on Today', () => {
  const src = read('src/screens/home/TodayCard.tsx');

  it('is drawn as not-yet until the journal has been read', () => {
    // `ready` carries it now: the ring is drawn at a whisper exactly as
    // for a prayer whose time has not come, and it is the ONE state that
    // takes no press — there is nothing to answer the tap with (#41 follow-up).
    expect(src).toContain('ready: quickLog.hydrated,');
    const check = readFileSync(
      join(__dirname, '..', 'src/screens/home/LogCheck.tsx'),
      'utf8',
    );
    expect(check).toContain("const notYet = phase === 'not-yet' || !ready;");
    expect(check).toContain('disabled={!ready}');
  });
});

describe('the Log screen', () => {
  const src = read('src/screens/LogScreen.tsx');

  it('reads its three stores strictly', () => {
    for (const key of ['JOURNAL_KEY', 'FASTING_KEY', 'SUNNAH_KEY']) {
      expect(src).toMatch(
        new RegExp(`durableEncryptedGet\\(${key}, \\{ strict: true \\}\\)`),
      );
    }
  });

  it('locks every persist behind hydration', () => {
    for (const fn of ['persistJournal', 'persistFasts', 'persistSunnah']) {
      const body = src.slice(src.indexOf(`const ${fn} = useCallback(`));
      const guard = body.indexOf('if (!hydratedRef.current) return;');
      const write = body.indexOf('durableEncryptedSet(');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(write);
    }
  });

  it('does not call itself hydrated after a read that failed', () => {
    // `setHydrated(true)` lives in the success branch, not a `finally`.
    const load = src.slice(
      src.indexOf('durableEncryptedGet(JOURNAL_KEY, { strict: true })'),
      src.indexOf('const hydratedRef'),
    );
    expect(load).not.toMatch(/\.finally\(/);
    expect(load.indexOf('setHydrated(true)')).toBeLessThan(load.indexOf('.catch('));
  });
});
