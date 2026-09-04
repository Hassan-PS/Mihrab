/**
 * The shapes a settings page is actually made of.
 *
 * ── WHY THESE EXIST ───────────────────────────────────────────────────
 *
 * This is what every one of the twelve cards was writing by hand:
 *
 *   <View style={[s.card, s.switchRow,
 *     { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
 *     <View style={s.switchCopy}>
 *       <Text style={[s.valueText, { color: palette.text }]}>…</Text>
 *       <Text style={[s.help, { color: palette.muted }]}>…</Text>
 *     </View>
 *     <Switch … />
 *   </View>
 *
 * — about forty times. Forty chances for one of them to use `label`
 * where its neighbour used `valueText`, to forget `cardEdgeStyle` and
 * lose its border under Liquid Glass, or to pad differently by four
 * points. Which is exactly what had happened: the pages did not look
 * like one another because nothing made them.
 *
 * ── ONE CARD PER GROUP, NOT PER SETTING ───────────────────────────────
 *
 * The bigger change is what a card IS. Every setting used to be its own
 * bordered box with twelve points of air under it, so a page of eight
 * settings was eight boxes — a stack of unrelated things, each shouting
 * equally. Settings are not unrelated: they come in small families, and
 * a family should look like one.
 *
 * So a GROUP is the card, and the rows inside it are separated by
 * hairlines. That is the shape every settings app on both platforms has
 * converged on, and it is quieter: one border instead of eight, and the
 * heading above it doing the work the eight borders were failing to do.
 *
 * ── WHAT A ROW MUST NOT DO ────────────────────────────────────────────
 *
 * Carry its own background or border. The group owns the surface; a row
 * that paints its own draws a box inside a box, which is what the first
 * attempt at this looked like.
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';

/**
 * A titled family of settings, in one card.
 *
 * `footer` is the sentence that explains the group as a whole — the
 * thing that used to be a `help` line on whichever row happened to be
 * last, where it read as belonging only to that row.
 */
export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const { palette } = useAppPalette();
  // `Children.toArray` drops nulls, which matters: a page hides rows by
  // rendering `null`, and without this the divider logic would put a
  // hairline under a row that is not there.
  const rows = Array.isArray(children) ? children : [children];
  const visible = rows.flat().filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? (
        <Text style={[styles.groupTitle, { color: palette.muted }]}>
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        {visible.map((row, i) => (
          <View
            key={i}
            style={i < visible.length - 1 ? rowDividerStyle(palette) : null}>
            {row as ReactNode}
          </View>
        ))}
      </View>
      {footer ? (
        <Text style={[styles.groupFooter, { color: palette.muted }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** Title, optional explanation, and a switch. */
export function SettingsToggleRow({
  title,
  help,
  value,
  onValueChange,
  disabled,
  testID,
  helpDanger,
}: {
  title: string;
  help?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
  /**
   * Colours the explanation as a warning. For the case where the row is
   * about to contradict a neighbouring setting and the reader is owed
   * that BEFORE the switch is touched rather than after.
   */
  helpDanger?: boolean;
}) {
  const { palette } = useAppPalette();
  return (
    <View style={[styles.row, disabled ? styles.disabled : null]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {help ? (
          <Text
            style={[
              styles.help,
              { color: helpDanger ? palette.danger : palette.muted },
            ]}>
            {help}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

/**
 * A row that opens something — a picker, a sheet, another page.
 *
 * `value` is the current answer, shown where the eye already is rather
 * than made to share the title's line. `destructive` is the one variant
 * that changes colour, because a row that deletes things should not look
 * like a row that opens things.
 */
export function SettingsLinkRow({
  title,
  value,
  help,
  onPress,
  destructive,
  accessory,
  testID,
}: {
  title: string;
  value?: string;
  help?: string;
  onPress: () => void;
  destructive?: boolean;
  /** Overrides the chevron — a "Change" link, a count, a spinner. */
  accessory?: ReactNode;
  testID?: string;
}) {
  const { palette } = useAppPalette();
  const tint: ColorValue = destructive ? '#d43f3f' : palette.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={value}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: tint }]}>{title}</Text>
        {value ? (
          <Text style={[styles.value, { color: palette.muted }]}>{value}</Text>
        ) : null}
        {help ? (
          <Text style={[styles.help, { color: palette.muted }]}>{help}</Text>
        ) : null}
      </View>
      {accessory ?? (
        <Text
          style={[
            styles.chevron,
            { color: destructive ? '#d43f3f' : palette.accentSolid },
          ]}>
          ›
        </Text>
      )}
    </Pressable>
  );
}

/** A row that is only a destination: icon, name, one line, chevron. */
export function SettingsNavRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.help, { color: palette.muted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <Text style={[styles.chevron, { color: palette.accentSolid }]}>›</Text>
    </Pressable>
  );
}

/** Anything that is not a row — a chip strip, a swatch grid, a preview. */
export function SettingsBlock({ children }: { children: ReactNode }) {
  return <View style={styles.block}>{children}</View>;
}

const styles = StyleSheet.create({
  group: { marginBottom: 20 },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginStart: 4,
  },
  card: { borderRadius: 14, overflow: 'hidden' },
  groupFooter: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    marginStart: 4,
    marginEnd: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  block: { paddingHorizontal: 16, paddingVertical: 14 },
  copy: { flex: 1 },
  icon: { width: 28, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '500' },
  value: { fontSize: 14, marginTop: 2 },
  help: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  chevron: { fontSize: 22, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
});
