// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle, inputChromeStyle, rowDividerStyle } from '../../theme/chrome';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { DHIKR, dhikrArabic } from '../../dhikr/dhikr';
import type { DhikrReminder } from '../../dhikr/dhikrReminders';
import { modalStyles } from './modalStyles';
import { sharedSettingsStyles as s } from './sharedStyles';
import { TimeOfDayPicker } from './TimePickerSheet';

/** What the editor hands back — everything but the id. */
export type DhikrDraft = Omit<DhikrReminder, 'id'>;

const NEW_DRAFT: DhikrDraft = {
  dhikr: 'salahonprophet',
  hour: 9,
  minute: 0,
  days: [],
  enabled: true,
  sound: 'default',
};

/** Sunday-first, named by the device's own locale. */
function weekdayLabels(locale: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    // 2024-01-07 was a Sunday; any Sunday would do.
    const day = new Date(2024, 0, 7 + i);
    try {
      out.push(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day));
    } catch {
      out.push(['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]);
    }
  }
  return out;
}

/**
 * Creating and editing one reminder — issue #29.
 *
 * ── WHY THE WHOLE FORM IS ONE SHEET ───────────────────────────────────
 *
 * A reminder is four small answers — which words, what time, which days,
 * and whether it makes a sound — and every one of them is worth seeing
 * while choosing the others. Nine o'clock means something different on
 * Fridays only. So the time picker is embedded rather than being a sheet
 * of its own on top of this one: `TimePickerSheet` now wraps the same
 * controls this uses, and neither of them nests a modal inside a modal.
 *
 * ── THE SOURCE LINE IS PART OF THE CHOICE ─────────────────────────────
 *
 * Each preset shows the report it stands on, under the words, at the
 * moment somebody is deciding whether to hear it three times a day. That
 * is the same rule the duas are held to, applied where it is actually
 * read. A custom reminder shows no such line, and that is the honest
 * asymmetry: the app is not vouching for words it did not choose.
 */
