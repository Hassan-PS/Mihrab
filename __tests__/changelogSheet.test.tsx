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
import { Text, View } from 'react-native';

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

// Mutable so one test can put the reader in Urdu — a right-to-left
// language with no translated notes, which is the one combination that
// makes the note's direction and the layout's disagree.
const mockReader = { language: 'en' };

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
    i18n: mockReader,
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
// From i18n/, where the reasoning for the value lives. Imported rather
// than written out: a `'right'` typed here would still match if the
// component stopped setting it, and `undefined` matches every Text that
// sets no alignment at all — which is how this read as passing once.
const { ALIGN_TO_OWN_SIDE } = require('../src/i18n/foreignText');
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

describe('a note in the other direction from the layout', () => {
  // Urdu is laid out right to left and has no translated notes, so an
  // Urdu reader gets the English note inside a mirrored tree. Laid out by
  // the tree, that puts the bullet on the right, the block against the
  // right edge and the full stop at the start of the line. This is the
  // only reader for whom any of the three corrections below fire.
  const LRI = String.fromCharCode(0x2066);
  const PDI = String.fromCharCode(0x2069);

  function flat(style: unknown): Record<string, unknown> {
    return Object.assign(
      {},
      ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(
        Boolean,
      ),
    );
  }

  afterEach(() => {
    mockReader.language = 'en';
  });

  it('is left as the tree lays it out when the two agree', () => {
    const tree = render(null);
    const rows = tree.root
      .findAllByType(View)
      .filter((v: Node) => flat(v.props.style).flexDirection === 'row-reverse');
    expect(rows).toHaveLength(0);
    const isolated = tree.root
      .findAllByType(Text)
      .filter((n: Node) =>
        Array.isArray(n.props.children) &&
        (n.props.children as unknown[]).includes(LRI),
      );
    expect(isolated).toHaveLength(0);
  });

  it('turns the bullet rows round, aligns to its own side, and isolates the text', () => {
    mockReader.language = 'ur';
    const tree = render(null);
    // An English note was used (Urdu has none)…
    const shown = texts(tree);
    const release = CHANGELOG.find(
      (r: { version: string }) => r.version === INSTALLED,
    );
    expect(shown).toContain(
      release.notes.en.split('\n')[0].replace(/^•\s*/, '').trim(),
    );
    // …every bullet row is reversed…
    const rows = tree.root
      .findAllByType(View)
      .filter((v: Node) => flat(v.props.style).flexDirection === 'row-reverse');
    expect(rows.length).toBeGreaterThan(0);
    // …the text is aligned to its own side, not the tree's "start" —
    // and that is `right`, on both platforms, for reasons the constant's
    // comment sets out (both mirror the word; both mirrors land here)…
    expect(ALIGN_TO_OWN_SIDE).toBeDefined();
    const bodies = tree.root
      .findAllByType(Text)
      .filter((n: Node) => flat(n.props.style).textAlign === ALIGN_TO_OWN_SIDE);
    expect(bodies.length).toBeGreaterThan(0);
    expect(
      tree.root
        .findAllByType(Text)
        .filter((n: Node) => flat(n.props.style).textAlign === 'left'),
    ).toHaveLength(0);
    // …and each run is wrapped in a left-to-right isolate so its
    // punctuation stays with it on Android, where writingDirection is
    // not honoured.
    for (const body of bodies) {
      const kids = (body as Node).props.children as unknown[];
      expect(kids[0]).toBe(LRI);
      expect(kids[kids.length - 1]).toBe(PDI);
    }
  });
});
