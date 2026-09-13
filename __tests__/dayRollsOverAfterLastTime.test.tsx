/**
 * The card turns to tomorrow when today has nothing left in it.
 *
 * The hero always did: `getNextPrayerDisplay` reads tomorrow as well, so the
 * moment Ishāʾ passes the countdown is pointed at tomorrow's Fajr. The table
 * underneath stayed on the calendar day until midnight, which left the top
 * of the screen counting to a time the rows below it did not contain — for
 * the whole evening, which is exactly when someone is looking ahead.
 *
 * Two things are pinned here: WHEN the day is spent, which is the last row
 * on the card and not Ishāʾ, and what happens then — the table turns, the
 * bar says "Tomorrow" in so many words, and a reader who has chosen a day
 * for themselves is left alone.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockFocused = { value: true };

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused.value,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
      controlBg: '#EEEEEE',
    },
  }),
}));

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: { prayerAlertModes: {}, notificationSound: 'default' },
    updateSettings: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useClockFormatter', () => {
  const { makeClockFormatter } = require('../src/utils/clockFormat');
  const formatter = makeClockFormatter(false, 'en');
  return {
    useClockFormatter: () => formatter,
    useSystemIs24Hour: () => true,
  };
});

jest.mock('../src/components/GlassSurface', () => {
  const { View } = require('react-native');
  return { GlassSurface: View };
});

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, second?: unknown) =>
      typeof second === 'string' ? second : key,
    i18n: { language: 'en' },
  }),
}));

import { Text } from 'react-native';
import { TodayCard } from '../src/screens/home/TodayCard';
import { dayIsSpent, lastTimeOfDay } from '../src/prayer/dayRollover';

const DAY = new Date(2026, 7, 23);

describe('when a day is spent', () => {
  const PLAIN = {
    Fajr: '05:00',
    Sunrise: '06:10',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '18:00',
    Isha: '20:00',
  };

  it('ends at Ishāʾ when Ishāʾ is the last row', () => {
    expect(lastTimeOfDay(PLAIN, DAY)).toEqual(new Date(2026, 7, 23, 20, 0));
    expect(dayIsSpent(PLAIN, DAY, new Date(2026, 7, 23, 19, 59))).toBe(false);
    expect(dayIsSpent(PLAIN, DAY, new Date(2026, 7, 23, 20, 1))).toBe(true);
  });

  it('runs on to the First Third when that row is on', () => {
    // #14's row sits AFTER Ishāʾ — it belongs to the night that begins on
    // this card. Rolling at Ishāʾ would hide a row that had not happened.
    const withThird = { ...PLAIN, Firstthird: '22:30' };
    expect(dayIsSpent(withThird, DAY, new Date(2026, 7, 23, 20, 1))).toBe(false);
    expect(dayIsSpent(withThird, DAY, new Date(2026, 7, 23, 22, 31))).toBe(true);
  });

  it('is not answered by the two night times that are already behind us', () => {
    // Islamic Midnight and the Last Third on THIS card are this morning's
    // small hours. They sort before Fajr, and a rule that read the last KEY
    // of the display order rather than the latest instant would have taken
    // the First Third's neighbours for the end of the day.
    const withNight = { ...PLAIN, Midnight: '00:30', Lastthird: '02:10' };
    expect(lastTimeOfDay(withNight, DAY)).toEqual(new Date(2026, 7, 23, 20, 0));
  });

  it('carries Ishāʾ past midnight when it falls there', () => {
    // A Stockholm June: Ishāʾ is printed on this card and happens on the
    // next calendar day. Read naively it is sixteen hours in the PAST, and
    // the card would call the day spent over breakfast.
    const summer = { ...PLAIN, Maghrib: '22:10', Isha: '00:15' };
    expect(lastTimeOfDay(summer, DAY)).toEqual(new Date(2026, 7, 24, 0, 15));
    expect(dayIsSpent(summer, DAY, new Date(2026, 7, 23, 9, 0))).toBe(false);
  });

  it('says nothing at all about a day it cannot read', () => {
    expect(lastTimeOfDay({}, DAY)).toBeNull();
    expect(dayIsSpent({}, DAY, new Date(2026, 7, 23, 23, 0))).toBe(false);
    expect(dayIsSpent({ Fajr: 'not a time' }, DAY, DAY)).toBe(false);
  });
});

const TODAY = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};
/** Distinct to the minute, so the rows say which day is on show. */
const TOMORROW = { ...TODAY, Fajr: '05:02', Isha: '19:58' };
const THIRD_DAY = { ...TODAY, Fajr: '05:04', Isha: '19:56' };

