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
import {
  acquirePageFont,
  loadedPageFont,
  mushafFontAvailable,
  pinPageFont,
  unpinPageFont,
} from '../native/MushafFont';
import { ensurePageFontFile, prefetchAround } from './mushafFontStore';

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
): PageFontState {
  const [state, setState] = useState<PageFontState>(() => ({
    family: enabled ? loadedPageFont(page) : null,
    failed: false,
  }));

  useEffect(() => {
    if (!enabled || !mushafFontAvailable) {
      setState({ family: null, failed: !mushafFontAvailable });
      return;
    }

    let alive = true;
    const ready = loadedPageFont(page);
    if (ready) {
      setState({ family: ready, failed: false });
      pinPageFont(page);
    } else {
      setState({ family: null, failed: false });
    }

    void (async () => {
      const path = await ensurePageFontFile(page);
      if (!alive) return;
      if (path == null) {
        setState({ family: null, failed: true });
        return;
      }
      const family = await acquirePageFont(page, path);
      if (!alive) return;
      if (family == null) {
        setState({ family: null, failed: true });
        return;
      }
      pinPageFont(page);
      setState({ family, failed: false });
    })();

    if (prefetchRadius > 0) prefetchAround(page, prefetchRadius);

    return () => {
      alive = false;
      unpinPageFont(page);
    };
  }, [page, enabled, prefetchRadius]);

  return state;
}
