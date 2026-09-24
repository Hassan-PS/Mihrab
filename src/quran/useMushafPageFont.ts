/**
 * Loads the QPC v2 font for a mushaf page and keeps it alive while the page is
 * mounted — v2.8.0.
 *
 * Two steps, in order: get the file on disk (downloading it if this is the
 * first visit), then register it with the platform so a `<Text>` can name it.
 * The returned family is null until both have happened, which is the reader's
 * cue to show the page's placeholder rather than a blank sheet.
 *
 * The pin/unpin pair is what stops the font slot pool from recycling a font
 * out from under a page that is still on screen.
 */
import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import {
  acquirePageFont,
  loadedPageFont,
  mushafFontAvailable,
  pinPageFont,
  unpinPageFont,
} from '../native/MushafFont';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  ensurePageFontFile,
  tajweedFontSet,
  type MushafFontSet,
} from './mushafFontStore';
import { setMushafGlyphSet } from './mushafLayout';
import { useQuranState } from './quranState';

/**
 * Which page fonts this reader draws with, from the preference and the
 * tone: V2, or V4's tajwīd colours in the palette cut for the tone.
 *
 * Applying the glyph set here, in render, is deliberate: the layout
 * geometry (`getPageLayout`) is read in the same render, by the reader for
 * its column height and by every page surface for its lines, and all of
 * them have to see the set the fonts are about to be drawn in. An effect
 * would switch it a frame after the pages had been laid out for the other.
 */
export function useMushafFontSet(nightMode: boolean): MushafFontSet {
  const { prefs } = useQuranState();
  const set: MushafFontSet = prefs.tajweedColours ? tajweedFontSet(nightMode) : 'v2';
  setMushafGlyphSet(set === 'v2' ? 'v2' : 'tajweed');
  return set;
}

/**
 * The slot pool's key for a page of a font set. The pool was written for
 * one set and keys its slots by page; a second set's page 125 is a
 * different typeface, so it gets a different key. The set's block is
 * wide enough that no page of one set can collide with another.
 */
export function fontKey(page: number, set: MushafFontSet): number {
  const block = set === 'v2' ? 0 : set === 'tajweed-light' ? 1 : 2;
  return block * 1000 + page;
}

/**
 * Register the fonts around `page` ahead of time, so the next page drawn
 * is drawn on its first frame.
 *
 * ── WHY THE FILE ON DISK WAS NOT ENOUGH ──────────────────────────────
 *
 * The neighbours' fonts were prefetched — to disk. Registering one with
 * the platform is the other half, and it was left to the page's own mount:
 * two bridge round-trips to confirm the file, then a native font parse,
 * then a state update, and only then the page. Every page swiped to from
 * outside the mounted window showed its spinner for that long, which on a
 * fast flick is a flicker on every page.
 *
 * The slot pool has room for it — 23 slots against at most six mounted
 * pages — and a slot claimed for a neighbour is unpinned, so it is the
 * first to be recycled if the pool ever fills. After interactions, not
 * during: a font parse on the main thread in the middle of the turn
 * animation is a dropped frame, and the whole point is smoothness.
 */
export function warmAround(page: number, radius: number, set: MushafFontSet = 'v2'): void {
  const pages: number[] = [];
  for (let d = 1; d <= radius; d++) {
    for (const p of [page + d, page - d]) {
      if (p >= 1 && p <= MUSHAF_TOTAL_PAGES && !loadedPageFont(fontKey(p, set))) pages.push(p);
    }
  }
  if (pages.length === 0) return;
  void InteractionManager.runAfterInteractions(() => {
    for (const p of pages) {
      void ensurePageFontFile(p, set).then(path => {
        const key = fontKey(p, set);
        if (path != null && !loadedPageFont(key)) void acquirePageFont(key, path);
      });
    }
  });
}

export type PageFontState = {
  /** `fontFamily` to draw the page with, or null while it loads. */
  family: string | null;
  /** True once we have tried and failed — the reader falls back to images. */
  failed: boolean;
};

export function useMushafPageFont(
  page: number,
  enabled: boolean,
  prefetchRadius = 0,
  set: MushafFontSet = 'v2',
): PageFontState {
  const key = fontKey(page, set);
  const [state, setState] = useState<PageFontState>(() => ({
    family: enabled ? loadedPageFont(key) : null,
    failed: false,
  }));

  useEffect(() => {
    if (!enabled || !mushafFontAvailable) {
      setState({ family: null, failed: !mushafFontAvailable });
      return;
    }

    let alive = true;
    // Exactly ONE pin per mount, released by exactly one unpin in the
    // cleanup. Both branches below can run for the same mount (the font is
    // already resident AND the async path completes), and pinning twice
    // leaked a pin per revisit — after ~FONT_SLOT_COUNT visits every slot
    // was permanently pinned, `pickSlot()` returned null, and pages stopped
    // rendering until the app was restarted.
    let pinned = false;
    const pinOnce = () => {
      if (pinned) return;
      pinned = true;
      pinPageFont(key);
    };

    const ready = loadedPageFont(key);
    if (ready) {
      // Registered already — warmed by a neighbour, or simply still in the
      // pool. Nothing to fetch and nothing to check: a font the platform
      // holds draws whether or not its file is still on disk, and the two
      // bridge round-trips the check cost were paid on every mount.
      setState({ family: ready, failed: false });
      pinOnce();
    } else {
      setState({ family: null, failed: false });
      void (async () => {
        const path = await ensurePageFontFile(page, set);
        if (!alive) return;
        if (path == null) {
          setState({ family: null, failed: true });
          return;
        }
        const family = await acquirePageFont(key, path);
        if (!alive) return;
        if (family == null) {
          setState({ family: null, failed: true });
          return;
        }
        pinOnce();
        setState({ family, failed: false });
      })();
    }

    return () => {
      alive = false;
      if (pinned) unpinPageFont(key);
    };
  }, [page, key, set, enabled]);

  // Its own effect, so the radius changing does not re-run the one above.
  // It did: the reader hands the radius to the page being read and 0 to
  // the rest, so every turn flipped it on two pages, and each flip
  // unpinned the font, re-ran the load, pinned it again and set state —
  // a render of both neighbours for a page that had not moved.
  useEffect(() => {
    if (enabled && mushafFontAvailable && prefetchRadius > 0) {
      warmAround(page, prefetchRadius, set);
    }
  }, [page, enabled, prefetchRadius, set]);

  return state;
}
