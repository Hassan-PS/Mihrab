import { I18nManager, Platform, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useAppPalette } from '../hooks/useAppPalette';
import { useLayoutRtl } from '../i18n/useLayoutRtl';
import { HOME_TAB } from './useAndroidSubScreenBack';
import { SPACING } from '../theme/tokens';

/**
 * The way back to Today, in the title bar of every other tab.
 *
 * ── WHY A TAB HAS A BACK BUTTON AT ALL ────────────────────────────────
 *
 * Because this app already behaves as though it does. `decideAndroidBack`
 * has always sent hardware back from Quran, Tasbih, Duas, the Log and
 * Settings to Today, and treated Today as the one screen you cannot leave
 * — so the model is not six peer tabs, it is Today plus five pages you
 * went to. That model was only ever expressed in a gesture. Someone on a
 * page with a title bar and no arrow in it reads the tabs as peers, and
 * then the hardware back landing on Today looks like a bug rather than the
 * rule it is.
 *
 * So the arrow says out loud what the gesture already did. It is the same
 * control a pushed page gets from the navigator — the system one there,
 * this one here, because a tab's header is drawn in JS and has no back
 * control of its own to turn on.
 *
 * ── WHY IT IS NOT ANDROID-ONLY ────────────────────────────────────────
 *
 * The hardware-back rule is, because only Android has the button. The
 * MEANING is not: Today is home on every platform, and a back arrow that
 * appeared and vanished with the OS would make the same screen a different
 * shape on a phone and on an iPad — which is exactly the kind of drift the
 * six tabs were unified to stop.
 *
 * ── THE ARROW ITSELF ──────────────────────────────────────────────────
 *
 * Drawn to match the platform's own: a thin chevron on iOS, an arrow with
 * a shaft on Android, at the same 2pt stroke the rest of the header icons
 * use. It has to read as a sibling of the arrow on a pushed settings page,
 * because a user moving between them is looking at one control.
 *
 * ── WHICH WAY IT POINTS ───────────────────────────────────────────────
 *
 * At the edge it sits on. A chevron is a direction, not a letter, so in
 * Arabic, Urdu, Farsi and Hebrew, where "back" is the trailing edge, the
 * glyph turns around.
 *
 * Which edge that is depends on who laid the button out, and in this app
 * the two answers differ. The app mirrors itself with a Yoga `direction`
 * on the root view rather than `I18nManager.forceRTL` (see
 * `i18n/useLayoutRtl`), so an ordinary JS row — the Duas category bar —
 * mirrors with the APP's language and puts the arrow on the right. A
 * native stack header does not: `react-native-screens` hands its
 * `headerLeft` slot to the platform's own toolbar, which places it by the
 * DEVICE's layout direction, and that stays left-to-right for everyone as
 * long as `forceRTL` is off. So on an English phone with the app in Arabic
 * the reader's arrow is on the left and the Duas one is on the right, and
 * both are right — each points at the edge its own container calls back.
 *
 * Hence `rtl` is asked for rather than assumed. This shipped reading
 * `I18nManager.isRTL` unconditionally, which is the device's answer handed
 * to a row the device did not lay out: the Duas arrow sat on the trailing
 * edge in Arabic, pointing away from it.
 */
function BackArrow({ color, rtl }: { color: string; rtl: boolean }) {
  const flip = rtl ? [{ scaleX: -1 as const }] : undefined;
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      style={flip ? { transform: flip } : undefined}>
      <Path
        d="M15 5 8 12l7 7"
        stroke={color}
        // iOS's chevron carries the whole control, so it is drawn a hair
        // heavier; Android's shares the weight with its shaft.
        strokeWidth={Platform.OS === 'ios' ? 2.2 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Android's arrow has a shaft; iOS's chevron is the stroke alone. */}
      {Platform.OS === 'ios' ? null : (
        <Path
          d="M8.5 12H20"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

export function TabBackButton({
  onPress,
  label,
  inNativeHeader = false,
}: {
  /**
   * Somewhere other than Today. A tab that opens a page INSIDE itself —
   * the Duas index opening a category — hands the header this, so the one
   * arrow in the bar goes up one level, as an arrow does everywhere else,
   * rather than the tab keeping a second "‹ All duas" link under the title
   * for the same job.
   */
  onPress?: () => void;
  label?: string;
  /**
   * This one is standing in a native stack's `headerLeft`, not in a row of
   * ours — so the platform's toolbar placed it, by the device's direction,
   * and the glyph follows that instead of the app's language. See the note
   * on `BackArrow`.
   */
  inNativeHeader?: boolean;
} = {}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();
  const appRtl = useLayoutRtl();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t('common.back', 'Back')}
      hitSlop={10}
      // `navigate`, not a pop: there is no stack under a tab to pop. It
      // selects the Today tab, which is what the hardware button has
      // always done from here.
      onPress={onPress ?? (() => navigation.navigate(HOME_TAB as never))}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {/* `textSolid`, not `text`: under Liquid Glass the semantic colour
          is a PlatformColor, and react-native-svg given one draws nothing
          — the arrow would simply not be there. */}
      <BackArrow
        color={palette.textSolid}
        rtl={inNativeHeader ? I18nManager.isRTL : appRtl}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Matches the inset the navigator gives its own back control, so the
    // arrow does not jump sideways between a tab and a pushed page.
    paddingStart: SPACING.sm,
    paddingEnd: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  pressed: { opacity: 0.55 },
});

export const tabBackButton = () => <TabBackButton />;
