/**
 * Sending a dua or a tafsir passage out of the app — issue #24.
 *
 * "There are times when we may want to share the text with a friend or
 * family member, or simply send it to another app." An ayah could already
 * be sent as text; a dua and a tafsir passage could not.
 *
 * What is held here is mostly one rule. CLAUDE.md §4 says religious
 * content must be sourced and attributed, and that rule is easy to keep on
 * a screen — the source line is drawn beside the text and nobody has to
 * remember it. It is easy to LOSE in a share body, which is assembled by
 * hand and then travels without the app around it. A dua pasted into a
 * family group with no source is a claim about the religion with nothing
 * behind it, and the person who receives it has no way back to where it
 * came from.
 */
import * as React from 'react';
import { act } from 'react';
import { create } from 'react-test-renderer';
import { Share } from 'react-native';
import fs from 'fs';
import path from 'path';
import {
  ayahShareText,
  duaShareText,
  tafsirShareText,
} from '../src/share/shareText';

const DUA = {
  title: 'Ayat al-Kursi',
  arabic: 'ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ',
  transliteration: 'Allāhu lā ilāha illā huwa',
  translation: 'Allah — there is no god but He',
  source: 'Quran 2:255 — narrated by al-Hakim and Ibn Hibban',
};

describe('attribution is not optional', () => {
  it('refuses to build a dua body with no source', () => {
    expect(() => duaShareText({ ...DUA, source: '' })).toThrow(/unattributed/);
    // Whitespace is not a source either.
    expect(() => duaShareText({ ...DUA, source: '   ' })).toThrow();
  });

  it('refuses an ayah with no reference', () => {
    expect(() =>
      ayahShareText({ arabic: 'ا', translation: 'a', reference: '' }),
    ).toThrow(/unattributed/);
  });

  it('refuses a tafsir passage crediting nobody', () => {
    // Both halves are required by construction: the edition alone does not
    // say which ayah is explained, and the ayah alone credits a classical
    // commentary to no one.
    expect(() =>
      tafsirShareText({ text: 'x', edition: '', reference: '' }),
    ).toThrow(/unattributed/);
  });
});

describe('what a dua looks like when it arrives', () => {
  const body = duaShareText(DUA);

  it('carries the title, the Arabic, the pronunciation and the meaning', () => {
    for (const part of [
      DUA.title,
      DUA.arabic,
      DUA.transliteration,
      DUA.translation,
    ]) {
      expect(body).toContain(part);
    }
  });

  it('takes the transliteration with it', () => {
    // It is an aid behind a toggle on screen, not part of the text. But
    // the point of sending a dua is that the recipient can say it, and
    // someone who does not read Arabic cannot say it from the Arabic.
    expect(body).toContain(DUA.transliteration);
  });

  it('ends with the source, behind an em dash', () => {
    expect(body.trimEnd().endsWith(`— ${DUA.source}`)).toBe(true);
  });

  it('drops an empty field rather than leaving a hole', () => {
    const noTranslit = duaShareText({ ...DUA, transliteration: '' });
    expect(noTranslit).not.toMatch(/\n\n\n/);
    expect(noTranslit).toContain(DUA.arabic);
  });
});

describe('what a tafsir passage looks like when it arrives', () => {
  const body = tafsirShareText({
    text: 'The Throne Verse is the greatest verse in the Quran.',
    edition: 'Ibn Kathir (abridged)',
    reference: 'Al-Baqarah 2:255',
  });

  it('names the edition and the ayah it explains', () => {
    expect(body).toContain('Ibn Kathir (abridged)');
    expect(body).toContain('Al-Baqarah 2:255');
  });

  it('puts both in one attribution line at the end', () => {
    expect(
      body.trimEnd().endsWith('— Ibn Kathir (abridged), Al-Baqarah 2:255'),
    ).toBe(true);
  });
});

describe('the ayah body the refactor inherited', () => {
  // The ayah share already existed and its format is what the other two
  // were written to match. It must not have changed shape on the way into
  // the shared builder.
  it('is still arabic, translation, then the reference', () => {
    expect(
      ayahShareText({
        arabic: 'ا',
        translation: 'a translation',
        reference: 'Al-Baqarah 2:255',
      }),
    ).toBe('ا\n\na translation\n\n— Al-Baqarah 2:255');
  });
});

// ── the screens that call them ──────────────────────────────────────────

jest.mock('../src/navigation/useTabPageTop', () => ({ useTabPageTop: () => 12 }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      bg: '#fff',
      card: '#eee',
      text: '#111',
      muted: '#666',
      border: '#ddd',
      accent: '#0F5132',
      accentSolid: '#0F5132',
      accentBg: '#E7F0EA',
    },
  }),
}));
jest.mock('../src/navigation/useAndroidSubScreenBack', () => ({
  useAndroidSubScreenBack: () => {},
}));
// A deterministic `t`: the bundled English falls through, so the body
// under test is the one an English reader would actually send.
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useScrollToTop: () => {},
  // The arrow at the top of an open category reads the navigator.
  useNavigation: () => ({ navigate: () => {} }),
}));
jest.mock('../src/navigation/tabBarInset', () => ({ useTabBarInset: () => 0 }));
jest.mock('../src/navigation/tabBarVisibility', () => ({
  useTabBarScroll: () => ({}),
  hideTabBar: () => {},
  showTabBar: () => {},
}));

import { DuasScreen } from '../src/screens/DuasScreen';
import { DUAS } from '../src/duas/duas';

