// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, type ComponentType } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  BookIcon,
  CrescentIcon,
  DuaHandsIcon,
  MosqueIcon,
  PenIcon,
  TasbihIcon,
} from '../../theme/icons';
import { RADIUS, SPACING } from '../../theme/tokens';
import { CompassIcon } from '../../components/HeaderToolbarIcons';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Hub-and-spoke "tools" grid on HomeScreen — task #40.
 *
 * The IA-review decision (Option B in the original task spec): keep
 * HomeScreen as the meditative focal point and surface the secondary
 * features (tasbih, dua, compass, journal, mosques, quran) as a quiet
 * 6-tile grid below the prayer table. No tab bar — preserves the
 * "calm before clever" principle.
 *
 * On iPad / Mac (task #33's expanded breakpoint) this grid migrates to
 * a sidebar in a future pass. The data shape stays identical; only the
 * layout changes.
 */
type Tool = {
  id: keyof RootStackParamList;
  labelKey: string;
  Icon: ComponentType<{ color: string; size?: number }>;
};

const TOOLS: Tool[] = [
  { id: 'Compass', labelKey: 'nav.compass', Icon: CompassIcon },
  { id: 'Tasbih', labelKey: 'nav.tasbih', Icon: TasbihIcon },
  // Two cupped hands raised in dua — distinct from the book icon to
  // avoid visual collision with the Quran tile (#129).
  { id: 'Duas', labelKey: 'nav.duas', Icon: DuaHandsIcon },
  { id: 'Quran', labelKey: 'nav.quran', Icon: BookIcon },
  // Pen icon for the journal — writing entries is the primary mental
  // model, not "another book" (#129).
  { id: 'Journal', labelKey: 'nav.journal', Icon: PenIcon },
  { id: 'Mosques', labelKey: 'nav.mosques', Icon: MosqueIcon },
  // Fasting tile is universally useful (Mondays/Thursdays + Ayyam al-Bidh
  // outside Ramadan), but the surface gracefully shows the Sunnah tracker
  // when not in Ramadan. Lives at the bottom-right of the 4-row grid.
  { id: 'Fasting', labelKey: 'nav.fasting', Icon: CrescentIcon },
];

function QuickActionsGridImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.row}>
      {TOOLS.map(tool => (
        <Pressable
          key={tool.id}
          accessibilityRole="button"
          accessibilityLabel={t(tool.labelKey)}
          // QuranSurah is a deep-link target, never a tile destination — only
          // top-level routes appear here. The `as never` is the standard
          // workaround for params-required routes that don't apply.
          onPress={() => navigation.navigate(tool.id as never)}
          style={[
            styles.tile,
            {
              backgroundColor: palette.card,
              ...cardEdgeStyle(palette),
            },
          ]}>
          {/* `palette.accentSolid` is the SystemTheme native module's
              resolved hex for `?attr/colorPrimary` — the same value the
              title-bar icons render under Material You. SVG can render
              this directly. We deliberately do NOT use
              `theme.colors.primary` here because on Material You it can
              be a non-string ColorValue whose `String(...)` is
              "[object Object]" — truthy, so `||` won't fall through,
              and the SVG fill silently goes blank. */}
          <tool.Icon color={palette.accentSolid} size={24} />
          <Text style={[styles.label, { color: palette.text }]}>
            {t(tool.labelKey)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export const QuickActionsGrid = memo(QuickActionsGridImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
    minHeight: 76,
  },
  label: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
