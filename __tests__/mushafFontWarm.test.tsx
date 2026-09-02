/**
 * The fonts around the page being read are REGISTERED ahead of time, not
 * merely fetched to disk.
 *
 * The neighbours' files were prefetched, and registering one with the
 * platform was left to the page's own mount: two bridge round-trips to
 * confirm the file, a native font parse, a state update, and only then the
 * page. Every page swiped to from outside the mounted window showed its
 * spinner for that long — a flicker on every page of a fast flick.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockResident = new Set<number>([50]);
const mockAcquired: number[] = [];
const mockEnsured: number[] = [];

import { InteractionManager } from 'react-native';

jest.mock('../src/native/MushafFont', () => ({
  mushafFontAvailable: true,
  loadedPageFont: (p: number) => (mockResident.has(p) ? `MihrabMushaf${p}` : null),
  acquirePageFont: async (p: number) => {
    mockAcquired.push(p);
    mockResident.add(p);
    return `MihrabMushaf${p}`;
  },
  pinPageFont: () => {},
  unpinPageFont: () => {},
  isValidFontFile: async () => true,
}));

jest.mock('../src/quran/mushafFontStore', () => ({
  ensurePageFontFile: async (p: number) => {
    mockEnsured.push(p);
    return `/mock/quran/fonts/v2/QCF2${String(p).padStart(3, '0')}.ttf`;
  },
}));

import { useMushafPageFont } from '../src/quran/useMushafPageFont';

function Probe({ page, radius }: { page: number; radius: number }) {
  useMushafPageFont(page, true, radius);
  return null;
}

beforeEach(() => {
  // Warming waits for interactions to finish; in here there are none.
  jest
    .spyOn(InteractionManager, 'runAfterInteractions')
    .mockImplementation(((cb: () => void) => {
      cb();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined };
    }) as unknown as typeof InteractionManager.runAfterInteractions);
  mockAcquired.length = 0;
  mockEnsured.length = 0;
  mockResident.clear();
  mockResident.add(50);
});

describe('warming the neighbours', () => {
  it('registers the pages either side, two deep', async () => {
    await act(async () => {
      create(<Probe page={50} radius={2} />);
    });
    expect(mockAcquired.sort((a, b) => a - b)).toEqual([48, 49, 51, 52]);
  });

  it('leaves a neighbour that is already resident alone', async () => {
    mockResident.add(51);
    await act(async () => {
      create(<Probe page={50} radius={1} />);
    });
    expect(mockAcquired).toEqual([49]);
  });

  it('does not warm from a page that is not the one being read', async () => {
    await act(async () => {
      create(<Probe page={50} radius={0} />);
    });
    expect(mockAcquired).toEqual([]);
  });

  it('stops at the covers', async () => {
    mockResident.add(1);
    await act(async () => {
      create(<Probe page={1} radius={2} />);
    });
    expect(mockAcquired.sort((a, b) => a - b)).toEqual([2, 3]);
  });
});

describe('a resident font', () => {
  it('is drawn without going back to the disk', async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<Probe page={50} radius={0} />);
    });
    // Two bridge round-trips per mount, paid for a file the platform
    // already holds in memory — and would draw whether or not it was there.
    expect(mockEnsured).toEqual([]);
    expect(mockAcquired).toEqual([]);
    root.unmount();
  });

  it('but a page that is not resident still fetches and registers', async () => {
    await act(async () => {
      create(<Probe page={7} radius={0} />);
    });
    expect(mockEnsured).toEqual([7]);
    expect(mockAcquired).toEqual([7]);
  });
});
