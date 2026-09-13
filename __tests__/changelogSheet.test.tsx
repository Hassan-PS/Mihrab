/**
 * The changelog sheet — what it puts at the top, and what it calls new.
 *
 * The surface is shown to every user of every update, unprompted, and it
 * has exactly two jobs it can get wrong in a way nobody would notice in
 * review: showing a version the phone does not have, and marking as new
 * something the reader was already told about. Both are here.
 *
 * The third is the reason the pager went: a continuous list has to put
 * the installed release FIRST and keep the rest under it, in order, or it
 * is not a changelog.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

const INSTALLED = '2.18.3';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      bg: '#FFFFFF',
      card: '#F5F5F5',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#0F5132',
      accentBg: '#E7F0EB',
      accentSolid: '#0F5132',
      onAccent: '#FFFFFF',
      controlBg: '#EEEEEE',
      overlay: 'rgba(0,0,0,0.6)',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (k: string, d?: unknown, opts?: Record<string, unknown>) => {
      const fallback = typeof d === 'string' ? d : k;
      if (!opts) return fallback;
      return Object.entries(opts).reduce(
        (s, [key, value]) => s.replace(`{{${key}}}`, String(value)),
        fallback,
      );
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../src/appVersion', () => ({
  getInstalledAppVersionName: () => INSTALLED,
  getInstalledAppVersionLabel: () => INSTALLED,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: { Consumer: ({ children }: never) => children },
}));

jest.mock('../src/responsive/breakpoints', () => ({
  useBreakpoint: () => 'compact',
}));

const { ChangelogSheet } = require('../src/polish/ChangelogSheet');
const { CHANGELOG } = require('../src/polish/releaseNotes');

type Node = { props: Record<string, unknown>; children?: unknown };

/**
 * Every string the sheet draws, as a reader would see it.
 *
 * The bidi isolates around a version number are stripped: they are there
 * so `2.18.5-beta` does not come out as `beta-2.18.5` in Arabic, they are
 * invisible, and a test that had to know about them would be a test about
 * the implementation rather than about what is on screen.
 */
function texts(tree: ReactTestRenderer): string[] {
  const isolates = new RegExp(
    `[${String.fromCharCode(0x2066)}${String.fromCharCode(0x2069)}]`,
    'g',
  );
  return tree.root
    .findAllByType(Text)
    .map((n: Node) => n.props.children)
    .filter((c): c is string => typeof c === 'string')
    .map(s => s.replace(isolates, ''));
}

function render(since: string | null): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ChangelogSheet visible onClose={() => {}} since={since} />,
    );
  });
  return tree;
}

describe('what the sheet lists', () => {
  it('opens on the installed release, not on the newest one written', () => {
    // The table is committed ahead of the tag, so it can legitimately
    // hold releases this build has never been. Showing one would tell a
    // reader about a feature they do not have.
    const tree = render(null);
    const shown = texts(tree);
    expect(shown).toContain(INSTALLED);
    for (const r of CHANGELOG) {
      if (r.version === INSTALLED) break;
      expect(shown).not.toContain(r.version);
    }
  });

  it('runs newest first', () => {
    const shown = texts(render(null));
    const order = CHANGELOG.map((r: { version: string }) => r.version)
      .filter((v: string) => shown.includes(v));
    const positions = order.map((v: string) => shown.indexOf(v));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it('names the installed version in its own header', () => {
    expect(texts(render(null))).toContain(`Mihrab ${INSTALLED}`);
  });

  it('isolates a version number so Arabic cannot reorder it', () => {
    // `2.18.5-beta` in a right-to-left paragraph comes out `beta-2.18.5`
    // — the hyphen and the digits are bidi-neutral and take the
    // paragraph's direction. Verified on a device before this was
    // written, so the isolates are pinned rather than trusted.
    const LRI = String.fromCharCode(0x2066);
    const PDI = String.fromCharCode(0x2069);
    const raw = render(null)
      .root.findAllByType(Text)
      .map((n: Node) => n.props.children)
      .filter((c): c is string => typeof c === 'string');
    expect(raw).toContain(`Mihrab ${LRI}${INSTALLED}${PDI}`);
    expect(raw).toContain(`${LRI}${INSTALLED}${PDI}`);
  });
});

describe('what the sheet calls new', () => {
  it('marks nothing when it was opened from Settings', () => {
    // `since` absent means the reader went looking for it, and every
    // release in it has already been announced to them.
    expect(texts(render(null))).not.toContain('New');
  });

  it('marks exactly the releases since the version last run', () => {
    const installedAt = CHANGELOG.findIndex(
      (r: { version: string }) => r.version === INSTALLED,
    );
    const twoBack = CHANGELOG[installedAt + 2].version;
    const shown = texts(render(twoBack));
    // Two releases newer than `twoBack` and no newer than installed.
    expect(shown.filter(s => s === 'New')).toHaveLength(2);
  });

  it('marks nothing when the reader is already on the newest they have', () => {
    expect(texts(render(INSTALLED))).not.toContain('New');
  });
});

describe('the note itself', () => {
  it('draws each bullet as its own line rather than one paragraph', () => {
    const shown = texts(render(null));
    const release = CHANGELOG.find(
      (r: { version: string }) => r.version === INSTALLED,
    );
    const bullets: string[] = release.notes.en
      .split('\n')
      .filter((l: string) => l.startsWith('•'))
      .map((l: string) => l.replace(/^•\s*/, '').trim());
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) expect(shown).toContain(bullet);
  });

  it('is dated', () => {
    const release = CHANGELOG.find(
      (r: { version: string }) => r.version === INSTALLED,
    );
    if (!release.date) return; // an untagged release shows no date, by design
    const shown = texts(render(null));
    const year = release.date.slice(0, 4);
    expect(shown.some(s => s.includes(year))).toBe(true);
  });
});
