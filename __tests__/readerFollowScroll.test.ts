/**
 * Landscape: the column is a reading zoom, taller than the window, and the
 * recitation walks off the bottom of it within a few āyāt. Reported as the
 * player "not following the word highlight as it moves across the page" —
 * which is what it looked like: the highlight was moving, out of sight.
 *
 * And with the player up there was no room for it: the page rail and the
 * player are ~48 and ~50 of about 300dp, so the player ran off the bottom
 * of the window with its title and buttons cut in half.
 */
import fs from 'fs';
import path from 'path';

import { followOffset, type AyahLineBox } from '../src/quran/mushafFollowScroll';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const line = (y: number): AyahLineBox => ({ y, lineHeight: 60 });

describe('where a following column scrolls to', () => {
  // A third of the way down, not centred: the reader is going DOWN the
  // page, so the lines that matter next are the ones below this one.
  it('puts the line a third of the way down', () => {
    expect(followOffset(line(900), 300, 2000)).toBe(900 + 30 - 100);
  });

  it('never scrolls above the top of the page', () => {
    expect(followOffset(line(0), 300, 2000)).toBe(0);
    expect(followOffset(line(40), 300, 2000)).toBe(0);
  });

  it('never scrolls past the end of the column', () => {
    expect(followOffset(line(1980), 300, 2000)).toBe(1700);
  });

  // A column shorter than its viewport has nowhere to go.
  it('stays put when everything is already in view', () => {
    expect(followOffset(line(100), 800, 500)).toBe(0);
  });
});

describe('the reader follows only where a column scrolls', () => {
  const reader = read('src/quran/MushafPhoneReader.tsx');

  it('does nothing in portrait, and nothing on a silent page', () => {
    expect(reader).toContain(
      'if (!geometry?.scrolling || !playingAyah) return;',
    );
    expect(reader).toContain('ayahLineBox(page, geometry.textWidth');
  });

  // And neither bar is the one that gives way: the pager is `flex: 1` and
  // has room to give, while a squashed player card clipped its own row —
  // "a white thing covering the player controls".
  it('the bottom chrome keeps its height', () => {
    expect(read('src/quran/audio/MiniPlayer.tsx')).toMatch(
      /card: \{[\s\S]*?flexShrink: 0,/,
    );
    expect(read('src/quran/MushafPageScrubber.tsx')).toMatch(
      /wrap: \{[\s\S]*?flexShrink: 0,/,
    );
  });

  it('the rail steps aside for the player in landscape', () => {
    expect(reader).toContain(
      'const railYieldsToPlayer = width > height && playback.active != null;',
    );
    expect(reader).toContain('{!railYieldsToPlayer ? (');
  });

  /**
   * And for nothing else. The rail used to retire with the header in
   * fullscreen, which was the wrong company to keep: a title and its
   * buttons are what you hide to see the page, and the rail is how you
   * move through the muṣḥaf. Without it, fullscreen reading was a page at
   * a time — and since the medallion went, the rail is also the only
   * thing on screen that names the page.
   */
  it('stays through fullscreen', () => {
    expect(reader).not.toMatch(/!isFullscreen && !railYieldsToPlayer/);
    // The header still goes: that is what fullscreen is for.
    expect(reader).toMatch(/StatusBar hidden=\{isFullscreen\}/);
  });
});
