/**
 * Guard rails for the 2026 redesign (docs/design/redesign-plan.md §5,
 * Phase 0): one level of containment, and every tab reserving the floating
 * bar's footprint.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import * as React from 'react';
import { act } from 'react';
import { Text } from 'react-native';
import { create } from 'react-test-renderer';
import { Card, warnIfNested } from '../src/components/ui/Card';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: { bg: '#FAF7F2', card: '#FFFFFF', border: '#E5E1DA' },
    isDark: false,
  }),
}));

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('a Card inside a Card warns, once, by name', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('is quiet for a single card and for a subtle one nested', () => {
    act(() => {
      create(
        <Card debugName="outer">
          <Card variant="subtle" debugName="inner-subtle">
            <Text>fine</Text>
          </Card>
        </Card>,
      );
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns for a default card nested in another', () => {
    act(() => {
      create(
        <Card debugName="outer">
          <Card debugName="nested-default">
            <Text>no</Text>
          </Card>
        </Card>,
      );
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"nested-default"');
    expect(warn.mock.calls[0][0]).toContain('inside another Card');
  });

  it('is pure about depth', () => {
    expect(warnIfNested(0, 'default', 'x')).toBe(false);
    expect(warnIfNested(2, 'subtle', 'y')).toBe(false);
    expect(warnIfNested(1, 'default', 'z')).toBe(true);
  });
});

describe('every tab screen reserves the floating bar', () => {
  // The six tab roots, as registered in MainTabs.
  const tabs = read('src/navigation/MainTabs.tsx');
  const components = [...tabs.matchAll(/component=\{(\w+)\}/g)].map(m => m[1]);

  it('registers six tabs', () => {
    expect(components).toHaveLength(6);
  });

  it.each(components)('%s calls useTabBarInset', name => {
    const importLine = new RegExp(`import \\{ ${name} \\} from '([^']+)'`).exec(
      tabs,
    );
    expect(importLine).not.toBeNull();
    const file = join('src/navigation', importLine![1] + '.tsx');
    const src = read(file);
    // Directly, or via the shared settings page shell.
    const viaShell = /SettingsPage/.test(src) && /useTabBarInset/.test(read('src/screens/settings/SettingsPage.tsx'));
    expect(/useTabBarInset\(/.test(src) || viaShell).toBe(true);
  });
});
