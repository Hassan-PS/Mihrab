/**
 * Screen 1 — the greeting.
 *
 * Kept almost exactly as it was, because it is the best thing in the old
 * flow and the only part of first launch that sets a tone no other prayer
 * app sets. Three changes (onboarding-remake.md §3.1): the privacy
 * paragraph is one line instead of three clauses saying "no trackers"
 * twice, the step counter is gone, and there is a language chip in the
 * corner.
 *
 * ── WHY THE LANGUAGE CHIP IS HERE AND NOT ON THE SHELF ────────────────
 *
 * The shelf is at the END. Someone whose phone is in English while they
 * read Arabic cannot get there — they cannot read the four screens in
 * between. So the one setting that decides whether the rest of the flow
 * is legible is offered before any of it.
 *
 * Switching is live: `layoutDirectionFor()` derives the direction from
 * the language at `AppNavigationRoot`, so Arabic and Urdu re-lay the flow
 * out in place. No `I18nManager.forceRTL`, no restart. Worth knowing
 * before anyone "fixes" this with a reload.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { APP_LANGUAGES } from '../../i18n/languages';
import { LanguageModal } from '../../screens/settings/LanguageModal';
import { isReduceMotion } from '../../theme/motion';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, typeStyle } from '../../theme/typography';
import type { AppLanguage } from '../../settings/types';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
} from '../OnboardingChrome';

/**
 * Animated Arabic salām hero — task #89.
 *
 * The greeting "السلام عليكم ورحمة الله تعالى وبركاته" in Amiri, fading
 * in with a gentle scale and slide, the translation appearing under it.
 *
 * Reduce Motion is asked, not assumed — the docblock used to claim this
 * behaviour and the file did not have it until 2026-09-12. Not
 * `useReduceMotion()`: that hook starts false and corrects itself a frame
 * later, which for a once-per-install animation means starting and then
 * being cut short, visibly worse than either answer. Awaiting the cached
 * read costs one frame of an empty hero and gets it right the first time.
 */
export function SalamHero({
  accentColor,
  mutedColor,
}: {
  accentColor: string;
  mutedColor: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const slide = useRef(new Animated.Value(20)).current;
  const translationOpacity = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

  useEffect(() => {
    let alive = true;
    void isReduceMotion().then(reduce => {
      if (!alive) return;
      if (reduce) {
        opacity.setValue(1);
        scale.setValue(1);
        slide.setValue(0);
        translationOpacity.setValue(1);
        return;
      }
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(slide, {
            toValue: 0,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translationOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => {
      alive = false;
    };
  }, [opacity, scale, slide, translationOpacity]);

  return (
    <View style={salamStyles.wrap}>
      <Animated.Text
        accessibilityLabel={t('onboarding.salamA11y', {
          defaultValue:
            'As-salāmu ʿalaykum wa raḥmatu llāhi taʿālā wa barakātuh',
        })}
        style={[
          salamStyles.salam,
          {
            color: accentColor,
            opacity,
            transform: [{ scale }, { translateX: slide }],
            // The bundled Amiri font ships via task #69 — a calligraphic
            // Naskh that's elegant at large sizes. Falls back to the
            // system default if the .ttf hasn't been registered yet.
            fontFamily: Platform.select({
              ios: 'Amiri',
              android: 'Amiri-Regular',
              default: undefined,
            }),
          },
        ]}>
        السلام عليكم ورحمة الله تعالى وبركاته
      </Animated.Text>
      <Animated.Text
        style={[
          salamStyles.translation,
          { color: mutedColor, opacity: translationOpacity },
        ]}>
        {t(
          'onboarding.welcome.salam',
          'Peace be upon you, and the mercy of Allah and His blessings.',
        )}
      </Animated.Text>
    </View>
  );
}

const salamStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  salam: {
    fontSize: 30, // tokens-ok-line: display or Arabic scale, sized by hand
    lineHeight: 50,
    textAlign: 'center',
    writingDirection: 'rtl',
    fontWeight: '500',
    letterSpacing: 0,
    paddingHorizontal: SPACING.sm,
  },
  translation: {
    fontSize: TYPE.callout.fontSize,
    lineHeight: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export function SalamScreen({ onAdvance }: { onAdvance: () => void }) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const [picker, setPicker] = useState(false);

  // Named in the language itself, never translated: somebody looking for
  // their own language is looking for the word they would write it with.
  const current =
    APP_LANGUAGES.find(l => l.id === settings.language)?.label ??
    APP_LANGUAGES.find(
      l => l.id === (i18n.language ?? '').slice(0, 2).toLowerCase(),
    )?.label ??
    'English';

  const choose = (lang: AppLanguage) => {
    // `languagePicked` is what stops the app following the phone from
    // here on — the same pair AppearanceSettingsScreen writes.
    updateSettings({ language: lang, languagePicked: true });
    setPicker(false);
  };

  return (
    <OnboardingFrame
      progress={null}
      topRow={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.language', 'Language')}
          accessibilityHint={current}
          hitSlop={10}
          onPress={() => setPicker(true)}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: palette.border,
              backgroundColor: palette.card,
              borderRadius: RADIUS.full,
            },
            pressed && { opacity: 0.6 },
          ]}>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {current}
          </Text>
        </Pressable>
      }
      footer={
        <PrimaryAction
          testID="onboarding-salam-continue"
          label={t('common.continue', 'Continue')}
          onPress={onAdvance}
        />
      }>
      <SalamHero
        accentColor={palette.accentSolid}
        mutedColor={palette.mutedSolid}
      />
      <OnboardingHeading
        title={t('onboarding.welcome.title', 'Welcome to Mihrab')}
        body={t(
          'onboarding.welcome.body',
          'Prayer times and the Qur’an, with nothing watching you.',
        )}
      />
      <LanguageModal
        visible={picker}
        current={settings.language}
        palette={palette}
        onSelect={choose}
        onClose={() => setPicker(false)}
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
});
