/**
 * Nothing may go missing — enforced against the source, not against memory.
 *
 * The risk with export/import is not the code that exists; it is the store
 * somebody adds in six months. A new `prayerapp.tasbih.v2` would be written,
 * read, shown on a screen, and silently left out of every backup — and the
 * person who discovers it will be the one restoring onto a new phone after
 * losing the old one.
 *
 * So this test reads every storage key the app declares and requires each
 * one to be in exactly one of two lists: it travels with the user, or it is
 * device-local and named here with a reason. Adding a store without deciding
 * which fails the build. That is the point.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');

/** Every `*_KEY = 'literal'` / `STORAGE_KEY = 'literal'` in the source. */
function declaredKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const text = fs.readFileSync(p, 'utf8');
      // Matches: const FOO_KEY = 'value';  export const KEY = "value";
      const re =
        /(?:export\s+)?const\s+[A-Z][A-Z0-9_]*(?:KEY|PREFIX)[A-Z0-9_]*\s*(?::\s*string\s*)?=\s*['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const key = m[1];
        found.set(key, [...(found.get(key) ?? []), path.relative(SRC, p)]);
      }
    }
  };
  walk(SRC);
  return found;
}

/**
 * Carried by export / import. Must match `snapshotStore.ts` exactly — if
 * these drift, one of the two is wrong and this is where it shows.
 */
const TRAVELS = new Set([
  'prayerapp.journal.v1',
  'prayerapp.fasting.v1',
  'prayerapp.dhikr.v1',
  'prayerapp.sunnah.v1',
  'mihrab.quran.v1',
  'prayerapp.settings.v1',
  'prayerapp.location.v1',
]);

/**
 * Deliberately left behind, each with the reason it would be wrong to carry.
 *
 * "Derived" means the device rebuilds it for itself; "describes this phone"
 * means copying it would make a claim about a device that never did the
 * thing; "too large" means it is content, not record, and re-downloadable.
 */
const STAYS: Record<string, string> = {
  'prayer_times_cache.v2': 'derived — recomputed from coordinates and method',
  prayer_times_cache: 'derived — the legacy cache, migrated then deleted',
  'prayerapp.prayer.v1': 'dead — named in resetAppData but written nowhere',
  'mihrab.cityRegistry.v1': 'describes this phone — where it has been',
  'mihrab.dataStatus.v1': 'derived — diagnostics about the last fetch',
  'prayerapp.providerHealth.v1': 'describes this phone — which host failed here',
  'islamiska_forbundet.reverse.v1': 'derived cache, and holds coordinates',
  'ifis.dataset.v1.city.': 'derived — a per-city timetable cache',
  'mihrab.first_seen_day':
    'describes this phone — the Log’s backfill uses it as the earliest ' +
    'day it may offer, so importing another device’s would let this one ' +
    'claim days it never saw',
  'mihrab.muted_next_adhan': 'describes this phone — a one-off alert flag',
  'mihrab.featureTour.v1': 'describes this phone — whether the tour was seen',
  'mushaf.assets.v3.complete': 'derived — a download completion marker',
  'mushaf.assets.v2.complete': 'derived — legacy download marker',
  'mushaf.assets.v1.complete': 'derived — legacy download marker',
  'prayerapp.location.fallback.v1':
    'a plaintext mirror of prayerapp.location.v1, written only when the ' +
    'Keychain write fails — exporting both would duplicate the coordinates',
  // Not storage keys, but they match the naming pattern.
  'journal-log-prayer': 'a notification action id, not a store',
  'journal-log-sunnah': 'a notification action id, not a store',
  'log-day-all': 'a notification action id, not a store',
  'adhan-snooze-': 'a notification id prefix, not a store',
  'pt-': 'a notification id prefix, not a store',
  'ayah-day-': 'a notification id prefix, not a store',
  'eod-log-': 'a notification id prefix, not a store',
  'fast-rem-': 'a notification id prefix, not a store',
  'khatmah-rem-': 'a notification id prefix, not a store',
  'mihrab.snapshot': 'the export format tag, not a store',
};

describe('every store is either carried or deliberately left', () => {
  const keys = declaredKeys();

  it('finds the stores it is supposed to be checking', () => {
    // A regex that silently matched nothing would make this whole file a
    // green light that guards nothing.
    expect(keys.size).toBeGreaterThan(15);
    for (const k of TRAVELS) expect(keys.has(k)).toBe(true);
  });

  it('has a decision recorded for every declared key', () => {
    const undecided: string[] = [];
    for (const [key, files] of keys) {
      if (TRAVELS.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(STAYS, key)) continue;
      undecided.push(`${key}  (${files.join(', ')})`);
    }
    // If this fails you have added a store. Decide: add it to the snapshot
    // in src/sync/snapshotStore.ts and to TRAVELS, or add it to STAYS with
    // the reason it should not follow the user to a new phone.
    expect(undecided).toEqual([]);
  });

  it('carries exactly the seven the snapshot layer knows about', () => {
    // The other direction: something in TRAVELS that snapshotStore forgot
    // would look decided here while never actually being written.
    const store = fs.readFileSync(
      path.join(SRC, 'sync', 'snapshotStore.ts'),
      'utf8',
    );
    const referenced = [
      'JOURNAL_KEY',
      'FASTING_KEY',
      'DHIKR_KEY',
      'SUNNAH_KEY',
      'QURAN_STORAGE_KEY',
      'SETTINGS_KEY',
      'LOCATION_KEY',
    ];
    for (const name of referenced) {
      // Once to read it, once to write it.
      const uses = store.split(name).length - 1;
      expect(uses).toBeGreaterThanOrEqual(2);
    }
    expect(TRAVELS.size).toBe(referenced.length);
  });

  it('never lets a device-local key slip into the carried set', () => {
    for (const key of Object.keys(STAYS)) {
      expect(TRAVELS.has(key)).toBe(false);
    }
  });
});
