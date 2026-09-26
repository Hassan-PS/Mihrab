/**
 * "The muṣḥaf can do two more things — want them on?"
 *
 * ── WHY ASK AT ALL ────────────────────────────────────────────────────
 *
 * The word reader and the tajwīd colours are both OFF on a fresh install,
 * and both for good reasons: one takes over the long press, the other is
 * a second set of fonts. But an off-by-default feature under Settings →
 * Quran is a feature most readers never hear of. They were built to be
 * used, so the muṣḥaf asks — once, in its own idiom, with the switches
 * already on and one button.
 *
 * ── WHEN, AND WHEN NOT ────────────────────────────────────────────────
 *
 * Only on the Ḥafṣ page (both features are Ḥafṣ-only), only once the
 * plain muṣḥaf is on the device (the first download's strip is enough
 * to look at on a first open), only for the features that are off, and
 * only ONCE: "Not now" is an answer, not a snooze. Somebody who already
 * turned both on never sees it. Turning the colours on here starts their
 * download the same way the Settings switch does — see
 * `tajweedAutoDownload`.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group } from '../components/ui/Group';
import { Row } from '../components/ui/Row';
import { useAppPalette } from '../hooks/useAppPalette';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import { setQuranPrefs, useQuranState } from './quranState';
import { riwayahById } from './riwayat';

export type QuranFeature = 'tajweedColours' | 'wordReader';

/** Asked once per device; the answer is the asking. */
export const OFFER_KEY = 'mihrab.quran.featuresOffer.v1';

/** What there is to offer. Pure, for the tests. */
export function offerableQuranFeatures(input: {
  hafs: boolean;
  tajweedColours: boolean;
  wordReader: boolean;
}): QuranFeature[] {
  if (!input.hafs) return [];
  const out: QuranFeature[] = [];
  if (!input.tajweedColours) out.push('tajweedColours');
  if (!input.wordReader) out.push('wordReader');
  return out;
}

/** How long the page gets to itself before the question, ms. */
export const OFFER_DELAY_MS = 1500;

/**
 * Decide, once per mount, whether to ask. `ready` is the reader's gate:
 * the plain muṣḥaf is on the device and a page is being drawn.
 */
export function useQuranFeaturesOffer(ready: boolean): {
  features: QuranFeature[];
  visible: boolean;
  close: () => void;
} {
  const { prefs } = useQuranState();
  const [features, setFeatures] = useState<QuranFeature[]>([]);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    AsyncStorage.getItem(OFFER_KEY)
      .then(seen => {
        if (!live || seen) return;
        const offer = offerableQuranFeatures({
          hafs: riwayahById(prefs.riwayah).render !== 'unicode',
          tajweedColours: prefs.tajweedColours,
          wordReader: prefs.wordReader,
        });
        if (offer.length === 0) return;
        timer = setTimeout(() => {
          if (!live) return;
          setFeatures(offer);
          setVisible(true);
        }, OFFER_DELAY_MS);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // Once: what was off when the reader opened is what is offered. A
    // switch flipped in Settings while this waits is picked up by the
    // sheet's own rows, which read the live prefs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const close = () => {
    setVisible(false);
    AsyncStorage.setItem(OFFER_KEY, '1').catch(() => undefined);
  };
  return { features, visible, close };
}

export function QuranFeaturesOfferSheet({
  visible,
  features,
  onClose,
}: {
  visible: boolean;
  features: QuranFeature[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  // The switches start ON: the question is "want these?", and the
  // expected answer is yes. Unticking one and pressing Turn on is a no
  // for that one only.
  const [picked, setPicked] = useState<Record<QuranFeature, boolean>>({
    tajweedColours: true,
    wordReader: true,
  });

  const turnOn = () => {
    const next: Partial<Record<QuranFeature, boolean>> = {};
    for (const f of features) if (picked[f]) next[f] = true;
    if (Object.keys(next).length > 0) setQuranPrefs(next);
    onClose();
  };

  const label = (f: QuranFeature) =>
    f === 'tajweedColours'
      ? {
          title: t('tajweed.title', 'Tajweed colours'),
          subtitle: t(
            'tajweed.settingsBlurb',
            'Tint the letters by their rule, and learn what each colour asks of you',
          ),
        }
      : {
          title: t('quran.wordReaderTitle', 'Word reader'),
          subtitle: t('quran.wordReaderBlurb', 'Hold a word in the mushaf to hear it on its own'),
        };

  return (
    <ResponsiveModal visible={visible} onClose={onClose} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[typeStyle('title3'), { color: palette.text }]}>
            {t('quran.featuresOfferTitle', 'The mushaf can do more')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('quran.featuresOfferBody', {
              defaultValue:
                'Two things are off until you ask for them. Both can be changed later in Settings → Quran.',
            })}
          </Text>
        </View>
        <Group>
          {features.map(f => (
            <Row
              key={f}
              testID={`quran-offer-${f}`}
              title={label(f).title}
              subtitle={label(f).subtitle}
              trailing={
                <Switch
                  testID={`quran-offer-switch-${f}`}
                  value={picked[f]}
                  onValueChange={v => setPicked(p => ({ ...p, [f]: v }))}
                  trackColor={{ true: palette.accentSolid, false: String(palette.border) }}
                  thumbColor="#ffffff" // tokens-ok-line: a Switch thumb stays light in both states so it reads against an accent track
                />
              }
            />
          ))}
        </Group>
        {features.includes('tajweedColours') ? (
          <Text style={[typeStyle('footnote'), styles.note, { color: palette.muted }]}>
            {t('quran.featuresOfferTajweedNote', {
              defaultValue:
                'The coloured pages download in the background over Wi‑Fi, about 170 MB.',
            })}
          </Text>
        ) : null}
        <Pressable
          testID="quran-offer-turn-on"
          accessibilityRole="button"
          onPress={turnOn}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.accentSolid },
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.onAccent }]}>
            {t('quran.featuresOfferTurnOn', 'Turn on')}
          </Text>
        </Pressable>
        <Pressable
          testID="quran-offer-not-now"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.controlBg },
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.text }]}>
            {t('onboarding.notNow', 'Not now')}
          </Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  head: { gap: SPACING.xs },
  note: { paddingHorizontal: SPACING.xs },
  button: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  pressed: { opacity: 0.7 },
});
