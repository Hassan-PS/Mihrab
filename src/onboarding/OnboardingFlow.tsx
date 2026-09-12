/**
 * The first-launch flow: order, transitions, back, and the one write that
 * waits until the end.
 *
 * Each screen owns its question, its controls and its own writes — see
 * `screens/` and docs/design/onboarding-remake.md §3. This file owns only
 * what they share.
 *
 * ── ANSWERS ARE WRITTEN AS THEY ARE MADE ──────────────────────────────
 *
 * Every screen commits on the tap, not at Start. A flow abandoned on the
 * alerts screen keeps the school chosen before it, and someone who
 * force-quits on the shelf keeps everything up to it. `onboardingComplete`
 * is the single exception, because that flag means "this person has been
 * through the flow", which is the one fact that is not true until they
 * have.
 *
 * ── LEAVING IS A DECISION, NOT A GESTURE ──────────────────────────────
 *
 * The route is a modal with no header and no swipe (RootNavigator). The
 * hardware back button steps BACK ONE SCREEN inside the flow rather than
 * dismissing it, and does nothing on the first. That step is worth having
 * precisely because answers are already written: going back to the school
 * screen shows the school the user picked, selected.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  useLocationSettings,
  usePrayerSettings,
} from '../context/PrayerSettingsContext';
import { useBreakpoint } from '../responsive/breakpoints';
import { isReduceMotion } from '../theme/motion';
import type { RootStackParamList } from '../navigation/types';
import { buildOnboardingSteps, onboardingProgress } from './steps';
import { SalamScreen } from './screens/SalamScreen';
import { LocationScreen } from './screens/LocationScreen';
import { MadhabScreen } from './screens/MadhabScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { PersonaliseScreen } from './screens/PersonaliseScreen';
import { ReadyScreen } from './screens/ReadyScreen';

/** Long enough to read as a change of place, short enough not to wait. */
const TRANSITION_MS = 220;

export function OnboardingFlow() {
  // Subscribe to width changes so the tablet column cap re-evaluates on
  // rotation without a forced remount.
  useBreakpoint();
  const { slice: location, update: updateLocation } = useLocationSettings();
  const { updateSettings } = usePrayerSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Computed once per mount. Recomputing it as `locationOnboardingComplete`
  // flips mid-flow would drop the step the user is standing on and shift
  // every index under them.
  const [steps] = useState(() =>
    buildOnboardingSteps(location.locationOnboardingComplete),
  );
  const [index, setIndex] = useState(0);
  const step = steps[index];

  const fade = useRef(new Animated.Value(1)).current;
  const reduceRef = useRef(false);
  useEffect(() => {
    let alive = true;
    void isReduceMotion().then(r => {
      if (alive) reduceRef.current = r;
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Cross-fade on every CHANGE of screen; an instant swap under Reduce
   * Motion. Not on mount: the modal's own presentation already animates
   * the first screen in, and the Reduce Motion read has not resolved yet
   * on the first render — an unconditional fade here would run for
   * exactly the people who asked for none.
   */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduceRef.current) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: TRANSITION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [index, fade]);

  // Once. A second tap on Start before the modal has gone would pop a
  // second screen — the Settings page the flow was re-run from, say.
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (!location.locationOnboardingComplete) {
      // Even when the location step was left unanswered, the flow is over:
      // the Home banners carry that prompt forward with a path back.
      updateLocation({ locationOnboardingComplete: true });
    }
    updateSettings({ onboardingComplete: true });
    navigation.goBack();
  }, [
    location.locationOnboardingComplete,
    navigation,
    updateLocation,
    updateSettings,
  ]);

  const advance = useCallback(() => {
    // Never past the end, and never a dismissal: the last screen does not
    // call this — it calls `finish` through `onFinish` — so nothing but a
    // deliberate Start can end the flow.
    setIndex(i => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setIndex(i => (i > 0 ? i - 1 : i));
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) return true; // Swallowed: the flow is not dismissible.
      back();
      return true;
    });
    return () => sub.remove();
  }, [back, index]);

  const progress = onboardingProgress(steps, index);

  const body = (() => {
    switch (step) {
      case 'salam':
        return <SalamScreen onAdvance={advance} />;
      case 'location':
        return <LocationScreen progress={progress} onAdvance={advance} />;
      case 'madhab':
        return <MadhabScreen progress={progress} onAdvance={advance} />;
      case 'alerts':
        return <AlertsScreen progress={progress} onAdvance={advance} />;
      case 'personalise':
        return <PersonaliseScreen progress={progress} onAdvance={advance} />;
      case 'ready':
        return <ReadyScreen progress={progress} onFinish={finish} />;
      default:
        // Defensive: an empty list would mean every condition was false,
        // which `buildOnboardingSteps` cannot produce.
        return null;
    }
  })();

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.root, { opacity: fade }]}>
        {body}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
