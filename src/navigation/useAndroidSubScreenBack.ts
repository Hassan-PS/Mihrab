import {
  StackActions,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { RootStackParamList } from './types';

/** The Today tab, which is what "back" means everywhere else in the app. */
const HOME_TAB = 'TodayTab';

/**
 * Android hardware back, for every screen that is not Today.
 *
 * ── WHAT IT IS SUPPOSED TO DO ─────────────────────────────────────────
 *
 * One level at a time, ending at Today:
 *
 *   surah reader  →  the Quran tab  →  Today  →  out of the app
 *
 * A pushed page goes back to the tab it was opened from; a tab's own root
 * goes to Today; Today itself is not handled here at all, so the system
 * does what the system does and leaves the app.
 *
 * ── WHY IT DID NOT ────────────────────────────────────────────────────
 *
 * This used to read `navigation.getState().index` and pop when it was
 * greater than zero. That is right for a pushed page and wrong for a tab,
 * because `useNavigation()` returns the CLOSEST navigator — the root stack
 * inside the reader, but the TAB navigator inside the Quran tab. On the
 * Quran tab the "index" being read was the tab's own index (1), so back
 * dispatched a stack pop at a bottom-tab navigator, which quietly does
 * nothing, and then returned true to say it had been handled. Back on any
 * tab but Today did nothing at all.
 *
 * The fallback was no better: `navigate('Home')` names the root stack
 * screen that HOLDS the tabs, so from inside them it is a no-op — it does
 * not select a tab. Going to Today means naming the tab.
 *
 * So the navigator's own `type` decides, rather than an index whose
 * meaning depends on where the hook was called from.
 */
/** What a press should do. Split out so it can be tested without a
 *  navigator, which is the part that was wrong and looked right. */
export type BackDecision =
  /** An overlay handles it. */
  | 'defer'
  /** A pushed page: go back one. */
  | 'pop'
  /** A tab root: select Today. */
  | 'home'
  /** Not ours — let Android do what Android does. */
  | 'system';

/** The navigator state, in the only terms this decision needs. */
export type BackNavState = {
  type?: string;
  index?: number;
  routes?: Array<{ name: string }>;
};

export function decideAndroidBack(
  state: BackNavState | undefined,
  deferred: boolean,
): BackDecision {
  if (deferred) return 'defer';
  if (!state) return 'system';

  if (state.type === 'stack') {
    // A pushed page: one step back, to whatever opened it.
    if ((state.index ?? 0) > 0) return 'pop';
    // The stack root IS the tab container, and a screen inside it would
    // have seen the tab navigator instead. Nothing to do.
    return 'system';
  }

  // A tab's own root. Today is the way out — and Today itself is not
  // trapped: the system closes the app rather than back doing nothing on
  // the one screen it cannot leave.
  const current = state.routes?.[state.index ?? 0]?.name;
  return current === HOME_TAB ? 'system' : 'home';
}

export function useAndroidSubScreenBack(deferRef?: RefObject<boolean>): void {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }
      const onBackPress = () => {
        // `getState` is untyped across navigator kinds; the fields read are
        // present on all of them.
        const state = navigation.getState() as BackNavState | undefined;
        switch (decideAndroidBack(state, Boolean(deferRef?.current))) {
          case 'pop':
            navigation.dispatch(StackActions.pop());
            return true;
          case 'home':
            navigation.navigate(HOME_TAB as never);
            return true;
          default:
            return false;
        }
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation, deferRef]),
  );
}
