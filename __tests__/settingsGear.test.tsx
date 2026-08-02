/**
 * One gear, one place (v2.8.5).
 *
 * Settings used to be reachable two ways from Home: a tab, and a gear in
 * the header left over from a toolbar that also held Calendar and Compass.
 * Two answers to the same question, and on a phone the gear crowded the
 * wordmark until they overlapped.
 *
 * The tab, meanwhile, drew its own glyph — a ring with eight radial ticks
 * — which reads as a sun before it reads as settings. Both problems are
 * one problem: the app had two gears and showed the wrong one.
 *
 * These tests pin the outcome, because both regressions are invisible to
 * every other check in the suite: types, lint and the render tests all
 * pass just as happily with a burst in the tab bar and a duplicate gear
 * in the header.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { create } from 'react-test-renderer';
import { act } from 'react';
import { Path } from 'react-native-svg';
import { TabSettingsIcon } from '../src/navigation/tabIcons';

/** The opening of Lucide's cog outline — the shared gear's own path. */
const COG_PATH_PREFIX = 'M12.22 2h-.44';

type Renderer = ReturnType<typeof create>;

/** Render the icon the way the tab bar does and hand back its paths. */
async function renderIcon(color = '#123456', size = 24) {
  let tree!: Renderer;
  await act(async () => {
    tree = create(<TabSettingsIcon color={color} size={size} />);
  });
  const ds = tree.root.findAllByType(Path).map(n => String(n.props.d ?? ''));
  return { tree, ds };
}

describe('the Settings tab icon', () => {
  it('draws the same cog the header used to', async () => {
    const { tree, ds } = await renderIcon();
    expect(ds.some(d => d.startsWith(COG_PATH_PREFIX))).toBe(true);
    tree.unmount();
  });

  it('is not the sun-burst it used to be', async () => {
    const { tree, ds } = await renderIcon();
    // The burst was eight radial ticks in one path command.
    expect(ds.some(d => d.includes('M12 2.8v2.1M12 19.1v2.1'))).toBe(false);
    tree.unmount();
  });

  it('takes the tint the tab bar hands it', async () => {
    const { tree } = await renderIcon('#123456', 31);
    const cog = tree.root
      .findAllByType(Path)
      .find(n => String(n.props.d ?? '').startsWith(COG_PATH_PREFIX));
    expect(cog?.props.stroke).toBe('#123456');
    tree.unmount();
  });
});

describe('the Home header', () => {
  // Read as source rather than rendered: LocationChip pulls in the settings
  // context, the palette and the location store, and mocking all three to
  // assert the ABSENCE of a button would test the mocks. What must not come
  // back is the import.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'navigation', 'HomeHeaderControls.tsx'),
    'utf-8',
  );

  it('no longer renders the toolbar that held the gear', () => {
    expect(source).not.toMatch(/<HeaderToolbarIcons/);
  });

  it('still carries the location chip — the one thing only it can say', () => {
    expect(source).toMatch(/<LocationChip/);
  });
});
