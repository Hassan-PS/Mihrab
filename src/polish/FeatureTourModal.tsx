/**
 * Dynamic feature walkthrough for new users — look-and-feel/onboarding
 * upgrade. A swipeable four-slide tour shown ONCE, the first time the
 * HomeScreen appears after onboarding completes. Skippable at any point;
 * replayable from Settings ("Show the app tour").
 *
 * Deliberately a paged carousel rather than anchored coach-marks: the
 * home layout scrolls and reflows across device sizes and locales (incl.
 * RTL), so window-coordinate spotlights are fragile there. The carousel
 * is robust, fully localized, and honors the app palette.
 */
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  BookIcon,
  CrescentIcon,
  EightPointStarIcon,
  MihrabLogoIcon,
} from '../theme/icons';

const SEEN_KEY = 'mihrab.featureTour.v1';

export async function hasSeenFeatureTour(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
  } catch {
    // Storage unavailable → err on the side of NOT nagging the user.
    return true;
  }
}

export async function markFeatureTourSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* non-critical */
  }
}

/** Settings replay helper: clear the flag so the tour shows again. */
export async function resetFeatureTour(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SEEN_KEY);
  } catch {
    /* non-critical */
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FeatureTourModal({ visible, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isRTL = i18n.dir() === 'rtl';

  const slides = [
    {
      key: 'welcome',
      Icon: MihrabLogoIcon,
      title: t('tour.welcomeTitle', 'Welcome to Mihrab'),
      body: t(
        'tour.welcomeBody',
        'Prayer times, the Quran, and daily worship tools — private by design. No accounts, no trackers.',
      ),
    },
    {
      key: 'times',
      Icon: CrescentIcon,
      title: t('tour.timesTitle', 'Prayer times at a glance'),
      body: t(
        'tour.timesBody',
        'Accurate times for your location, with a live countdown to the next prayer. Swipe the day card to peek at the coming days.',
      ),
    },
    {
      key: 'quran',
      Icon: BookIcon,
      title: t('tour.quranTitle', 'The Quran, beautifully'),
      body: t(
        'tour.quranBody',
        'Read the Madinah mushaf, listen to recitation with five reciters, bookmark ayahs, and track your khatmah.',
      ),
    },
    {
      key: 'customize',
      Icon: EightPointStarIcon,
      title: t('tour.customizeTitle', 'Make it yours'),
      body: t(
        'tour.customizeBody',
        'Home-screen widgets, a Live Activity countdown, themes and accent colors — all in Settings.',
      ),
    },
  ];

  const finish = () => {
    void markFeatureTourSeen();
    onClose();
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page && p >= 0 && p < slides.length) setPage(p);
  };

  const goTo = (p: number) => {
    scrollRef.current?.scrollTo({ x: p * width, animated: true });
    setPage(p);
  };

  const isLast = page === slides.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={finish}>
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        {/* Skip — top corner, quiet. */}
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tour.skip', 'Skip')}
            hitSlop={12}
            onPress={finish}>
            <Text style={[styles.skip, { color: palette.muted }]}>
              {t('tour.skip', 'Skip')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={styles.pager}>
          {slides.map(s => (
            <View key={s.key} style={[styles.slide, { width }]}>
              <View
                style={[styles.iconWrap, { backgroundColor: palette.accentBg }]}>
                <s.Icon size={56} color={palette.accentSolid} />
              </View>
              <Text style={[styles.title, { color: palette.text }]}>
                {s.title}
              </Text>
              <Text style={[styles.body, { color: palette.muted }]}>
                {s.body}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots} accessibilityElementsHidden>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.dot,
                {
                  // muted (not border) — border is transparent under the
                  // iOS Liquid Glass palette and the dots would vanish.
                  backgroundColor:
                    i === page ? palette.accentSolid : palette.muted,
                  opacity: i === page ? 1 : 0.35,
                  width: i === page ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isLast ? t('tour.done', 'Get started') : t('tour.next', 'Next')
          }
          onPress={() => {
            if (isLast) finish();
            // RTL: the pager still scrolls in LTR pixel space; page order is
            // logical, so "next" always advances the index.
            else goTo(page + 1);
          }}
          style={[styles.cta, { backgroundColor: palette.accentSolid }]}>
          <Text style={styles.ctaLabel}>
            {isLast ? t('tour.done', 'Get started') : t('tour.next', 'Next')}
          </Text>
        </Pressable>
        {/* Keep layout stable across RTL — the pager itself handles direction. */}
        <View style={{ height: isRTL ? 0 : 0 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  skip: { fontSize: 15, fontWeight: '600' },
  pager: { flexGrow: 0, marginTop: 12 },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingTop: 48,
    minHeight: 420,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  dot: { height: 8, borderRadius: 4 },
  cta: {
    marginTop: 32,
    marginHorizontal: 36,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
