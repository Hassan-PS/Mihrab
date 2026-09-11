/**
 * The line across the top of the Qur'an while something is downloading.
 *
 * Reported: the tilāwah download had neither — no strip and no
 * notification — so a per-surah download was something you could start,
 * not see, and not get back to. The strip was written inside the muṣḥaf
 * reader for the font download, which is why only the font download ever
 * had one; this pins that it now names whichever job is actually running.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (k: string, d?: unknown) => {
      const opts = d as { defaultValue?: string } | string | undefined;
      const tpl = typeof opts === 'string' ? opts : (opts?.defaultValue ?? k);
      return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        String((opts as Record<string, unknown>)?.[key] ?? ''),
      );
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      bg: '#fff',
      card: '#eee',
      text: '#000',
      muted: '#666',
      accent: '#0a0',
      accentSolid: '#0a0',
      accentBg: '#efe',
      controlBg: '#ddd',
      border: '#ccc',
    },
  }),
}));

import { QuranDownloadStripView } from '../src/quran/QuranDownloadStrip';
import type { QuranDownloadState } from '../src/quran/quranDownloadManager';

const texts = (root: ReactTestInstance): string[] =>
  root
    .findAllByType('Text' as never, { deep: true })
    .flatMap(n =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
        .map(String),
    );

const state = (
  running: QuranDownloadState['running'],
  done: number,
  total: number,
): QuranDownloadState => ({
  running,
  progress: { done, total, failed: 0 },
  last: null,
});

const mount = (s: QuranDownloadState, top = 0) => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<QuranDownloadStripView run={s} top={top} />);
  });
  return tree;
};

const render = (s: QuranDownloadState, top = 0) => mount(s, top).root;

describe('what the strip says', () => {
  it('is not there at all when nothing is downloading', () => {
    expect(mount(state(null, 0, 0)).toJSON()).toBeNull();
  });

  it('names the mushaf for the font download', () => {
    const said = texts(render(state({ kind: 'fonts' }, 302, 604), 0)).join(' ');
    expect(said).toMatch(/mushaf/i);
    expect(said).toMatch(/50%/);
  });

  it('names the reciter for a whole-Quran recitation', () => {
    const said = texts(
      render(state({ kind: 'audio', reciterId: 'husary' }, 1559, 6236)),
    ).join(' ');
    expect(said).toMatch(/Husary/i);
    expect(said).toMatch(/25%/);
  });

  it('names the surah for one surah of tilawah', () => {
    // The whole point of the report: this download said nothing anywhere.
    const said = texts(
      render(state({ kind: 'surah', reciterId: 'husary', surah: 1 }, 3, 4)),
    ).join(' ');
    expect(said).toMatch(/Fatihah/i);
    expect(said).toMatch(/75%/);
    expect(said).not.toMatch(/mushaf/i);
  });

  it('offers the one control that matters', () => {
    const said = texts(
      render(state({ kind: 'surah', reciterId: 'husary', surah: 2 }, 1, 286)),
    ).join(' ');
    expect(said).toMatch(/cancel/i);
  });
});

describe('what the strip draws', () => {
  const fill = (root: ReactTestInstance) =>
    root
      .findAllByType('View' as never, { deep: true })
      .map(n => n.props.style)
      .flat(3)
      .find(
        (s: unknown) =>
          s != null &&
          typeof s === 'object' &&
          typeof (s as { width?: unknown }).width === 'string',
      ) as { width: string } | undefined;

  it('fills the track to the percentage, not to the count', () => {
    expect(fill(render(state({ kind: 'fonts' }, 151, 604)))?.width).toBe('25%');
  });

  it('is empty rather than full when the total is not known yet', () => {
    // A bar that starts full and empties is worse than one that waits.
    expect(fill(render(state({ kind: 'fonts' }, 0, 0)))?.width).toBe('0%');
  });

  it('clears whatever the screen tells it to clear', () => {
    // iOS floats its header over the content; in fullscreen there is a
    // camera. Either way the number comes from the screen.
    const root = render(state({ kind: 'fonts' }, 1, 604), 44);
    const pads = root
      .findAllByType('View' as never, { deep: true })
      .map(n => n.props.style)
      .flat(3)
      .filter(
        (s: unknown) =>
          s != null &&
          typeof s === 'object' &&
          typeof (s as { paddingTop?: unknown }).paddingTop === 'number',
      ) as Array<{ paddingTop: number }>;
    expect(pads.some(p => p.paddingTop > 44)).toBe(true);
  });
});