function renderCard(week: Record<string, string>[] = [TODAY, TOMORROW]) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TodayCard
        week={week}
        nextInfo={{ name: 'Isha', at: new Date(2026, 7, 23, 20, 0) }}
        resetKey="test"
        getDayLabel={(offset: number) =>
          offset === 1 ? 'Tomorrow' : offset === 0 ? 'Today' : 'Some day'
        }
        getDayDate={(offset: number) => `${23 + offset} August`}
        getWeekday={(offset: number) => ['Sunday', 'Monday', 'Tuesday'][offset] ?? '?'}
      />,
    );
  });
  return tree;
}

/** Which day's rows are drawn, read off Fajr — every day has a different one. */
function shownFajr(tree: ReactTestRenderer): string | undefined {
  return tree.root.findAllByProps({ prayerKey: 'Fajr' })[0]?.props?.rawTime;
}

/**
 * What the day bar calls the day on show.
 *
 * Found by shape rather than by style: the bar's name line is the one Text
 * whose children are a string followed by a nested Text that opens with the
 * two-space gap before the date. The accessibility label carries these same
 * words, so a search of the tree for "Tomorrow" would pass without the bar
 * ever saying it.
 */
function dayName(tree: ReactTestRenderer): string | null {
  for (const node of tree.root.findAllByType(Text)) {
    const kids = node.props.children;
    if (!Array.isArray(kids)) continue;
    const [first, second] = kids;
    if (typeof first !== 'string' || !React.isValidElement(second)) continue;
    const inner = (second.props as { children?: unknown }).children;
    if (Array.isArray(inner) && inner[0] === '  ') return first;
  }
  return null;
}

/**
 * The day bar's step control on one side or the other.
 *
 * By props, not by type: `Pressable` is a memo around a forwardRef and
 * `findAllByType` does not match its instances.
 */
function stepper(tree: ReactTestRenderer, label: string) {
  return tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find(n => typeof n.props.onPress === 'function');
}

describe('the card lands on the day that still has something in it', () => {
  afterEach(() => jest.useRealTimers());

  const at = (h: number, m = 0) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 23, h, m, 0));
  };

  it('opens on today while today is still running', () => {
    at(13);
    const tree = renderCard();
    expect(shownFajr(tree)).toBe('05:00');
    expect(dayName(tree)).toBe('Sunday');
  });

  it('opens on tomorrow once the last time has passed', () => {
    at(22);
    const tree = renderCard();
    expect(shownFajr(tree)).toBe('05:02');
  });

  it('names it "Tomorrow" rather than by its weekday', () => {
    // The bar is the only thing that can say the table moved. "Monday"
    // is what it says for every other day, including tomorrow reached by
    // a swipe — so the word has to be the one the reader is given here.
    at(22);
    expect(dayName(renderCard())).toBe('Tomorrow');
  });

  it('stays on today while a row it has not reached is still on the card', () => {
    at(22);
    expect(shownFajr(renderCard([{ ...TODAY, Firstthird: '22:30' }, TOMORROW]))).toBe(
      '05:00',
    );
  });

  it('stays put with no tomorrow to land on', () => {
    // The offline cache down to its last day: a card that turned to a page
    // it does not have would be blank.
    at(22);
    const tree = renderCard([TODAY]);
    expect(shownFajr(tree)).toBe('05:00');
    expect(dayName(tree)).toBe('Sunday');
  });
});

describe('the day turning under someone watching it', () => {
  afterEach(() => jest.useRealTimers());

  /** One minute before Ishāʾ, then past it. */
  function watchThroughIsha(week?: Record<string, string>[]) {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 23, 19, 59, 0));
    const tree = renderCard(week);
    act(() => {
      jest.setSystemTime(new Date(2026, 7, 23, 20, 0, 30));
      jest.advanceTimersByTime(90_000);
    });
    return tree;
  }

  it('turns at the last time, not at midnight', () => {
    const tree = watchThroughIsha();
    expect(shownFajr(tree)).toBe('05:02');
    expect(dayName(tree)).toBe('Tomorrow');
  });

  it('leaves a reader who has chosen a day where they put themselves', () => {
    // Three days, so the choice is somewhere the card would not have gone
    // on its own — otherwise "it did not move them" and "it moved them to
    // the same place" look identical.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 23, 19, 59, 0));
    const tree = renderCard([TODAY, TOMORROW, THIRD_DAY]);
    act(() => {
      stepper(tree, 'Next day')?.props.onPress();
    });
    act(() => {
      stepper(tree, 'Next day')?.props.onPress();
    });
    expect(shownFajr(tree)).toBe('05:04');

    act(() => {
      jest.setSystemTime(new Date(2026, 7, 23, 20, 0, 30));
      jest.advanceTimersByTime(90_000);
    });
    // Still Tuesday. The card turning the table under a reader looking at
    // a day they asked for is the failure this guard exists for.
    expect(shownFajr(tree)).toBe('05:04');
    expect(dayName(tree)).toBe('Tuesday');
  });
});