export function DhikrReminderEditor({
  visible,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  /** The reminder being edited, or null to create one. */
  initial: DhikrReminder | null;
  onSave: (draft: DhikrDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigationReserve = useSystemNavigationReserve();
  const [draft, setDraft] = useState<DhikrDraft>(NEW_DRAFT);

  // A fresh draft every time the sheet opens, so yesterday's half-typed
  // custom reminder is not what greets the next person to press Add.
  useEffect(() => {
    if (!visible) return;
    setDraft(initial ? { ...initial } : { ...NEW_DRAFT });
  }, [visible, initial]);

  const patch = (p: Partial<DhikrDraft>) => setDraft(d => ({ ...d, ...p }));
  const days = weekdayLabels(i18n.language);
  const custom = draft.dhikr == null;
  // A custom reminder with nothing in it is not a reminder. Presets are
  // always complete, so this only ever blocks the case it is about.
  const saveable = !custom || Boolean(draft.title?.trim() || draft.body?.trim());

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            modalStyles.sheet,
            styles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            { paddingBottom: navigationReserve },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {initial
              ? t('dhikr.editReminder', 'Edit reminder')
              : t('dhikr.newReminder', 'New reminder')}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* WHICH WORDS */}
            <Text style={[styles.section, { color: palette.muted }]}>
              {t('dhikr.whichDhikr', 'Which dhikr')}
            </Text>
            <View accessibilityRole="radiogroup">
              {DHIKR.map(entry => {
                const selected = draft.dhikr === entry.id;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(entry.meaningKey)}
                    onPress={() => patch({ dhikr: entry.id })}
                    style={[
                      modalStyles.row,
                      rowDividerStyle(palette),
                      selected && { backgroundColor: palette.bg },
                    ]}>
                    <Text style={[styles.arabic, { color: palette.text }]}>
                      {dhikrArabic(entry)}
                    </Text>
                    <Text style={[modalStyles.rowSub, { color: palette.text }]}>
                      {t(entry.meaningKey)}
                    </Text>
                    <Text style={[styles.source, { color: palette.muted }]}>
                      {entry.source}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: custom }}
                accessibilityLabel={t('dhikr.ownWords', 'Your own words')}
                onPress={() => patch({ dhikr: null })}
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  custom && { backgroundColor: palette.bg },
                ]}>
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                  {t('dhikr.ownWords', 'Your own words')}
                </Text>
                <Text style={[modalStyles.rowSub, { color: palette.muted }]}>
                  {t(
                    'dhikr.ownWordsHelp',
                    'A reminder that says whatever you write.',
                  )}
                </Text>
              </Pressable>
            </View>

            {custom ? (
              <View style={styles.block}>
                <TextInput
                  accessibilityLabel={t('dhikr.customTitleLabel', 'Title')}
                  value={draft.title ?? ''}
                  onChangeText={v => patch({ title: v })}
                  placeholder={t('dhikr.customTitleLabel', 'Title')}
                  placeholderTextColor={palette.muted}
                  maxLength={60}
                  style={[
                    s.input,
                    inputChromeStyle(palette),
                    { color: palette.text, backgroundColor: palette.bg },
                  ]}
                />
                <TextInput
                  accessibilityLabel={t('dhikr.customBodyLabel', 'Text')}
                  value={draft.body ?? ''}
                  onChangeText={v => patch({ body: v })}
                  placeholder={t('dhikr.customBodyLabel', 'Text')}
                  placeholderTextColor={palette.muted}
                  multiline
                  maxLength={200}
                  style={[
                    s.input,
                    inputChromeStyle(palette),
                    styles.multiline,
                    { color: palette.text, backgroundColor: palette.bg },
                  ]}
                />
              </View>
            ) : null}

            {/* WHEN */}
            <Text style={[styles.section, { color: palette.muted }]}>
              {t('settings.ayahOfDayTime', 'Notification time')}
            </Text>
            <TimeOfDayPicker
              hour={draft.hour}
              minute={draft.minute}
              onChangeHour={h => patch({ hour: h })}
              onChangeMinute={m => patch({ minute: m })}
            />

            {/* WHICH DAYS */}
            <Text style={[styles.section, { color: palette.muted }]}>
              {t('dhikr.days', 'Days')}
            </Text>
            <View style={styles.dayRow}>
              {days.map((label, index) => {
                // Empty means every day, so every chip reads as chosen —
                // which is what "every day" looks like.
                const on =
                  draft.days.length === 0 || draft.days.includes(index);
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={label}
                    onPress={() => {
                      const current =
                        draft.days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : draft.days;
                      const next = current.includes(index)
                        ? current.filter(d => d !== index)
                        : [...current, index].sort((a, b) => a - b);
                      // All seven chosen is every day, which is what an
                      // empty list means — so it is stored as one.
                      patch({ days: next.length === 7 ? [] : next });
                    }}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: on ? palette.accentBg : 'transparent',
                        borderColor: on ? palette.accentSolid : palette.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.dayLabel,
                        { color: on ? palette.accentSolid : palette.muted },
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* SOUND */}
            <Text style={[styles.section, { color: palette.muted }]}>
              {t('dhikr.sound', 'Sound')}
            </Text>
            <View style={styles.dayRow} accessibilityRole="radiogroup">
              {(['default', 'silent'] as const).map(id => {
                const on = draft.sound === id;
                const label =
                  id === 'default'
                    ? t('dhikr.soundDefault', 'Notification sound')
                    : t('dhikr.soundSilent', 'Silent');
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={label}
                    onPress={() => patch({ sound: id })}
                    style={[
                      styles.soundChip,
                      {
                        backgroundColor: on ? palette.accentBg : 'transparent',
                        borderColor: on ? palette.accentSolid : palette.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.dayLabel,
                        { color: on ? palette.accentSolid : palette.muted },
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[s.help, styles.soundHelp, { color: palette.muted }]}>
              {t('dhikr.soundHelp')}
            </Text>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.done', 'Done')}
                disabled={!saveable}
                onPress={() => {
                  onSave(draft);
                  onClose();
                }}
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: saveable
                      ? palette.accentSolid
                      : palette.border,
                  },
                ]}>
                <Text style={styles.primaryLabel}>
                  {t('common.done', 'Done')}
                </Text>
              </Pressable>
              {onDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('dhikr.deleteReminder', 'Delete reminder')}
                  onPress={() => {
                    onDelete();
                    onClose();
                  }}
                  style={styles.deleteBtn}>
                  <Text style={styles.deleteLabel}>
                    {t('dhikr.deleteReminder', 'Delete reminder')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '88%' },
  section: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  arabic: { fontSize: 20, lineHeight: 34, writingDirection: 'rtl' },
  source: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  block: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  dayChip: {
    minWidth: 42,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  soundChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  dayLabel: { fontWeight: '600', fontSize: 13 },
  soundHelp: { paddingHorizontal: 16, paddingTop: 8 },
  actions: { padding: 16, gap: 10 },
  primaryBtn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  primaryLabel: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  deleteBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { color: '#d43f3f', fontSize: 15, fontWeight: '600' },
});
