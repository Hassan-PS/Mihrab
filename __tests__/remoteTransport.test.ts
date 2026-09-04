/**
 * What the lock screen's arrows do.
 *
 * A track in this player is one ayah, so the remote next/previous —
 * the lock screen, the notification, the Mac's media keys, the button on
 * a pair of headphones — used to move by about six seconds. Al-Baqarah
 * is 286 of those. The app's own big arrows have moved by surah since
 * they were split from the small ayah pair; the remote ones had not, so
 * the same arrow meant two different things depending on where you
 * pressed it.
 *
 * Source-level rather than behavioural because the subject IS the wiring:
 * which function the remote event is bound to, in a headless service that
 * runs where a test renderer cannot follow it.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const SERVICE = read('src/quran/audio/PlaybackService.ts');
const PLAYBACK = read('src/quran/audio/playback.ts');
const TILAWAH = read('src/screens/quran/TilawahScreen.tsx');

describe('the remote arrows', () => {
  it('move by surah, not by ayah', () => {
    expect(SERVICE).toMatch(
      /Event\.RemoteNext[\s\S]{0,120}?listenNextSurah\(\)/,
    );
    expect(SERVICE).toMatch(
      /Event\.RemotePrevious[\s\S]{0,120}?listenPreviousSurah\(\)/,
    );
  });

  it('never reach for the ayah-level skips again', () => {
    // `skipToNext`/`skipToPrevious` are the six-second step. They belong
    // to the small in-app pair, not to a remote control.
    expect(SERVICE).not.toMatch(/TrackPlayer\.skipTo(Next|Previous)\(/);
  });

  it('are the same two functions the in-app transport calls', () => {
    // One control in two places. If the page ever stops calling these,
    // the lock screen and the app have drifted apart again.
    expect(TILAWAH).toMatch(/listenNextSurah\(\)/);
    expect(TILAWAH).toMatch(/listenPreviousSurah\(\)/);
  });
});

describe('what previous means', () => {
  it('restarts the surah before it steps back a surah', () => {
    // Every music player does this with a track, and a hand reaching for
    // "previous" two minutes into Al-Kahf means "from the top", not
    // "Al-Isra". Pinned because it is one `if` away from being lost.
    expect(PLAYBACK).toMatch(
      /listenPreviousSurah[\s\S]{0,400}?if \(ayah > 1\)[\s\S]{0,120}?listenFrom\(current, 1\)/,
    );
  });
});

describe('ayah stepping survives', () => {
  it('still exists for the small pair', () => {
    expect(PLAYBACK).toMatch(/export async function skipToNextAyah/);
    expect(PLAYBACK).toMatch(/export async function skipToPreviousAyah/);
    expect(TILAWAH).toMatch(/skipToNextAyah\(\)/);
    expect(TILAWAH).toMatch(/skipToPreviousAyah\(\)/);
  });
});
