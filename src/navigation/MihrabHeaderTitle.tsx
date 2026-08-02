import { useTheme } from '@react-navigation/native';
import { Platform, Text, View } from 'react-native';
import { MihrabLogoIcon } from '../theme/icons';
import { desktopSize } from '../responsive/desktop';

const isIOS = Platform.OS === 'ios';

/**
 * Home screen header title — always renders "Mihrab" in English regardless of
 * the user's selected language, because "Mihrab" is the app's proper name, not
 * a translated label. The outline logo icon sits left of the text; its interior
 * is transparent so the navigation bar background (light or dark theme) shows
 * through it.
 */
export function MihrabHeaderTitle() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      {/* desktopSize is a no-op everywhere but Mac Catalyst, which scales
          the whole canvas down ~23% — a 17pt wordmark arrives at 13. */}
      <MihrabLogoIcon size={desktopSize(20)} color={colors.text} />
      <Text
        style={{
          color: colors.text,
          fontSize: desktopSize(isIOS ? 17 : 20),
          fontWeight: isIOS ? '600' : '700',
          letterSpacing: isIOS ? -0.3 : 0,
        }}>
        Mihrab
      </Text>
    </View>
  );
}