describe('the dua card’s share control', () => {
  /**
   * Opening the card's share now ASKS what to send — issue #47 — in the
   * app's own sheet rather than a platform dialog, because on Android
   * the dialog looked like another app had interrupted this one. So the
   * control puts a question up, and the answer is what builds a body.
   */
  const openCategory = (tree: ReturnType<typeof create>) => {
    // The screen opens on the category index now (#33), so a dua card
    // exists only once a category has been opened. Any category will do;
    // what is under test is the share control on the card.
    act(() => {
      tree.root
        .findAll(
          n =>
            n.props?.accessibilityLabel === 'duas.cat.morning' &&
            typeof n.props?.onPress === 'function',
        )[0]
        .props.onPress();
    });
  };

  const openShare = (tree: ReturnType<typeof create>) => {
    // By label and handler, not by `findAllByType(Pressable)`: RN's
    // Pressable renders through a wrapper, so the exported component is
    // not the type the tree carries. The node that owns the press is the
    // one with an `onPress`.
    const buttons = tree.root.findAll(
      n =>
        String(n.props?.accessibilityLabel ?? '').startsWith('Share ') &&
        typeof n.props?.onPress === 'function',
    );
    expect(buttons.length).toBeGreaterThan(0);
    act(() => {
      buttons[0].props.onPress();
    });
  };

  /** Every string drawn anywhere in the tree. */
  const texts = (tree: ReturnType<typeof create>) =>
    tree.root
      .findAll(n => typeof n.type === 'string')
      .flatMap(n => {
        const c = n.props?.children;
        return typeof c === 'string' ? [c] : [];
      });

  /** The option row with this title, in the sheet the share opened. */
  const rowNamed = (tree: ReturnType<typeof create>, title: string) => {
    const label = tree.root
      .findAll(n => typeof n.type === 'string')
      .find(n => n.props?.children === title);
    expect(label).toBeTruthy();
    // The row is the nearest ancestor that takes the press.
    for (let p = label!.parent; p; p = p.parent) {
      if (typeof p.props?.onPress === 'function') return p;
    }
    throw new Error(`no pressable row around "${title}"`);
  };

  it('asks in the app’s own sheet, and sends nothing until answered', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    } as never);
    try {
      let tree!: ReturnType<typeof create>;
      act(() => {
        tree = create(<DuasScreen />);
      });
      openCategory(tree);
      openShare(tree);
      // The three ways to answer it, and no share yet.
      for (const key of [
        'duas.shareArabicOnly',
        'duas.shareTranslationOnly',
        'duas.shareBoth',
      ]) {
        expect(rowNamed(tree, key)).toBeTruthy();
      }
      expect(spy).not.toHaveBeenCalled();
      // And it is a sheet of this app's, not a platform dialog: the
      // question is in the tree, where a test can see it.
      expect(texts(tree)).toContain('duas.shareWhat');
    } finally {
      spy.mockRestore();
    }
  });

  it('sends what was asked for, with the dua’s own source in every one', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    } as never);
    try {
      let tree!: ReturnType<typeof create>;
      act(() => {
        tree = create(<DuasScreen />);
      });
      openCategory(tree);

      const bodyFor = async (title: string) => {
        spy.mockClear();
        openShare(tree);
        await act(async () => {
          rowNamed(tree, title).props.onPress();
        });
        expect(spy).toHaveBeenCalledTimes(1);
        return (spy.mock.calls[0][0] as { message: string }).message;
      };

      const both = await bodyFor('duas.shareBoth');
      // Whichever dua the first card is, its own citation has to be in
      // there — the field the data model marks "NEVER omit".
      const dua = DUAS.find(d => both.includes(d.arabic));
      expect(dua).toBeDefined();
      expect(both).toContain(dua!.source);
      expect(both).toContain(dua!.transliteration);

      const arabicOnly = await bodyFor('duas.shareArabicOnly');
      expect(arabicOnly).toContain(dua!.arabic);
      expect(arabicOnly).toContain(dua!.source);
      // The point of the option: the meaning is not tacked on.
      expect(arabicOnly).not.toContain(dua!.translation);
      expect(arabicOnly).not.toContain(dua!.transliteration);

      const translationOnly = await bodyFor('duas.shareTranslationOnly');
      expect(translationOnly).toContain(dua!.translation);
      expect(translationOnly).toContain(dua!.source);
      expect(translationOnly).not.toContain(dua!.arabic);
    } finally {
      spy.mockRestore();
    }
  });

  it('closes the question before the system sheet opens', async () => {
    // Two sheets stacked is one too many — the same rule the Log's
    // options sheet follows before it opens a confirmation.
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    } as never);
    try {
      let tree!: ReturnType<typeof create>;
      act(() => {
        tree = create(<DuasScreen />);
      });
      openCategory(tree);
      openShare(tree);
      await act(async () => {
        rowNamed(tree, 'duas.shareArabicOnly').props.onPress();
      });
      expect(texts(tree)).not.toContain('duas.shareWhat');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the tafsir share control', () => {
  const sheet = fs.readFileSync(
    path.join(__dirname, '..', 'src/quran/mushaf/AyahActionSheet.tsx'),
    'utf8',
  );

  it('shares the passage, credited to the edition on screen', () => {
    const fn = sheet.slice(sheet.indexOf('const shareTafsir'));
    expect(fn).toContain('tafsirShareText({');
    // The edition the reader actually has selected, not the default —
    // the chips above the passage can change it.
    expect(fn.slice(0, fn.indexOf('};'))).toContain(
      'edition: tafsirEdition.label',
    );
    expect(fn.slice(0, fn.indexOf('};'))).toContain('reference,');
  });

  it('is its own action, not a third format of the ayah share', () => {
    // The ayah share is deliberately "one action with two FORMATS".
    // Tafsir is not another format of the ayah; it is a different text by
    // a different author that happens to be shown underneath.
    const share = sheet.slice(
      sheet.indexOf('const share = () =>'),
      sheet.indexOf('const shareText = async'),
    );
    expect(share).not.toContain('tafsir');
  });
});
