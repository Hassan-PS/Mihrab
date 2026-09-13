/**
 * A sheet may not wrap its own content in something that claims touches.
 *
 * The changelog would not scroll on a phone, and every check said it did.
 * `adb shell input swipe … 300` scrolled it on an emulator, on a tablet
 * layout and on the reporter's own Pixel; the same swipe over 1800 ms
 * never moved it once. A thumb is the slow one.
 *
 * WHY THE SPEED MATTERS. Both sheets wrapped their card in a Pressable
 * whose only job was to swallow taps, so that touching the sheet did not
 * dismiss it. A Pressable claims the JS touch responder on touch-down,
 * and RN on Android answers a claim by telling the native hierarchy to
 * stop intercepting — which is exactly what the native ScrollView inside
 * needs to do to start scrolling. The claim is a round trip through the
 * JS thread, so it is a race: a fling gets to the scroll view first and
 * scrolls; a finger at human speed loses, and the list sits still.
 *
 * The fix is to put the dismiss target BEHIND the card rather than
 * around it — absolutely positioned, with the card drawn over it. Taps
 * outside land on it, taps on the card land on a plain View with no
 * handler, and nothing between the sheet and its scroll view wants the
 * responder.
 *
 * This test is the one that would have caught it, because it asks about
 * the mechanism rather than the effect: no test renderer can measure a
 * gesture that loses a race on a device.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';

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
    t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k),
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: { Consumer: ({ children }: never) => children },
}));

jest.mock('../src/responsive/breakpoints', () => ({
  useBreakpoint: () => 'compact',
}));

const { ResponsiveModal } = require('../src/responsive/ResponsiveModal');
const { ResetScopePicker } = require('../src/components/ResetScopePicker');

type Instance = {
  type: unknown;
  props: Record<string, unknown>;
  parent: Instance | null;
};

/**
 * The prop a claimed responder shows up as.
 *
 * Pressability spreads its handlers onto the host view it wraps, so a
 * Pressable anywhere in the tree is a host node carrying this. Asking
 * for the prop rather than for `Pressable` also catches a hand-rolled
 * `onStartShouldSetResponder={() => true}`, which fails the same way.
 */
const CLAIMS_TOUCH = 'onStartShouldSetResponder';

/** Every ancestor of `node`, innermost first. */
function ancestors(node: Instance): Instance[] {
  const out: Instance[] = [];
  for (let p = node.parent; p; p = p.parent) out.push(p);
  return out;
}

function describeNode(n: Instance): string {
  const t = typeof n.type === 'string' ? n.type : 'component';
  const label = n.props.accessibilityLabel ?? n.props.testID ?? '';
  return label ? `${t}[${String(label)}]` : t;
}

describe('nothing between a sheet and its scroll view claims the touch', () => {
  let tree: ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));

  it('ResponsiveModal', () => {
    act(() => {
      tree = create(
        <ResponsiveModal visible onClose={() => {}} closeLabel="Close">
          <ScrollView testID="content">
            <Text>a long list</Text>
          </ScrollView>
        </ResponsiveModal>,
      );
    });
    const content = tree.root.findByProps({
      testID: 'content',
    }) as unknown as Instance;
    const greedy = ancestors(content).filter(n => n.props[CLAIMS_TOUCH]);
    expect(greedy.map(describeNode)).toEqual([]);
  });

  it('ResetScopePicker', () => {
    act(() => {
      tree = create(
        <ResetScopePicker
          visible
          plans={[{ scope: 'day', prayers: 3, days: 1 }]}
          dayLabel="Sunday"
          onPick={() => {}}
          onCancel={() => {}}
        />,
      );
    });
    const list = tree.root.findByType(ScrollView) as unknown as Instance;
    const greedy = ancestors(list).filter(n => n.props[CLAIMS_TOUCH]);
    expect(greedy.map(describeNode)).toEqual([]);
  });
});

describe('the way out is still there', () => {
  let tree: ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));

  it('the backdrop dismisses, and holds nothing', () => {
    const onClose = jest.fn();
    act(() => {
      tree = create(
        <ResponsiveModal visible onClose={onClose} closeLabel="Close">
          <Text testID="content">the card</Text>
        </ResponsiveModal>,
      );
    });
    const backdrop = tree.root.findByProps({
      accessibilityLabel: 'Close',
    }) as unknown as Instance & { props: { onPress?: () => void } };

    // Behind the card, so it cannot be in the way of a drag over it.
    const style = Array.isArray(backdrop.props.style)
      ? Object.assign({}, ...backdrop.props.style.flat(Infinity))
      : backdrop.props.style;
    expect(style).toMatchObject({ position: 'absolute' });

    // And empty: a dismiss target with children is a dismiss target
    // wrapped around the content, which is the bug.
    expect(backdrop.props.children ?? null).toBeNull();

    act(() => backdrop.props.onPress?.());
    expect(onClose).toHaveBeenCalled();
  });
});
