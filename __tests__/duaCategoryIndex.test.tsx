/**
 * Nineteen categories you can see — issue #33.
 *
 * "Currently, the Duas categories use horizontal scrolling, whereas nearly
 * all other views utilize vertical scrolling. Converting Duas categories to
 * a vertical list would allow users to scan all categories at a glance."
 *
 * The strip showed about four of the nineteen at a time, on the one screen
 * in the app that scrolled sideways — so fifteen of them existed only for a
 * reader who thought to swipe a row that gives no sign there is more of it.
 *
 * The screen opens on an index now, and a category opens from it. What
 * these pin is that the index is complete, that a category still shows its
 * own duas, and that back closes the category before it leaves the tab —
 * which is what back means everywhere else in this app.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';

let mockIntercept: (() => boolean) | undefined;

jest.mock('../src/navigation/useAndroidSubScreenBack', () => ({
  useAndroidSubScreenBack: (
    _defer: unknown,
    intercept?: () => boolean,
  ) => {
    mockIntercept = intercept;
  },
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (k: string, d?: unknown) =>
      typeof d === 'string' ? d : ((d as { defaultValue?: string })?.defaultValue ?? k),
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
      accentBg: '#efe',
      border: '#ddd',
    },
  }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useScrollToTop: () => {},
  // The header's back control asks for the navigator; none is mounted here.
  useNavigation: () => ({ navigate: () => {} }),
}));

jest.mock('../src/navigation/tabBarInset', () => ({ useTabBarInset: () => 0 }));
// No title bar on a tab: the page clears the status bar itself, and the
// number it clears it by comes from a hook with no provider in this tree.
jest.mock('../src/navigation/useTabPageTop', () => ({ useTabPageTop: () => 12 }));
jest.mock('../src/navigation/tabBarVisibility', () => ({
  useTabBarScroll: () => ({}),
}));

import { DuasScreen } from '../src/screens/DuasScreen';
import {
  DUA_CATEGORIES,
  DUA_SECTIONS,
  duasByCategory,
  sectionedCategories,
} from '../src/duas/duas';

/** Every string rendered anywhere in the tree. */
const texts = (root: ReactTestInstance): string[] =>
  root
    .findAllByType('Text' as never, { deep: true })
    .flatMap(n =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
        .map(String),
    );

function render() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<DuasScreen />);
  });
  return tree;
}

beforeEach(() => {
  mockIntercept = undefined;
});

describe('the screen opens on every category', () => {
  it('lists all nineteen, not the four a strip could show', () => {
    const tree = render();
    const shown = texts(tree.root);
    for (const c of DUA_CATEGORIES) {
      expect(shown).toContain(`duas.cat.${c}`);
    }
    expect(DUA_CATEGORIES.length).toBeGreaterThan(15);
  });

  it('says how many duas a category holds', () => {
    // A row that only names a category says nothing about whether it is
    // worth opening.
    const tree = render();
    const shown = texts(tree.root);
    expect(shown).toContain(String(duasByCategory(DUA_CATEGORIES[0]).length));
  });

  it('shows no dua until one is chosen', () => {
    const tree = render();
    const shown = texts(tree.root);
    const first = duasByCategory('morning')[0];
    expect(shown).not.toContain(first.arabic);
  });
});

