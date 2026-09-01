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
  'habous.dataset.v1.city.':
    'derived — the ministry’s published timetable for one city, re-downloadable',
  'mihrab.first_seen_day':
    'describes this phone — the Log’s backfill uses it as the earliest ' +
    'day it may offer, so importing another device’s would let this one ' +
    'claim days it never saw',
  'mihrab.muted_next_adhan': 'describes this phone — a one-off alert flag',
  'mihrab.tasbih.v1':
    'a sitting, not a record — it holds which dhikr is on screen and how ' +
    'far into the current round you are, and a sitting ends rather than ' +
    'migrating. The part that IS a record, the completed sets per day, is ' +
    'prayerapp.dhikr.v1 and that does travel, so nothing about someone’s ' +
    'dhikr history is lost by leaving this behind',
  'mihrab.featureTour.v1': 'describes this phone — whether the tour was seen',
  'mihrab.syncHint.dismissed.v1':
    'describes this phone — which one-off pointers the user has waved away, ' +
    'the same kind of thing as the feature tour flag',

  'quran/riwayat/v1':
    'content, not record — a muṣḥaf the reader obtained from its publisher ' +
    'and can obtain again. It is a few megabytes of scripture per riwayah, ' +
    'it is identical on every device that has it, and Mihrab has no right ' +
    'to redistribute it (src/quran/riwayahStore.ts) — which an export ' +
    'mailed to somebody else would be doing. Manage downloads lists it ' +
    'with its size and removes it; the PREFERENCE for which riwayah to ' +
    'read does travel, inside the Quran state, and resolves back to Hafs ' +
    'on a device that has no data for it',
  'mushaf.assets.v3.complete': 'derived — a download completion marker',
  'mushaf.assets.v2.complete': 'derived — legacy download marker',
  'mushaf.assets.v1.complete': 'derived — legacy download marker',
  'prayerapp.location.fallback.v1':
    'a plaintext mirror of prayerapp.location.v1, written only when the ' +
    'Keychain write fails — exporting both would duplicate the coordinates',
  // Not storage keys, but they match the naming pattern.
  //
  // The resync gates (src/utils/resyncGate.ts) are in-memory Map keys naming
  // a piece of foreground work — "have the inputs to this changed since it
  // last ran". They are not written anywhere, they are meaningless on
  // another device, and they are meaningless in this process a second after
  // it restarts, which is exactly the behaviour wanted: a cold start should
  // do the work unconditionally.
  'root.dailyReschedules': 'a resync gate key, not a store',
  'prayerDay.foreground': 'a resync gate key, not a store',
  'home.prayerNotifications': 'a resync gate key, not a store',
  'home.endOfDayReminders': 'a resync gate key, not a store',
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
  'prayerapp.sync.secret.v1':
    'this device’s X25519 secret half, and the one key in the app that ' +
    'must NEVER travel. Carrying it would give every paired device the ' +
    'same identity, so a phone that was lost could not be removed from ' +
    'the set without re-keying all of them — and the whole point of a ' +
    'per-device keypair is that losing one costs one. The PUBLIC half ' +
    'travels, by hand, as the pairing code',
  'prayerapp.sync.peers.v1':
    'the paired-device list, and it must not travel for a reason separate ' +
    'from the secret key: carrying it would make pairing transitive. ' +
    'Snapshots get exported to files and files get sent to people, so a ' +
    'friend who imported your export to look at the format would join your ' +
    'device set, and the next sync would seal your journal to their key. ' +
    'Pairing is a decision someone makes by carrying a code, once, per ' +
    'device — nothing else may create it',
  'prayerapp.sync.removed.v1':
    'devices the user has removed. It DOES travel — but only in the sealed ' +
    'body of a sync envelope, put there by folderSync, never in a snapshot ' +
    'and so never in an export. That distinction is the whole design: a ' +
    'removal must reach the other devices or "remove this tablet" means ' +
    'nothing anywhere but here, while a backup mailed to a friend must not ' +
    'be able to unpair the friend’s phones. The peer LIST cannot travel at ' +
    'all (see above) because it creates pairings; a removal only destroys ' +
    'one, and a code makes it again',
  'mihrab.sync.deviceName.v1':
    'describes this phone — the label it shows to other devices. Carrying ' +
    'it would rename every device in the set to whatever the last import ' +
    'came from',
  'prayerapp.sync.settings.v1':
    'describes this phone — the folder handle is a Storage Access Framework ' +
    'URI or an iOS security-scoped bookmark, and both are meaningless on ' +
    'any other device. Carrying it would point a phone at a directory it ' +
    'has no permission for, or at somebody else’s',
  MHRB: 'the pairing code prefix, not a store',
  'mihrab-': 'the sync filename prefix, not a store',
  'prayerapp.unprotected.':
    'a prefix, not a store — it namespaces the plaintext copy durableWrite ' +
    'falls back to on a build with no Keychain. Whatever sits under it is ' +
    'the same value as the real key, so the decision that matters was ' +
    'already made against that key. Carrying the prefix itself would mean ' +
    'sending another device a copy of a secret the Keychain exists to keep ' +
    'off the wire',

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
