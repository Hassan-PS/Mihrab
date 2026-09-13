/**
 * What changed since the user last opened the app.
 *
 * ── THIS WAS THE FEATURE TOUR ─────────────────────────────────────────
 *
 * It used to be `FeatureTourModal`: four slides shown once, on the first
 * launch after onboarding completed — "Welcome to Mihrab", "Prayer times
 * at a glance", "The Quran, beautifully", "Make it yours". A second
 * welcome, in a second visual idiom, immediately after the first one.
 * The remake's last screen does that job with the user's own times
 * instead, so the tour left first launch.
 *
 * What it left behind is a paged, RTL-aware, skippable, full-screen modal
 * with a persisted flag — which is the exact shape of the what's-new
 * screen the app had never had. So the component is kept, whole,
 * including the two things it had already learned:
 *
 *   • the dots are `muted`, not `border` — under the iOS Liquid Glass
 *     palette `border` is transparent and they vanish;
 *   • the pager scrolls in LTR pixel space while the page order stays
 *     logical, so "next" always advances the index in every direction.
 *
 * Re-deriving that from scratch would have lost both.
 *
 * ── THE FLAG IS A VERSION NOW ─────────────────────────────────────────
 *
 * `'mihrab.featureTour.v1'` held `'1'` and was never compared against
 * anything, so the tour was shown once per install, forever. This holds
 * the app version the user last saw, which is what makes the surface
 * version-aware — and the absence of the key is what distinguishes a
 * fresh install (show nothing; they have just been onboarded) from an
 * upgrade.
 */
import { useEffect, useRef, useState } from 'react';
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
import { getInstalledAppVersionName } from '../appVersion';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';
import {
  lastSeenFrom,
  slidesForUpgrade,
  type WhatsNewSlide,
} from './whatsNew';

const SEEN_KEY = 'mihrab.lastSeenVersion';
/**
 * The feature tour's flag, read but never written again. Its presence is
 * how an install that predates release notes is told apart from a fresh
 * one — see `lastSeenFrom` and `LEGACY_BASELINE_VERSION` in ./whatsNew.
 */
const LEGACY_TOUR_KEY = 'mihrab.featureTour.v1';

/**
 * The version this user last ran, or null on a fresh install.
 *
 * An install from before this key existed has no value under it, and
 * would read as fresh — so the tour flag every such install carries
 * stands in, as the last version that had no release notes to show.
 */
export async function readLastSeenVersion(): Promise<string | null> {
  try {
    const [stored, legacy] = await AsyncStorage.multiGet([
      SEEN_KEY,
      LEGACY_TOUR_KEY,
    ]);
    return lastSeenFrom(stored[1], legacy[1] === '1');
  } catch {
    // Storage unavailable → err on the side of NOT interrupting.
    return getInstalledAppVersionName();
  }
}

export async function markVersionSeen(version?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, version ?? getInstalledAppVersionName());
  } catch {
    /* non-critical */
  }
}

/**
 * What to show right now, and nothing when that is nothing.
 *
 * Called on Home's first focus after onboarding is complete. A fresh
 * install has no stored version and gets an empty list — it also gets its
 * version stamped, so the NEXT update is an upgrade rather than a first
 * sighting.
 */
export async function pendingWhatsNew(): Promise<WhatsNewSlide[]> {
  const current = getInstalledAppVersionName();
  const last = await readLastSeenVersion();
  const slides = last ? slidesForUpgrade(last, current) : [];
  if (slides.length === 0) {
    // Nothing to show — a fresh install, a release with no notes, or a
    // version already seen. Stamp now so the next launch does not have
    // to work this out again, and so the NEXT update reads as an upgrade
    // from here rather than from the legacy baseline.
    await markVersionSeen(current);
  }
  // With slides, the stamp waits for the modal's own finish: a user who
  // kills the app mid-way is shown them again, which is the right answer.
  return slides;
}

type Props = {
  visible: boolean;
  slides: WhatsNewSlide[];
  onClose: () => void;
};

export function WhatsNewModal({ visible, slides, onClose }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // A modal that opens on an empty list would be a blank screen with a
  // button. `pendingWhatsNew` already returns nothing for that case; this
  // is the second lock, because the cost of getting it wrong is shown to
  // every user of a release that had no notes.
  useEffect(() => {
    if (visible && slides.length === 0) onClose();
  }, [visible, slides.length, onClose]);

  if (slides.length === 0) return null;

  const finish = () => {
    void markVersionSeen();
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
            accessibilityLabel={t('whatsNew.skip', 'Skip')}
            hitSlop={12}
            onPress={finish}>
            <Text style={[styles.skip, { color: palette.muted }]}>
              {t('whatsNew.skip', 'Skip')}
            </Text>
          </Pressable>
        </View>

        <Text
          accessibilityRole="header"
          style={[styles.kicker, { color: palette.muted }]}>
          {t('whatsNew.title', 'What’s new')}
        </Text>

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
                {t(s.titleKey)}
              </Text>
              <Text style={[styles.body, { color: palette.muted }]}>
                {t(s.bodyKey)}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots — hidden for a single slide, where they say nothing. */}
        {slides.length > 1 ? (
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
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isLast ? t('whatsNew.done', 'Continue') : t('whatsNew.next', 'Next')
          }
          onPress={() => {
            if (isLast) finish();
            // RTL: the pager still scrolls in LTR pixel space; page order is
            // logical, so "next" always advances the index.
            else goTo(page + 1);
          }}
          style={[styles.cta, { backgroundColor: palette.accentSolid }]}>
          <Text style={[styles.ctaLabel, { color: palette.onAccent }]}>
            {isLast ? t('whatsNew.done', 'Continue') : t('whatsNew.next', 'Next')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxxxl,
  },
  skip: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  kicker: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  pager: { flexGrow: 0, marginTop: SPACING.md },
  slide: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xxl,
    minHeight: 420,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: 26, // tokens-ok-line: display or Arabic scale, sized by hand
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  body: {
    fontSize: TYPE.body.fontSize,
    lineHeight: 24,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
  },
  dot: { height: 8, borderRadius: RADIUS.xs },
  cta: {
    marginTop: SPACING.xxl,
    marginHorizontal: SPACING.xxl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  ctaLabel: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
});