describe('a category opens, and back closes it', () => {
  const openMorning = (tree: ReturnType<typeof create>) => {
    const row = tree.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(n => n.props.accessibilityLabel === 'duas.cat.morning');
    expect(row).toBeTruthy();
    act(() => {
      row!.props.onPress();
    });
  };

  it('shows that category’s duas', () => {
    const tree = render();
    openMorning(tree);
    const shown = texts(tree.root);
    expect(shown).toContain(duasByCategory('morning')[0].arabic);
    // And not the index it came from.
    expect(shown).not.toContain('duas.cat.travel');
  });

  it('offers the way back at the top of the page, and it works', () => {
    // There is no title bar on a tab any more, so the way back is the
    // page's own first row: the arrow up to the index, beside the name of
    // the category. On the index there is no such row — the tab under the
    // thumb already says "Duas".
    const tree = render();
    expect(
      texts(tree.root).some(s => s === 'All duas' || s === 'duas.allCategories'),
    ).toBe(false);
    openMorning(tree);
    const back = tree.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(n => n.props.accessibilityLabel === 'All duas');
    expect(back).toBeTruthy();
    act(() => {
      back!.props.onPress();
    });
    expect(texts(tree.root)).toContain('duas.cat.travel');
    expect(
      tree.root
        .findAllByProps({ accessibilityRole: 'button' })
        .some(n => n.props.accessibilityLabel === 'All duas'),
    ).toBe(false);
  });

  it('takes the Android back press rather than leaving the tab', () => {
    // Deferring would hand the press to the system, and on a tab root the
    // system leaves the app — from a screen the reader navigated into.
    const tree = render();
    expect(typeof mockIntercept).toBe('function');
    // On the index there is nothing to close: the press is not ours.
    expect(mockIntercept!()).toBe(false);
    openMorning(tree);
    let handled = false;
    act(() => {
      handled = mockIntercept!();
    });
    expect(handled).toBe(true);
    expect(texts(tree.root)).toContain('duas.cat.travel');
  });
});

describe('the index is grouped, and the grouping is exhaustive', () => {
  it('names every category exactly once, and no other', () => {
    // The groups are the only way into a category. One dropped from this
    // table falls off the screen entirely, and nothing else would say so.
    expect([...sectionedCategories()].sort()).toEqual(
      [...DUA_CATEGORIES].sort(),
    );
    expect(sectionedCategories()).toHaveLength(DUA_CATEGORIES.length);
  });

  it('keeps each group in the order the catalogue is in', () => {
    // DUA_CATEGORIES is ordered by where each sits in a day; a group
    // that reshuffles its members loses that for no gain.
    for (const section of DUA_SECTIONS) {
      const rank = section.categories.map(c => DUA_CATEGORIES.indexOf(c));
      expect(rank).toEqual([...rank].sort((a, b) => a - b));
    }
  });

  it('draws a heading for every group', () => {
    const shown = texts(render().root);
    for (const section of DUA_SECTIONS) {
      expect(shown).toContain(`duas.section.${section.id}`);
    }
  });

  it('still reaches every category from the index', () => {
    // The redesign is a layout change; what it must not become is a
    // layout that hides one.
    const tree = render();
    const labels = tree.root
      .findAllByProps({ accessibilityRole: 'button' })
      .map(n => n.props.accessibilityLabel);
    for (const c of DUA_CATEGORIES) expect(labels).toContain(`duas.cat.${c}`);
  });
});

describe('the page says which category is open', () => {
  const openMorning = (tree: ReturnType<typeof create>) => {
    const row = tree.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(x => x.props.accessibilityLabel === 'duas.cat.morning');
    act(() => {
      row!.props.onPress();
    });
  };

  it('names no page on the index', () => {
    // The tab bar names it; a "Duas" over a list of duas would say it twice.
    const tree = render();
    expect(texts(tree.root)).not.toContain('nav.duas');
  });

  it('names the category once one is open', () => {
    // The fault this replaces: the title came from the tab and stayed
    // "Duas" for all twenty-one categories inside it.
    const tree = render();
    openMorning(tree);
    const shown = texts(tree.root);
    // Once as the page's title; the index row that said it is gone.
    expect(shown.filter(s => s === 'duas.cat.morning')).toHaveLength(1);
  });

  it('drops the name when the category closes', () => {
    const tree = render();
    openMorning(tree);
    act(() => {
      mockIntercept?.();
    });
    // Back on the index, the name is the row's again — not a title.
    expect(
      tree.root
        .findAllByProps({ accessibilityRole: 'button' })
        .some(x => x.props.accessibilityLabel === 'duas.cat.morning'),
    ).toBe(true);
  });

  it('renders without a navigator at all', () => {
    // These screens are rendered bare here; nothing in the page asks the
    // navigator for a header any more.
    expect(() => render()).not.toThrow();
  });
});
