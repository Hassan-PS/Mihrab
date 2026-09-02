/**
 * Font-slot pinning balance — one pin per mounted page, one unpin.
 *
 * `useMushafPageFont` has two paths that can both run for the SAME mount: the
 * synchronous one (the page's font is already resident in a slot) and the
 * async one (download + register). Both used to call `pinPageFont`, while the
 * cleanup unpinned once — so every revisit to an already-warm page leaked a
 * pin. After FONT_SLOT_COUNT (23) such visits `pickSlot()` could not find an
 * unpinned slot, `acquirePageFont` returned null, and every mushaf page
 * rendered its placeholder until the app was restarted.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const pins: number[] = [];
const unpins: number[] = [];

jest.mock('../src/native/MushafFont', () => ({
  mushafFontAvailable: true,
  // Already resident → the synchronous branch pins…
  loadedPageFont: () => 'MihrabMushaf0',
  // …and the async branch resolves for the same mount too.
  acquirePageFont: async () => 'MihrabMushaf0',
  pinPageFont: (p: number) => {
    pins.push(p);
  },
  unpinPageFont: (p: number) => {
    unpins.push(p);
  },
  isValidFontFile: async () => true,
}));

jest.mock('../src/quran/mushafFontStore', () => ({
  ensurePageFontFile: async () => '/mock/quran/fonts/v2/QCF2001.ttf',
}));

import { useMushafPageFont } from '../src/quran/useMushafPageFont';

function Probe({ page }: { page: number }) {
  useMushafPageFont(page, true, 0);
  return null;
}

describe('useMushafPageFont', () => {
  beforeEach(() => {
    pins.length = 0;
    unpins.length = 0;
  });

  it('pins exactly once per mount and releases it on unmount', async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<Probe page={1} />);
    });
    // Both branches have now run for this mount.
    expect(pins).toEqual([1]);
    await act(async () => {
      root.unmount();
    });
    expect(unpins).toEqual([1]);
  });

  it('stays balanced across repeated visits to the same page', async () => {
    for (let i = 0; i < 30; i++) {
      let root!: ReactTestRenderer;
      await act(async () => {
        root = create(<Probe page={7} />);
      });
      await act(async () => {
        root.unmount();
      });
    }
    expect(pins).toHaveLength(30);
    expect(unpins).toHaveLength(30);
  });
});
