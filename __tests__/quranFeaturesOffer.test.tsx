/**
 * The muṣḥaf's one-time offer of its two off-by-default features.
 *
 * What has to hold: it offers only what is off, only on Ḥafṣ, only once;
 * "Turn on" flips exactly the switches left on; and "Not now" is an
 * answer that is not asked again.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      bg: '#FFFFFF',
      card: '#F5F5F5',
      controlBg: '#EEEEEE',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#0F5132',
      accentSolid: '#0F5132',
      accentBg: '#E7F0EA',
      onAccent: '#FFFFFF',
      overlay: 'rgba(0,0,0,0.4)',
      danger: '#B91C1C',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, opts?: unknown) =>
      typeof opts === 'string'
        ? opts
        : ((opts as { defaultValue?: string })?.defaultValue ?? key),
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import {
  OFFER_DELAY_MS,
  OFFER_KEY,
  QuranFeaturesOfferSheet,
  offerableQuranFeatures,
  useQuranFeaturesOffer,
} from '../src/quran/QuranFeaturesOffer';
import { __resetQuranStateForTests, getQuranState, setQuranPrefs } from '../src/quran/quranState';

const mounted: ReactTestRenderer[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});
beforeEach(async () => {
  await AsyncStorage.clear();
  __resetQuranStateForTests();
});

describe('what is offered', () => {
  it('is what is off', () => {
    expect(offerableQuranFeatures({ hafs: true, tajweedColours: false, wordReader: false })).toEqual([
      'tajweedColours',
      'wordReader',
    ]);
    expect(offerableQuranFeatures({ hafs: true, tajweedColours: true, wordReader: false })).toEqual([
      'wordReader',
    ]);
    expect(offerableQuranFeatures({ hafs: true, tajweedColours: true, wordReader: true })).toEqual([]);
  });
  it('is the colours alone on Warsh, which has no word reader', () => {
    expect(
      offerableQuranFeatures({ hafs: false, warsh: true, tajweedColours: false, wordReader: false }),
    ).toEqual(['tajweedColours']);
  });
  it('is nothing on a riwayah with neither', () => {
    expect(offerableQuranFeatures({ hafs: false, tajweedColours: false, wordReader: false })).toEqual([]);
  });
});

describe('when it is asked', () => {
  function Probe({ ready, seen }: { ready: boolean; seen: (v: boolean) => void }) {
    const offer = useQuranFeaturesOffer(ready);
    seen(offer.visible);
    return null;
  }

  it('waits for the page, then asks, once', async () => {
    jest.useFakeTimers();
    const seen = jest.fn();
    await act(async () => {
      mounted.push(create(<Probe ready seen={seen} />));
    });
    // The disk answer lands, the delay has not run out.
    await act(async () => {
      await Promise.resolve();
    });
    expect(seen).not.toHaveBeenCalledWith(true);
    await act(async () => {
      jest.advanceTimersByTime(OFFER_DELAY_MS + 1);
    });
    expect(seen).toHaveBeenLastCalledWith(true);
    jest.useRealTimers();
  });

  it('does not ask before the mushaf is on the device', async () => {
    jest.useFakeTimers();
    const seen = jest.fn();
    await act(async () => {
      mounted.push(create(<Probe ready={false} seen={seen} />));
    });
    await act(async () => {
      jest.advanceTimersByTime(OFFER_DELAY_MS * 2);
    });
    expect(seen).not.toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });

  it('does not ask again once answered', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(OFFER_KEY, '1');
    const seen = jest.fn();
    await act(async () => {
      mounted.push(create(<Probe ready seen={seen} />));
    });
    await act(async () => {
      jest.advanceTimersByTime(OFFER_DELAY_MS * 2);
    });
    expect(seen).not.toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });

  it('does not ask someone who already has both on', async () => {
    jest.useFakeTimers();
    setQuranPrefs({ tajweedColours: true, wordReader: true });
    const seen = jest.fn();
    await act(async () => {
      mounted.push(create(<Probe ready seen={seen} />));
    });
    await act(async () => {
      jest.advanceTimersByTime(OFFER_DELAY_MS * 2);
    });
    expect(seen).not.toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });
});

describe('the answer', () => {
  const press = (r: ReactTestRenderer, id: string) =>
    act(async () => {
      r.root.findByProps({ testID: id }).props.onPress();
    });

  it('"Turn on" flips the switches left on — both by default', async () => {
    const onClose = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(
        <QuranFeaturesOfferSheet visible features={['tajweedColours', 'wordReader']} onClose={onClose} />,
      );
      mounted.push(r);
    });
    await press(r, 'quran-offer-turn-on');
    expect(getQuranState().prefs.tajweedColours).toBe(true);
    expect(getQuranState().prefs.wordReader).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('respects a switch turned off in the sheet', async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(
        <QuranFeaturesOfferSheet visible features={['tajweedColours', 'wordReader']} onClose={() => {}} />,
      );
      mounted.push(r);
    });
    await act(async () => {
      r.root.findByProps({ testID: 'quran-offer-switch-tajweedColours' }).props.onValueChange(false);
    });
    await press(r, 'quran-offer-turn-on');
    expect(getQuranState().prefs.tajweedColours).toBe(false);
    expect(getQuranState().prefs.wordReader).toBe(true);
  });

  it('"Not now" changes nothing', async () => {
    const onClose = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<QuranFeaturesOfferSheet visible features={['wordReader']} onClose={onClose} />);
      mounted.push(r);
    });
    await press(r, 'quran-offer-not-now');
    expect(getQuranState().prefs.wordReader).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers only the rows it was given', async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<QuranFeaturesOfferSheet visible features={['wordReader']} onClose={() => {}} />);
      mounted.push(r);
    });
    expect(r.root.findAllByProps({ testID: 'quran-offer-wordReader' }).length).toBeGreaterThan(0);
    expect(r.root.findAllByProps({ testID: 'quran-offer-tajweedColours' })).toHaveLength(0);
  });
});
