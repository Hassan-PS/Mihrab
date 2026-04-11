import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { RootStackParamList } from './types';

/**
 * Handles Android hardware back: return to the previous screen (usually Home)
 * instead of exiting the app. When deferRef.current is true, returns false so
 * overlays (e.g. RN Modal) can handle back first.
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
        if (navigation.canGoBack()) {
          navigation.goBack();
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
