// hover-ok: a drag surface and a sheet — the pressed/drag feedback is the
// right affordance here, and a hover state on a colour field would sit
// under the finger that is choosing.
/**
 * Pick a colour by eye, or by code.
 *
 * ── WHY IT IS BUILT RATHER THAN INSTALLED ─────────────────────────────
 *
 * Every colour-picker package worth using is several hundred kilobytes
 * and drags in a gesture or animation runtime of its own. This app ships
 * on F-Droid, where every dependency is a thing somebody has to be able
 * to build from source, and it already has the two pieces a picker needs:
 * `react-native-svg` draws the gradients and `PanResponder` (the same one
 * the muṣḥaf page scrubber uses) reads the drag. So this is about two
 * hundred lines and no new dependency.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────
 *
 * The standard one: a saturation/value square under the current hue, a
 * hue strip beneath it, and a hex field. HSV rather than HSL because in
 * HSL that square is a diamond with unreachable corners.
 *
 * The two halves are one value. Dragging moves the hex; typing a hex
 * moves the thumbs. Neither is the source of truth — `hsv` is, and the
 * field is re-rendered from it except while it is being edited, because
 * re-formatting a half-typed `#1a2` under the cursor is how a hex field
 * becomes impossible to use.
 *
 * ── AND WHY IT DOES NOT MIRROR IN ARABIC ──────────────────────────────
 *
 * The canvas carries `direction: 'ltr'` deliberately. An SVG gradient is
 * drawn in the SVG's own coordinate space, which does not flip with the
 * tree; a thumb positioned by percentage inside an RTL parent does. Left
 * them to disagree and the thumb reads the far end of the spectrum from
 * the colour under it. A spectrum is a canvas, not a list — it has no
 * reading order to mirror, which is the same reason the hero's sky does
 * not flip either.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../theme/appPalette';
import { cardEdgeStyle } from '../theme/chrome';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useSystemNavigationReserve } from '../navigation/tabBarInset';
import { modalStyles } from '../screens/settings/modalStyles';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';
import {
  accentLegibility,
  ACCENT_MIN_CONTRAST,
  hexToHsv,
  hsvToHex,
  HUE_STOPS,
  normaliseHex,
  type Hsv,
} from '../settings/accentColors';

/** Shown in the empty hex field — an example colour CODE, not chrome. */
const EXAMPLE_HEX = '#22C55E'; // tokens-ok-line: example text, not a painted colour

const SV_HEIGHT = 190;
const HUE_HEIGHT = 28;
const THUMB = 24;

type Props = {
  visible: boolean;
  /** The colour the sheet opens on. */
  initial: string;
  palette: AppPalette;
  /**
   * The ground this colour will actually sit on — the active theme's, as
   * a hex. Not both grounds: see `accentLegibility` for why a verdict
   * about the theme you are not looking at is noise.
   */
  ground: string;
  /** Apply without keeping. */
  onApply: (hex: string) => void;
  /** Apply and put it on the shelf. */
  onSave: (hex: string) => void;
  onClose: () => void;
};

