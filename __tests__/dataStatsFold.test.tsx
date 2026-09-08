/**
 * The data panel folds away, and remembers that it is folded.
 *
 * It is the longest card on the Today screen — a source row, the
 * device's cache, then five rows and a note for each of two prepared
 * datasets — and it is a diagnostics card: read closely on the visit
 * where something looks wrong, glanced at every other time. So it opens
 * folded, one row, and that row still carries the server status dot.
 *
 * The choice is a SETTING and not screen state. "Do I want to see this"
 * does not change between one visit to Today and the next, and the panel
 * is already behind a flag somebody had to unlock deliberately.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance } from 'react-test-renderer';

let mockSettings: Record<string, unknown> = {};
const mockUpdate = jest.fn((patch: Record<string, unknown>) => {
  mockSettings = { ...mockSettings, ...patch };
});

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdate,
  }),
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
      bg: '#fff', card: '#eee', text: '#000', muted: '#666',
      accent: '#0a0', accentBg: '#efe', accentSolid: '#0a0', border: '#ddd',
      danger: '#c00',
    },
  }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  // The panel polls two servers on focus; this suite is about the fold.
  useFocusEffect: () => {},
}));

import { DataStatsPanel } from '../src/screens/home/DataStatsPanel';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import { loadSettings, saveSettings } from '../src/settings/storage';

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
    tree = create(<DataStatsPanel />);
  });
  return tree;
}

const header = (tree: ReturnType<typeof create>) =>
  tree.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(n => n.props.accessibilityLabel === 'dataStats.title');

beforeEach(() => {
  mockSettings = { ...DEFAULT_SETTINGS, showDataStats: true };
  mockUpdate.mockClear();
});

describe('folded', () => {
  it('is how it starts', () => {
    expect(DEFAULT_SETTINGS.dataStatsExpanded).toBe(false);
  });

  it('shows the title and the status, and nothing else', () => {
    const shown = texts(render().root);
    expect(shown).toContain('dataStats.title');
    // The row that names where today's times came from is the first
    // thing under the header, and the first thing to go.
    expect(shown).not.toContain('dataStats.source');
    expect(shown).not.toContain('dataStats.daysStored');
    expect(shown).not.toContain('dataStats.serverCoverage');
  });

  it('keeps the one fact worth a glance', () => {
    // A folded diagnostics panel that says nothing is a folded panel
    // nobody unfolds. The dot and its label stay.
    const shown = texts(render().root);
    expect(shown.some(s => s.startsWith('dataStats.server'))).toBe(true);
  });

  it('tells a screen reader what it is', () => {
    expect(header(render())?.props.accessibilityState).toEqual({
      expanded: false,
    });
  });
});

describe('unfolded', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS, showDataStats: true, dataStatsExpanded: true };
  });

  it('shows everything it always did', () => {
    const shown = texts(render().root);
    for (const key of [
      'dataStats.title',
      'dataStats.source',
      'dataStats.daysStored',
      'dataStats.serverCoverage',
      'dataStats.serverRun',
      'dataStats.nextServerRun',
      'dataStats.nextCheck',
    ]) {
      expect(shown).toContain(key);
    }
  });

  it('lists both prepared datasets, not one', () => {
    const shown = texts(render().root);
    // These carry defaultValues, which the stub `t` returns.
    expect(shown).toContain('Sweden · Islamiska Förbundet');
    expect(shown).toContain('Morocco · Habous');
  });
});

describe('the choice is kept', () => {
  it('writes the setting rather than holding it on screen', () => {
    // Screen state would forget between one visit to Today and the next,
    // which is the whole of what "save the state" asks for.
    const tree = render();
    act(() => {
      header(tree)!.props.onPress();
    });
    expect(mockUpdate).toHaveBeenCalledWith({ dataStatsExpanded: true });
  });

  it('folds again from unfolded', () => {
    mockSettings = { ...DEFAULT_SETTINGS, showDataStats: true, dataStatsExpanded: true };
    const tree = render();
    act(() => {
      header(tree)!.props.onPress();
    });
    expect(mockUpdate).toHaveBeenCalledWith({ dataStatsExpanded: false });
  });

  it('survives a restart', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, dataStatsExpanded: true });
    expect((await loadSettings()).dataStatsExpanded).toBe(true);
  });

  it('comes back folded from a blob that says anything else', async () => {
    // Every boolean that draws UI is re-validated on load; a truthy
    // non-boolean here would unfold a diagnostics panel on the Today
    // screen of somebody who never asked for one.
    await saveSettings({
      ...DEFAULT_SETTINGS,
      dataStatsExpanded: 'yes' as unknown as boolean,
    });
    expect((await loadSettings()).dataStatsExpanded).toBe(false);
  });
});
