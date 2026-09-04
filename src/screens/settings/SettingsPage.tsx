/**
 * The frame every settings subpage sits in.
 *
 * One place for the things all seven get wrong differently otherwise:
 * the scroll container, the width cap on a wide window, the room the tab
 * bar needs at the foot, and the Android hardware-back deferral each
 * page owes its modals.
 *
 * The header — the title and the back control beside it — is the native
 * stack's, configured in `RootNavigator`. Drawing our own would put a
 * second title under the real one on iOS and lose the platform's back
 * gesture on both.
 */
import type { ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { CenteredColumn } from '../../responsive/CenteredColumn';
import { useTabBarInset } from '../../navigation/tabBarInset';
import { useAndroidSubScreenBack } from '../../navigation/useAndroidSubScreenBack';

type Props = {
  children: ReactNode;
  /**
   * True while any of this page's modals is open, so Android's back
   * button dismisses the modal instead of popping the page.
   */
  deferBackRef?: RefObject<boolean>;
};

export function SettingsPage({ children, deferBackRef }: Props) {
  const { palette } = useAppPalette();
  const tabBarInset = useTabBarInset();
  // Optional by design: a page with no modals has nothing to defer.
  useAndroidSubScreenBack(deferBackRef);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: 24 + tabBarInset },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      <CenteredColumn>
        <View style={styles.stack}>{children}</View>
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  stack: { gap: 0 },
});