export function ColorPickerModal({
  visible,
  initial,
  palette,
  ground,
  onApply,
  onSave,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const navigationReserve = useSystemNavigationReserve();
  /**
   * A React Native Modal on Android is a Dialog with its own window, and
   * that window does not inherit the activity's `adjustResize`. So the
   * keyboard opened straight over the hex field — which is how this bug
   * was found. Padding the flex-end ROOT lifts the whole sheet above the
   * keyboard; padding the sheet would grow it into its own `maxHeight`
   * instead and leave the field exactly where it was.
   */
  const keyboardInset = useKeyboardInset();

  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial));
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);

  // Re-seed whenever the sheet opens, so it always starts on the colour
  // the caller passed rather than on wherever it was left last time.
  useEffect(() => {
    if (!visible) return;
    const norm = normaliseHex(initial) ?? initial;
    setHsv(hexToHsv(norm));
    setDraft(norm);
    setEditing(false);
  }, [visible, initial]);

  const hex = useMemo(() => hsvToHex(hsv), [hsv]);

  // The field follows the drag, except while the user is inside it.
  useEffect(() => {
    if (!editing) setDraft(hex);
  }, [hex, editing]);

  const legibility = useMemo(
    () => accentLegibility(hex, ground),
    [hex, ground],
  );

  /**
   * Geometry: in state for drawing, in a ref for the drag.
   *
   * The thumb position is rendered, so the measured width has to be
   * state — a ref read during render never re-renders when it changes,
   * and the thumb would sit at -12 forever. The PanResponder is created
   * once and closes over what it captured, so it needs the same number
   * in a ref it can read the current value from. Both, kept in step by
   * the one `onLayout` that sets them.
   *
   * The drag reads `locationX`/`locationY` — coordinates relative to the
   * view that captured the responder — rather than measuring the view's
   * origin in the window. Inside a modal that is still animating in,
   * `measureInWindow` answers about where the sheet was, not where it is.
   */
  const [svW, setSvW] = useState(0);
  const [hueW, setHueW] = useState(0);
  const svWRef = useRef(0);
  const hueWRef = useRef(0);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

  const pickSv = (x: number, y: number) => {
    const w = svWRef.current;
    if (!(w > 0)) return;
    setHsv({
      ...hsvRef.current,
      s: clamp01(x / w),
      v: 1 - clamp01(y / SV_HEIGHT),
    });
  };

  const pickHue = (x: number) => {
    const w = hueWRef.current;
    if (!(w > 0)) return;
    setHsv({ ...hsvRef.current, h: clamp01(x / w) * 360 });
  };

  const svResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A drag that starts on the square belongs to the square until the
        // finger lifts — the sheet's scroll view must not take it.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => {
          setEditing(false);
          pickSv(e.nativeEvent.locationX, e.nativeEvent.locationY);
        },
        onPanResponderMove: e => {
          pickSv(e.nativeEvent.locationX, e.nativeEvent.locationY);
        },
      }),
    // `pickSv` is stable — it only reads refs and setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const hueResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => {
          setEditing(false);
          pickHue(e.nativeEvent.locationX);
        },
        onPanResponderMove: e => {
          pickHue(e.nativeEvent.locationX);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const commitDraft = () => {
    setEditing(false);
    const norm = normaliseHex(draft);
    if (norm) {
      // Keep the hue the user was on when the typed colour has none of
      // its own — a grey has no hue, and snapping the strip to red
      // because somebody typed #888888 loses where they were.
      const next = hexToHsv(norm);
      setHsv(next.s === 0 ? { ...next, h: hsvRef.current.h } : next);
    } else {
      setDraft(hex);
    }
  };

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={[modalStyles.root, { paddingBottom: keyboardInset }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            { paddingBottom: navigationReserve },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.accentPickerTitle', 'Custom colour')}
          </Text>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled">
            {/* The canvas does not mirror — see the header. */}
            <View style={styles.canvas}>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel={t(
                  'settings.accentPickerField',
                  'Saturation and brightness',
                )}
                accessibilityValue={{ text: hex }}
                style={[styles.svWrap, { borderColor: palette.border }]}
                onLayout={e => {
                  const w = e.nativeEvent.layout.width;
                  svWRef.current = w;
                  setSvW(w);
                }}
                {...svResponder.panHandlers}>
                <Svg width="100%" height={SV_HEIGHT}>
                  <Defs>
                    <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor="#FFFFFF" />
                      <Stop offset="1" stopColor={hueHex} />
                    </LinearGradient>
                    <LinearGradient id="val" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                      <Stop offset="1" stopColor="#000000" stopOpacity="1" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#sat)" />
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#val)" />
                </Svg>
                <View
                  pointerEvents="none"
                  style={[
                    styles.thumb,
                    {
                      backgroundColor: hex,
                      borderColor: '#FFFFFF', // rtl-safe: a ring on the drag thumb, not a layout edge
                      transform: [
                        { translateX: hsv.s * svW - THUMB / 2 },
                        { translateY: (1 - hsv.v) * SV_HEIGHT - THUMB / 2 },
                      ],
                    },
                  ]}
                />
              </View>

              <View
                accessibilityRole="adjustable"
                accessibilityLabel={t('settings.accentPickerHue', 'Hue')}
                accessibilityValue={{ text: `${Math.round(hsv.h)}°` }}
                style={[styles.hueWrap, { borderColor: palette.border }]}
                onLayout={e => {
                  const w = e.nativeEvent.layout.width;
                  hueWRef.current = w;
                  setHueW(w);
                }}
                {...hueResponder.panHandlers}>
                <Svg width="100%" height={HUE_HEIGHT}>
                  <Defs>
                    <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
                      {HUE_STOPS.map((stop, i) => (
                        <Stop
                          key={stop + i}
                          offset={`${i / (HUE_STOPS.length - 1)}`}
                          stopColor={stop}
                        />
                      ))}
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#hue)" />
                </Svg>
                <View
                  pointerEvents="none"
                  style={[
                    styles.thumb,
                    styles.hueThumb,
                    {
                      backgroundColor: hueHex,
                      borderColor: '#FFFFFF', // rtl-safe: a ring on the drag thumb, not a layout edge
                      transform: [
                        { translateX: (hsv.h / 360) * hueW - THUMB / 2 },
                      ],
                    },
                  ]}
                />
              </View>
            </View>

            {/* By code, for anyone who arrived with one. */}
            <View style={styles.hexRow}>
              <View
                style={[
                  styles.preview,
                  { backgroundColor: hex, borderColor: palette.border },
                ]}
              />
              <TextInput
                style={[
                  styles.hexInput,
                  {
                    borderColor: palette.border,
                    color: palette.text,
                    backgroundColor: palette.bg,
                  },
                ]}
                value={draft}
                onChangeText={text => {
                  setEditing(true);
                  setDraft(text);
                }}
                onBlur={commitDraft}
                onSubmitEditing={commitDraft}
                accessibilityLabel={t('settings.accentPickerHex', 'Colour code')}
                placeholder={EXAMPLE_HEX}
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
              />
            </View>

            {/* A custom accent is the one accent with a single value for
                both themes, so it is the one that can be legible in one
                and not the other. Said, never enforced. */}
            {legibility.ok ? null : (
              <Text style={[styles.warning, { color: palette.danger }]}>
                {t('settings.accentPickerContrast', {
                  defaultValue:
                    'Hard to read on this background ({{ratio}}:1, needs {{min}}:1).',
                  ratio: legibility.ratio.toFixed(1),
                  min: ACCENT_MIN_CONTRAST,
                })}
              </Text>
            )}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSave(hex)}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: palette.accent },
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={[styles.primaryLabel, { color: palette.onAccent }]}>
                  {t('settings.accentPickerSave', 'Save colour')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onApply(hex)}
                style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}>
                <Text style={[styles.secondaryLabel, { color: palette.muted }]}>
                  {t('settings.accentPickerUseOnce', 'Use without saving')}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  // The one place in the app that opts out of mirroring, and the header
  // says why.
  canvas: { direction: 'ltr', gap: SPACING.md },
  svWrap: {
    height: SV_HEIGHT,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  hueWrap: {
    height: HUE_HEIGHT,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: RADIUS.full,
    borderWidth: 3, // tokens-ok-line: the drag thumb's ring, not a card edge
  },
  hueThumb: { top: (HUE_HEIGHT - THUMB) / 2 },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  preview: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hexInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPE.body.fontSize,
  },
  warning: {
    fontSize: TYPE.footnote.fontSize,
    lineHeight: 18,
    marginTop: SPACING.md,
  },
  actions: { marginTop: SPACING.xl, gap: SPACING.sm },
  primary: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
  secondary: { paddingVertical: SPACING.sm, alignItems: 'center' },
  secondaryLabel: { fontSize: TYPE.body.fontSize },
});
