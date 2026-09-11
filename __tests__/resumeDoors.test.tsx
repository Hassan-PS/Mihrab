/**
 * The two doors back into the Qur'an — issue #41.
 *
 * Home's card and the Qur'an tab draw these rows from one component and
 * one selector, so what is pinned here holds on both: a door per trail,
 * both when both, each leading where it says, and the ayah reference set
 * in its own text so a long surah name can never push it off the row —
 * the reporter's second complaint.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (k: string, d?: unknown) => {
      const opts = d as { defaultValue?: string } | string | undefined;
      const tpl =
        typeof opts === 'string' ? opts : (opts?.defaultValue ?? k);
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

import { ResumeDoors } from '../src/quran/ResumeDoors';
import type { QuranCardState } from '../src/quran/quranCardState';

const texts = (root: ReactTestInstance): string[] =>
  root
    .findAllByType('Text' as never, { deep: true })
    .flatMap(n =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
        .map(String),
    );

/** One pressable node per button — a Pressable renders as a few layers. */
const buttons = (root: ReactTestInstance) => {
  const seen = new Set<string>();
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(n => typeof n.props.onPress === 'function')
    .filter(n => {
      const label = String(n.props.accessibilityLabel);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
};

const khatmah: NonNullable<QuranCardState['khatmah']> = {
  dayNumber: 7,
  targetDays: 30,
  done: false,
  pagesLeftToday: 5,
  daysToGo: 23,
  progress: 0.2,
  target: { page: 142, surah: 6, ayah: 111 },
};

const reading = {
  surah: 2,
  ayah: 19,
  page: 4,
  mode: 'withTranslation' as const,
  updatedAt: 1,
};

function render(state: QuranCardState, showStart = false) {
  const onOpenKhatmah = jest.fn();
  const onOpenReading = jest.fn();
  const onOpenQuran = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ResumeDoors
        state={state}
        onOpenKhatmah={onOpenKhatmah}
        onOpenReading={onOpenReading}
        onOpenQuran={onOpenQuran}
        showStart={showStart}
      />,
    );
  });
  return { tree, onOpenKhatmah, onOpenReading, onOpenQuran };
}

describe('the doors', () => {
  it('are both drawn when the reader keeps both trails', () => {
    const { tree, onOpenKhatmah, onOpenReading } = render({ khatmah, reading });
    const shown = texts(tree.root);
    expect(shown).toContain('Continue khatmah');
    expect(shown).toContain('Continue reading');
    const doors = buttons(tree.root);
    expect(doors).toHaveLength(2);
    act(() => doors[0].props.onPress());
    expect(onOpenKhatmah).toHaveBeenCalledWith(khatmah.target);
    act(() => doors[1].props.onPress());
    expect(onOpenReading).toHaveBeenCalledWith(reading);
  });

  it('is one door when there is one trail', () => {
    expect(texts(render({ khatmah, reading: null }).tree.root)).not.toContain('Continue reading');
    const only = render({ khatmah: null, reading });
    expect(texts(only.tree.root)).toContain('Continue reading');
    expect(texts(only.tree.root)).not.toContain('Continue khatmah');
    expect(buttons(only.tree.root)).toHaveLength(1);
  });

  it('says the day is done, and still opens on the next page', () => {
    const { tree, onOpenKhatmah } = render({
      khatmah: { ...khatmah, done: true, pagesLeftToday: 0 },
      reading: null,
    });
    expect(texts(tree.root)).toContain("Today's reading done");
    expect(texts(tree.root).some(s => s.includes('23 days to go'))).toBe(true);
    act(() => buttons(tree.root)[0].props.onPress());
    expect(onOpenKhatmah).toHaveBeenCalled();
  });

  it('sets the reference in its own text, so the name shrinks and the number never does', () => {
    const { tree } = render({ khatmah: null, reading });
    const shown = texts(tree.root);
    // The number is a node of its own — not the tail of the name's string,
    // where an ellipsis on a long name used to land on it.
    expect(shown).toContain(' · 2:19');
    expect(shown.some(s => /Baqara/i.test(s))).toBe(true);
    const nameNode = tree.root
      .findAllByType('Text' as never, { deep: true })
      .find(n => /Baqara/i.test(String(n.props.children)));
    expect(nameNode?.props.numberOfLines).toBe(1);
    const flat = Array.isArray(nameNode?.props.style)
      ? Object.assign({}, ...nameNode!.props.style.flat())
      : nameNode?.props.style;
    expect(flat.flexShrink).toBe(1);
  });

  it('stands the two side by side on Today, and a lone door full width', () => {
    // Two rows pushed the card under the tab bar; two columns keep the
    // card as tall with two doors as with one.
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ResumeDoors
          state={{ khatmah, reading }}
          onOpenKhatmah={() => {}}
          onOpenReading={() => {}}
          onOpenQuran={() => {}}
          layout="columns"
        />,
      );
    });
    const rows = tree.root.findAll(
      n =>
        typeof n.type === 'string' &&
        Array.isArray(n.props.style) === false &&
        n.props.style?.flexDirection === 'row' &&
        n.props.style?.alignItems === 'stretch',
    );
    expect(rows).toHaveLength(1);
    expect(buttons(tree.root)).toHaveLength(2);
    // The page numbers give way to the width; the reference does not.
    expect(texts(tree.root).some(s => /^page /.test(s))).toBe(false);
    expect(texts(tree.root)).toContain(' · 2:19');
    // One door is never a column.
    act(() => {
      tree = create(
        <ResumeDoors
          state={{ khatmah: null, reading }}
          onOpenKhatmah={() => {}}
          onOpenReading={() => {}}
          onOpenQuran={() => {}}
          layout="columns"
        />,
      );
    });
    expect(texts(tree.root).some(s => /^page /.test(s))).toBe(true);
  });

  it('is the way in when there is nothing to continue and the caller wants one', () => {
    const { tree, onOpenQuran } = render({ khatmah: null, reading: null }, true);
    expect(texts(tree.root)).toContain('Start reading');
    expect(texts(tree.root)).toContain('Start a khatmah');
    act(() => buttons(tree.root)[0].props.onPress());
    expect(onOpenQuran).toHaveBeenCalled();
    // The Qur'an tab draws nothing: it is the way in.
    expect(render({ khatmah: null, reading: null }).tree.toJSON()).toBeNull();
  });
});
