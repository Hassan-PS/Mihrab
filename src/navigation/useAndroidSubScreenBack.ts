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

/**
 * Handles Android hardware back: pop the stack (usually back to Home).
 * When deferRef.current is true, returns false so overlays (e.g. RN Modal)
 * handle back first.
 *
 * Uses stack index instead of canGoBack() so behavior stays correct after
 * process resume / activity relaunch where the navigator state can disagree
 * with the native screen stack.
 */
export function useAndroidSubScreenBack(
  deferRef?: RefObject<boolean>,
): void {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }
      const onBackPress = () => {
        if (deferRef?.current) {
          return false;
        }
        const state = navigation.getState();
        const index = state?.index ?? 0;
        if (index > 0) {
          navigation.dispatch(StackActions.pop());
          return true;
        }
        navigation.navigate('Home');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation, deferRef]),
  );
}
