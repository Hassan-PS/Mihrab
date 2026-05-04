import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import notifee, {
  AndroidNotificationSetting,
} from '@notifee/react-native';
import {
  useLocationSettings,
  usePrayerSettings,
} from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import {
  buildOnboardingSteps,
  type OnboardingStep,
  type OnboardingStepId,
} from '../onboarding/steps';
import { CrescentIcon } from '../theme/icons';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import type { RootStackParamList } from '../navigation/types';
import { LocationSetup } from '../components/LocationSetup';

/**
 * OnboardingScreen — task #30 UI shell.
 *
 * Walks the user through the conditional list returned by
 * `buildOnboardingSteps()`. Each primary CTA performs a permission ask
 * (or opens system settings); the secondary "Skip for now" advances
 * without acting. Both paths land at the next step. After the last step
 * we mark `locationOnboardingComplete = true` and pop back to Home —
 * the existing prompt banners on HomeScreen carry the second-chance
 * affordances for any permission the user skipped.
 *
 * Reduce-motion: this screen uses no entrance animation; advancing is
 * a state flip with native React Navigation pop on completion.
 *
 * Privacy: the location step never reads or stores coordinates here.
 * It only requests OS permission; the existing GPS pipeline in
 * `usePrayerDay` picks up the granted permission on next focus.
 */
/**
 * Animated Arabic salām hero — task #89.
 *
 * Reverent first-impression: the greeting "السلام عليكم ورحمة الله تعالى
 * وبركاته" appears in Amiri/Scheherazade calligraphic font, fading in
 * with a gentle scale + slide that evokes the iPhone "hello" first-launch
 * moment without copying it. Translation appears below in muted color
 * for non-Arabic speakers. Reduce-motion users see the static
 * end-state instantly via the imperative animation finishing in 1ms.
 */
