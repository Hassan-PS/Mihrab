/**
 * The accent row: six presets, the colours this person kept, and the
 * way to make another.
 *
 * ── WHY IT IS A COMPONENT AND NOT TWO COPIES ──────────────────────────
 *
 * It is drawn in two places — Settings → Appearance, and the walkthrough's
 * "Make it yours" shelf — and it was two copies, which is how the
 * walkthrough came to offer six colours and no way to choose a seventh.
 * Somebody setting the app up for the first time is exactly the person
 * most likely to want their own colour, and they were the one person who
 * could not have it.
 *
 * The copies had drifted in smaller ways too: one announced its swatches
 * as buttons and the other as radios, for a control that is a
 * single-choice group in both. Radio is the true one and is what this
 * uses.
 *
 * ── WHAT IT OWNS, AND WHAT IT DOES NOT ────────────────────────────────
 *
 * It owns the row, the picker sheet, the two-tap removal, and the rule
 * that the app accent and the widget highlight move together (#127). It
 * does NOT own the label above it or whether it is shown at all: under
 * dynamic colours the OS drives both surfaces and the whole control is
 * hidden, and each host already knows its own layout for that. So the
 * hosts keep the heading and the hiding; this keeps the behaviour.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ColorPickerModal } from './ColorPickerModal';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  useAppearanceSettings,
  useWidgetSettings,
} from '../context/PrayerSettingsContext';
import {
  addSavedAccent,
  MAX_SAVED_ACCENTS,
  removeSavedAccent,
} from '../settings/accentColors';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
} from '../settings/widgetAccent';
import type { AppAccentId } from '../settings/types';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

/**
 * The ground a custom accent will actually sit on, as a plain hex.
 *
 * Not `palette.bg`, which can be a PlatformColor under dynamic colours —
 * the contrast maths cannot read one of those, and a colour that cannot
 * be measured must not silently measure as black. The shelf is not shown
 * in that mode anyway; these are the standard bases.
 */
const LIGHT_GROUND = '#FAF7F2'; // tokens-ok-line: measured against, not painted
const DARK_GROUND = '#141210'; // tokens-ok-line: measured against, not painted

type Props = {
  /**
   * Diameter of one swatch. The walkthrough runs smaller: its shelf is a
   * list of several preferences rather than a card about this one.
   */
  size?: number;
  /** Prefix for per-swatch testIDs, where a host's tests want them. */
  testIDPrefix?: string;
};

export function AccentShelf({ size = 44, testIDPrefix }: Props) {
  const { t } = useTranslation();
  const { palette, isDark } = useAppPalette();
  const { slice: settings, update: updateSettings } = useAppearanceSettings();
  const { update: updateWidget } = useWidgetSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Two taps to remove a saved colour, the same contract the reciter
  // sheet uses — a swatch is small, and a long-press menu for one verb is
  // more chrome than the verb is worth.
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  // A circle at whatever size the host asked for. `RADIUS.full` is the
  // token for "round this completely"; it is capped to the radius a
  // circle actually needs so a very large swatch does not get a corner
  // radius larger than itself.
  const swatchSize = {
    width: size,
    height: size,
    borderRadius: Math.min(RADIUS.full, size / 2),
  };

  /**
   * One accent change: the app's, and the widget's to match.
   *
   * The mirror is unconditional here because this whole control is
   * hidden under dynamic colours — the case that used to need the guard
   * is the case where nothing renders.
   */
  const setAccent = (id: AppAccentId, customHex?: string) => {
    updateSettings({
      appAccentId: id,
      ...(customHex ? { appAccentCustomHex: customHex } : {}),
    });
    updateWidget(widgetPatchForAccent(id, customHex));
  };

  const testID = (suffix: string) =>
    testIDPrefix ? `${testIDPrefix}-${suffix}` : undefined;

  const customActive = settings.appAccentId === 'custom';

  return (
    <>
      <View style={styles.row}>
        {APP_ACCENT_SWATCHES.map(sw => {
          const selected = settings.appAccentId === sw.id;
          return (
            <Pressable
              key={sw.id}
              testID={testID(sw.id)}
              accessibilityRole="radio"
              accessibilityLabel={t(`settings.accent_${sw.id}`, sw.id)}
              accessibilityState={{ checked: selected, selected }}
              onPress={() => {
                setPendingRemove(null);
                setAccent(sw.id);
              }}
              style={[
                swatchSize,
                {
                  backgroundColor: isDark ? sw.dark : sw.light,
                  borderColor: selected ? palette.accent : palette.border,
                  borderWidth: selected ? 3 : 2,
                },
              ]}
            />
          );
        })}

        {/* The shelf: colours this person kept, newest first. Tapping one
            applies it; tapping the active one arms its removal. */}
        {settings.savedAccentColors.map(hex => {
          const selected =
            customActive && settings.appAccentCustomHex.toUpperCase() === hex;
          const arming = pendingRemove === hex;
          return (
            <Pressable
              key={hex}
              accessibilityRole="radio"
              accessibilityLabel={hex}
              accessibilityHint={
                arming
                  ? t('common.confirmDelete', 'Tap again to delete')
                  : undefined
              }
              accessibilityState={{ checked: selected, selected }}
              onPress={() => {
                if (arming) {
                  setPendingRemove(null);
                  updateSettings({
                    savedAccentColors: removeSavedAccent(
                      settings.savedAccentColors,
                      hex,
                    ),
                  });
                  return;
                }
                if (selected) {
                  // Already the active colour — a second tap on it is the
                  // only unambiguous "remove this one".
                  setPendingRemove(hex);
                  return;
                }
                setAccent('custom', hex);
              }}
              style={[
                swatchSize,
                {
                  backgroundColor: hex,
                  borderColor: arming
                    ? palette.danger
                    : selected
                      ? palette.accent
                      : palette.border,
                  borderWidth: arming || selected ? 3 : 2,
                },
              ]}
            />
          );
        })}

        {/* Add — opens the picker. It keeps its place once the shelf is
            full and says "Hex" instead: the oldest colour falls off on
            save, so the button never becomes one that can only fail. */}
        <Pressable
          testID={testID('custom')}
          accessibilityRole="radio"
          accessibilityLabel={t('settings.accentPickerTitle', 'Custom colour')}
          accessibilityState={{ checked: customActive, selected: customActive }}
          onPress={() => {
            setPendingRemove(null);
            setPickerOpen(true);
          }}
          style={[
            swatchSize,
            styles.custom,
            {
              borderColor: customActive ? palette.accent : palette.border,
              borderWidth: customActive ? 3 : 2,
            },
          ]}>
          <Text style={[styles.customLabel, { color: palette.muted }]}>
            {settings.savedAccentColors.length >= MAX_SAVED_ACCENTS
              ? t('settings.accent_customAbbr', 'Hex')
              : '+'}
          </Text>
        </Pressable>
      </View>

      <ColorPickerModal
        visible={pickerOpen}
        initial={settings.appAccentCustomHex}
        palette={palette}
        ground={isDark ? DARK_GROUND : LIGHT_GROUND}
        onApply={hex => {
          setAccent('custom', hex);
          setPickerOpen(false);
        }}
        onSave={hex => {
          // One write: the colour becomes active AND joins the shelf, so
          // a save that is interrupted cannot leave a colour on the shelf
          // that was never applied, or the other way round.
          updateSettings({
            appAccentId: 'custom',
            appAccentCustomHex: hex,
            savedAccentColors: addSavedAccent(settings.savedAccentColors, hex),
          });
          updateWidget(widgetPatchForAccent('custom', hex));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    alignItems: 'center',
  },
  custom: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  customLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
  },
});
