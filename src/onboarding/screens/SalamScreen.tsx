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
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { APP_LANGUAGES } from '../../i18n/languages';
import { LanguageModal } from '../../screens/settings/LanguageModal';
import { RADIUS, SPACING } from '../../theme/tokens';
import { FONTS, TYPE, typeStyle } from '../../theme/typography';
import type { AppLanguage } from '../../settings/types';
import { MihrabLogoIcon, TranslationIcon } from '../../theme/icons';
import { OnboardingFrame, PrimaryAction } from '../OnboardingChrome';

/**
 * The Arabic salām — task #89, and no longer animated.
 *
 * It used to fade in over 1.1 seconds while scaling from 0.92 and sliding
 * twenty points sideways, and then bring the translation up behind it.
 * Three effects at once on the first thing anybody sees, and it looked
 * like a splash screen: the scale read as a stock app-launch zoom, and
 * the slide was a hardcoded `translateX` that pushed right-to-left text
 * in whichever direction the number said rather than the language did.
 *
 * The greeting does not need an entrance. The flow's own cross-fade and
 * the modal presentation already bring the screen in; anything here was
 * a second animation layered on the first. Typography and space carry it
 * now — which is principle 4, and which is also why there is no
 * Reduce Motion branch left in this file: there is no motion to reduce.
 */
function SalamHero({
  accentColor,
  mutedColor,
}: {
  accentColor: string;
  mutedColor: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={salamStyles.wrap}>
      <Text
        accessibilityLabel={t('onboarding.salamA11y', {
          defaultValue:
            'As-salāmu ʿalaykum wa raḥmatu llāhi taʿālā wa barakātuh',
        })}
        style={[
          salamStyles.salam,
          {
            color: accentColor,
            // The bundled Amiri font ships via task #69 — a calligraphic
            // Naskh that's elegant at large sizes. Falls back to the
            // system default if the .ttf hasn't been registered yet.
            //
            // Take the name from `FONTS`, do not spell it here. This used
            // to select 'Amiri-Regular' on Android, which meant Android
            // had to carry a SECOND copy of the same 431 KB file under
            // that filename purely so this one greeting resolved — the
            // rest of the app asks for `FONTS.arabicBody` ('Amiri').
            fontFamily: FONTS.arabicBody,
          },
        ]}>
        السلام عليكم ورحمة الله تعالى وبركاته
      </Text>
      <Text style={[salamStyles.translation, { color: mutedColor }]}>
        {t(
          'onboarding.welcome.salam',
          'Peace be upon you, and the mercy of Allah and His blessings.',
        )}
      </Text>
    </View>
  );
}

const salamStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  salam: {
    // The hero of the screen, and sized like one. Arabic naskh needs the
    // line height more than the point size — the descenders on ك and ه
    // and the kashida strokes collide at anything tighter.
    fontSize: 33, // tokens-ok-line: display or Arabic scale, sized by hand
    lineHeight: 58,
    textAlign: 'center',
    writingDirection: 'rtl',
    fontWeight: '500',
    letterSpacing: 0,
    paddingHorizontal: SPACING.sm,
  },
  translation: {
    fontSize: TYPE.footnote.fontSize,
    lineHeight: 19,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: SPACING.lg,
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
      center
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
          {/* The glyph is what makes the pill read as a control rather
              than as a label that happens to say "English". */}
          <TranslationIcon size={14} color={palette.mutedSolid} />
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
      {/* THREE TIERS, AND THE SALĀM IS THE MIDDLE ONE.
       *
       * The mark anchors the composition, the greeting is the hero, and
       * the app's name and what it does come last and quietest — because
       * the salām has already done the welcoming, and a title the same
       * weight as it would be a second greeting arguing with the first.
       * The gap between the tiers is what says so; nothing is boxed or
       * ruled off. */}
      <View style={styles.mark}>
        <MihrabLogoIcon size={52} color={palette.accentSolid} />
      </View>
      <SalamHero
        accentColor={palette.accentSolid}
        mutedColor={palette.mutedSolid}
      />
      <View style={styles.tail}>
        <Text
          style={[typeStyle('title2'), styles.name, { color: palette.text }]}>
          {t('onboarding.welcome.title', 'Welcome to Mihrab')}
        </Text>
        <Text
          style={[typeStyle('body'), styles.line, { color: palette.muted }]}>
          {t(
            'onboarding.welcome.body',
            'Prayer times and the Qur’an, with nothing watching you.',
          )}
        </Text>
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  mark: { alignItems: 'center', marginBottom: SPACING.lg },
  // The one big gap on the screen, and the only thing separating the
  // greeting from the introduction.
  tail: { marginTop: SPACING.xxl, gap: SPACING.sm },
  name: { textAlign: 'center' },
  line: { textAlign: 'center' },
});