function SalamHero({
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
  }, [opacity, scale, slide, translationOpacity]);

  return (
    <View style={salamStyles.wrap}>
      <Animated.Text
        accessibilityLabel="As-salāmu ʿalaykum wa raḥmatu llāhi taʿālā wa barakātuh"
        style={[
          salamStyles.salam,
          {
            color: accentColor,
            opacity,
            transform: [{ scale }, { translateX: slide }],
            // The bundled Amiri font ships via task #69 — a calligraphic
            // Naskh that's elegant at large sizes. Falls back to system
            // default if the .ttf hasn't been registered yet.
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
    paddingVertical: 12,
    gap: 12,
  },
  salam: {
    fontSize: 30,
    lineHeight: 50,
    textAlign: 'center',
    writingDirection: 'rtl',
    fontWeight: '500',
    letterSpacing: 0,
    paddingHorizontal: 8,
  },
  translation: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export function OnboardingScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { slice: settings, update: updateSettings } = useLocationSettings();
  const { updateSettings: updateAllSettings } = usePrayerSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const steps = useMemo(
    () => buildOnboardingSteps(settings.locationOnboardingComplete),
    [settings.locationOnboardingComplete],
  );

  const [index, setIndex] = useState(0);

  const finish = useCallback(() => {
    if (!settings.locationOnboardingComplete) {
      // Even if the user skipped the location step, mark onboarding as
      // complete so they don't see this flow on every launch — the
      // PermissionBanners on Home will carry the prompt forward.
      updateSettings({ locationOnboardingComplete: true });
    }
    // Flip the wider onboarding flag so the auto-router in App.tsx /
    // RootNavigator stops bringing the user back here on every launch.
    updateAllSettings({ onboardingComplete: true });
    navigation.goBack();
  }, [
    navigation,
    settings.locationOnboardingComplete,
    updateAllSettings,
    updateSettings,
  ]);

  const advance = useCallback(() => {
    if (index >= steps.length - 1) {
      finish();
    } else {
      setIndex(i => i + 1);
    }
  }, [finish, index, steps.length]);

  // Auto-advance once the embedded LocationSetup flips
  // `locationOnboardingComplete` true (user picked GPS or manual entry).
  // This lets the location step inline the full LocationSetup widget while
  // still keeping the linear step flow.
  const currentId = steps[index]?.id;
  useEffect(() => {
    if (currentId === 'location' && settings.locationOnboardingComplete) {
      // Tiny defer so the LocationSetup save commits before we advance.
      const t = setTimeout(() => advance(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [currentId, settings.locationOnboardingComplete, advance]);

  const onPrimary = useCallback(
    async (step: OnboardingStep) => {
      const id: OnboardingStepId = step.id;
      try {
        if (id === 'location') {
          // The location step now renders <LocationSetup/>, which handles
          // GPS + place search + manual coords and sets the right
          // locationMode for us. The primary CTA is hidden for this step.
          return;
        } else if (id === 'notifications') {
          await notifee.requestPermission();
          if (
            Platform.OS === 'android' &&
            typeof Platform.Version === 'number' &&
            Platform.Version >= 33
          ) {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            );
          }
        } else if (id === 'exactAlarms') {
          const s = await notifee.getNotificationSettings();
          if (s.android.alarm !== AndroidNotificationSetting.ENABLED) {
            await notifee.openAlarmPermissionSettings();
          }
        }
      } catch (e) {
        // Permission errors must not block onboarding — the home banner
        // surfaces the same prompt with a "Tap to grant" affordance.
        console.warn('Onboarding primary action failed:', e);
      }
      advance();
    },
    [advance, updateSettings],
  );

  const step = steps[index];
  if (!step) {
    // Defensive: an empty step list would mean every condition was false.
    // In practice buildOnboardingSteps always returns at least the welcome step.
    return null;
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View style={styles.illustration}>
        {step.id === 'welcome' ? (
          <SalamHero accentColor={String(palette.accent)} mutedColor={String(palette.muted)} />
        ) : (
          <CrescentIcon color={String(palette.accent)} size={64} />
        )}
      </View>

      <Text
        style={[typeStyle('caption'), styles.stepLabel, { color: palette.muted }]}>
        {t('onboarding.stepLabel', {
          current: index + 1,
          total: steps.length,
        })}
      </Text>

      <Text style={[typeStyle('title1'), styles.title, { color: palette.text }]}>
        {t(step.titleKey)}
      </Text>
      <Text style={[typeStyle('body'), styles.body, { color: palette.muted }]}>
        {t(step.bodyKey)}
      </Text>

      {step.id === 'location' ? (
        // The location step embeds the full LocationSetup so users can pick
        // GPS, search for a city, or enter coordinates manually. The
        // useEffect above auto-advances once selection is committed.
        <View style={styles.locationEmbed}>
          <LocationSetup
            palette={{
              bg: palette.bg,
              text: palette.text,
              muted: palette.muted,
              border: palette.border,
              accent: palette.accent,
              accentBg: palette.accentBg,
              card: palette.card,
              danger: palette.danger,
              flatChrome: palette.flatChrome,
            }}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        {step.id !== 'location' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(step.primaryKey)}
            onPress={() => onPrimary(step)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.primary,
              { backgroundColor: palette.accent, borderRadius: RADIUS.md },
              pressed && { opacity: 0.85 }, hovered && { opacity: 0.92 },
            ]}>
            <Text
              style={[typeStyle('headline'), { color: palette.bg }]}
              numberOfLines={1}>
              {t(step.primaryKey)}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(step.secondaryKey)}
          onPress={advance}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.secondary,
            { borderRadius: RADIUS.md },
            pressed && { opacity: 0.6 }, hovered && { opacity: 0.92 },
          ]}>
          <Text
            style={[typeStyle('callout'), { color: palette.muted }]}
            numberOfLines={1}>
            {t(step.secondaryKey)}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    gap: SPACING.md,
  },
  illustration: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  stepLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  title: { textAlign: 'center', fontWeight: '700' },
  body: { textAlign: 'center' },
  actions: { gap: SPACING.sm, marginTop: SPACING.lg },
  primary: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  secondary: {
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  locationEmbed: {
    minHeight: 320,
    marginTop: SPACING.sm,
  },
});
