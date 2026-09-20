/**
 * THE BUTTON THAT WAS NOT THERE — issue #55.
 *
 * The model half of this is next door in `downloadResumes.test.ts`; the
 * bytes were never the problem. This is about the three places a reader
 * meets a download that stopped, all three of which used to say nothing
 * or offer nothing:
 *
 *   • the reciter's row, which showed Delete and only Delete the moment
 *     one file existed — "the only option seems to be to delete the
 *     download and start again from 0%";
 *   • the strip across the Quran screen, which rendered the running job
 *     or nothing at all, so the download simply vanished;
 *   • the notification, which said the download had failed and, when
 *     tapped, did nothing — because nothing in the app read the press.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const picker = read('src', 'quran', 'audio', 'ReciterPickerSheet.tsx');
const strip = read('src', 'quran', 'QuranDownloadStrip.tsx');
const downloads = read('src', 'screens', 'QuranDownloadsScreen.tsx');
const route = read('src', 'notifications', 'notificationRoute.ts');
const linking = read('src', 'navigation', 'linking.ts');
const notification = read('src', 'quran', 'downloadNotification.ts');
const root = read('src', 'AppNavigationRoot.tsx');
const en = JSON.parse(read('src', 'i18n', 'locales', 'en.json'));

describe('the reciter row, where the report starts', () => {
  it('offers the rest of it as well as the delete', () => {
    // The old shape was `stats ? delete : download`, so ANY reciter with
    // a single ayah on disk — a stopped download, or twenty ayahs cached
    // by an online listen — had exactly one button, and it deleted.
    expect(picker).toMatch(/!stats\.complete \?[\s\S]{0,600}startQuranDownload\(job\)/);
    expect(picker).toContain('quran.listenResumeReciter');
  });

  it('and offers it only where there is a rest to fetch', () => {
    // A complete reciter would otherwise get a button that walks 6,236
    // files to do nothing.
    const between = picker.slice(
      picker.indexOf('{!stats.complete ?'),
      picker.indexOf('listenDeleteAudio'),
    );
    expect(between).toContain('startQuranDownload(job)');
    expect(between.length).toBeGreaterThan(0);
  });
});

describe('the strip, which used to disappear with the download', () => {
  it('stays up for a run that stopped, saying where it got to', () => {
    expect(strip).toMatch(/if \(!job\) \{[\s\S]{0,400}interrupted/);
    expect(strip).toContain('quran.downloadStoppedStrip');
  });

  it('with both answers on it: pick it up, or let it go', () => {
    expect(strip).toContain('resumeQuranDownload()');
    expect(strip).toContain('dismissResumableJob()');
  });

  it('and letting it go takes the offer, not the files', () => {
    const manager = read('src', 'quran', 'quranDownloadManager.ts');
    const body = manager.slice(manager.indexOf('export function dismissResumableJob'));
    expect(body.slice(0, 400)).not.toMatch(/delete(Reciter|Surah)Audio|unlink/);
  });
});

describe('manage downloads, where the tap now lands', () => {
  it('says what is actually there for a part-downloaded reciter', () => {
    expect(downloads).toMatch(/whole[\s\S]{0,200}downloadProgressAyahs/);
  });

  it('and offers to continue it', () => {
    expect(downloads).toMatch(/whole\s*\n?\s*\?\s*undefined[\s\S]{0,200}startQuranDownload\(\{ kind: 'audio'/);
    expect(downloads).toContain('quran.listenDownloadResume');
  });
});

describe('the notification, tapped', () => {
  it('carries a destination at all — #27 had already said this once', () => {
    expect(notification).toMatch(/data: input\.route \? \{ route: input\.route \} : undefined/);
  });

  it('calls it stopped rather than failed, and says what is kept', () => {
    expect(notification).toContain('quran.downloadStoppedTitle');
    const manager = read('src', 'quran', 'quranDownloadManager.ts');
    expect(manager).toContain('quran.downloadStoppedBodyAyahs');
    expect(manager).toContain('quran.downloadStoppedBodyPages');
    expect(manager).toContain('route: ROUTE_QURAN_DOWNLOADS');
  });

  it('and the destination is a screen with a Resume button on it', () => {
    expect(route).toContain('ROUTE_QURAN_DOWNLOADS');
    expect(route).toMatch(/ROUTE_QURAN_DOWNLOADS\) \{\s*\n\s*return `\$\{MIHRAB_SCHEME\}downloads`/);
    // A path the navigator has never heard of is not a no-op: React
    // Navigation warns and the link dies somewhere unhelpful.
    expect(linking).toMatch(/QuranDownloads: 'downloads'/);
  });
});

describe('the automatic half', () => {
  it('is started once, by the app rather than by a screen', () => {
    // The same reasoning as the download itself: a watcher owned by a
    // screen stops watching when the screen goes away, and the screen is
    // the first thing to go when a phone goes in a pocket.
    expect(root).toContain('startDownloadResumeWatch()');
  });

  it('and waits for wifi, because a reciter is a gigabyte', () => {
    const watch = read('src', 'quran', 'quranDownloadResume.ts');
    expect(watch).toMatch(/type !== 'wifi' && state\.type !== 'ethernet'/);
    expect(watch).toMatch(/isConnectionExpensive !== true/);
  });
});

describe('every string it needs, in every language', () => {
  const KEYS = [
    'downloadStoppedTitle',
    'downloadStoppedBodyAyahs',
    'downloadStoppedBodyPages',
    'downloadStoppedStrip',
    'listenResumeReciter',
    'listenDownloadResume',
  ];
  const locales = ['en', 'ar', 'sv', 'de', 'es', 'fr', 'hi', 'bn', 'id', 'ru', 'tr', 'ur', 'zh'];

  it.each(locales)('%s has them all, and none is the English one', loc => {
    const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
    expect(json.common.dismiss).toBeTruthy();
    for (const key of KEYS) {
      expect(json.quran[key]).toBeTruthy();
      if (loc !== 'en') expect(json.quran[key]).not.toBe(en.quran[key]);
    }
  });

  it('keeps the interpolations the code passes', () => {
    for (const loc of locales) {
      const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
      for (const key of ['downloadStoppedBodyAyahs', 'downloadStoppedBodyPages']) {
        expect(json.quran[key]).toContain('{{done}}');
        expect(json.quran[key]).toContain('{{total}}');
      }
      expect(json.quran.downloadStoppedStrip).toContain('{{name}}');
      expect(json.quran.downloadStoppedStrip).toContain('{{pct}}');
      expect(json.quran.listenResumeReciter).toContain('{{name}}');
    }
  });
});
