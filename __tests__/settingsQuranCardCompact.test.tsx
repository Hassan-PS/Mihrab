/**
 * Settings → Under each verse stays one row (task #97).
 *
 * The card used to render the whole companion-text picker inline: two mode
 * segments plus every translation AND tafsir edition, grouped by language.
 * That is dozens of rows sitting in the middle of Settings for a choice
 * most people make once, and it is what made the page long enough to be
 * hard to navigate.
 *
 * What is pinned here is the shape, not the pixels: the card is a summary
 * of the current choice, the long list is behind a tap, and the list you
 * get on that tap is the same one the Quran page opens — so the two entry
 * points cannot drift apart.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

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
      accentSolid: '#0F5132',
      accentBg: '#E7F0EA',
      overlay: 'rgba(0,0,0,0.4)',
      danger: '#B91C1C',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    // Keys, not prose: this test is about which rows exist, and the edition
    // labels it checks come from the edition tables rather than from i18n.
    t: (key: string) => key,
  }),
}));

const mockSettings = {
  language: 'en',
  quranTranslationEdition: 'en.sahih',
};

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: mockSettings,
    updateSettings: jest.fn(),
  }),
}));

const mockPrefs = {
  companionMode: 'translation' as 'translation' | 'tafsir',
  tafsirEditionId: '',
  votdMode: 'translation' as 'translation' | 'tafsir',
};

jest.mock('../src/quran/quranState', () => ({
  useQuranState: () => ({ prefs: mockPrefs }),
  setQuranPrefs: jest.fn(),
}));

import { Text } from 'react-native';
import { QuranCard } from '../src/screens/settings/QuranCard';

/** Every string the card is currently putting on screen. */
function textsOf(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
    }
  };
  tree.root.findAllByType(Text).forEach(n => walk(n.props.children));
  return out;
}

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<QuranCard />);
  });
  return tree;
}

async function tapTheRow(tree: ReactTestRenderer) {
  await act(async () => {
    tree.root.findByProps({ testID: 'settings-companion-row' }).props.onPress();
  });
}

describe('the Settings companion-text card', () => {
  it('summarises the choice instead of listing every edition', async () => {
    const tree = await render();
    const texts = textsOf(tree);

    // The mode and the edition currently in force, and a way in.
    expect(texts).toContain('quran.viewToggleTranslation');
    expect(texts).toContain('Sahih International');
    expect(texts).toContain('common.change');

    // ...and nothing else from the picker. Pickthall is an English
    // translation that the inline list always drew; a tafsir edition and
    // the section headers likewise.
    expect(texts).not.toContain('Pickthall');
    expect(texts).not.toContain('quran.tafsir');
  });

  it('opens the same picker the Quran page uses', async () => {
    const tree = await render();
    expect(textsOf(tree)).not.toContain('Pickthall');

    await tapTheRow(tree);

    // The sheet is a Modal, which renders nothing while it is closed — so
    // the full list appearing IS the sheet having opened.
    const texts = textsOf(tree);
    expect(texts).toContain('Pickthall');
    expect(texts).toContain('common.done');
  });

  it('names the tafsir edition when tafsir is the active mode', async () => {
    mockPrefs.companionMode = 'tafsir';
    mockPrefs.tafsirEditionId = 'en-tafsir-maarif-ul-quran';
    try {
      const texts = textsOf(await render());
      expect(texts).toContain('quran.tafsir');
      expect(texts).toContain('Maarif-ul-Quran');
      // Still a summary: the translation list is not along for the ride.
      expect(texts).not.toContain('Pickthall');
      expect(texts).not.toContain('Sahih International');
    } finally {
      mockPrefs.companionMode = 'translation';
      mockPrefs.tafsirEditionId = '';
    }
  });
});
