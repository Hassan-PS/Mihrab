/**
 * Companion-text controls — v2.7.40.
 *
 * ONE place to pick what renders beneath each ayah app-wide: the mode
 * (translation ⇄ tafsir) plus the edition for the active mode. Backed by
 * the same persisted stores everywhere:
 *
 *   mode              → quranState.prefs.companionMode
 *   translation ed.   → settings.quranTranslationEdition (useActiveEdition)
 *   tafsir ed.        → quranState.prefs.tafsirEditionId
 *
 * Rendered inline in Settings → Quran, and as a bottom sheet
 * (`CompanionTextSheet`) from the Quran index page and the surah reader —
 * change it anywhere, it applies everywhere (reader rows, verse of the
 * day, ayah sheet, daily-ayah notification).
 */
// hover-ok: settings-row pressables — pressed feedback is the right affordance.
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useQuranState, setQuranPrefs } from './quranState';
import { QURAN_TRANSLATIONS } from './translations';
import { useActiveEdition } from './useActiveEdition';
import { TAFSIR_EDITIONS, resolveTafsirEdition } from './tafsir';

export type CompanionMode = 'translation' | 'tafsir';

/** The active mode + resolved edition label, for compact "current choice"
 *  captions (votd card, reader header). */
export function useCompanionChoice(): {
  mode: CompanionMode;
  editionLabel: string;
} {
  const { settings } = usePrayerSettings();
  const state = useQuranState();
  const translationEdition = useActiveEdition();
  const mode = state.prefs.companionMode;
  if (mode === 'tafsir') {
    return {
      mode,
      editionLabel: resolveTafsirEdition(
        state.prefs.tafsirEditionId,
        settings.language,
      ).label,
    };
  }
  return {
    mode,
    editionLabel:
      QURAN_TRANSLATIONS.find(e => e.id === translationEdition)?.label ??
      translationEdition,
  };
}

/** Inline mode toggle + both edition lists.
 *  `onPick` fires after an EDITION is chosen (not on mode toggles) — the
 *  sheet uses it to auto-close; the inline Settings card passes nothing. */
export function CompanionTextControls({
  onPick,
}: {
  onPick?: () => void;
} = {}) {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const state = useQuranState();
  const mode = state.prefs.companionMode;
  const translationEdition = useActiveEdition();
  const activeTafsir = resolveTafsirEdition(
    state.prefs.tafsirEditionId,
    settings.language,
  );

  const setMode = (m: CompanionMode) =>
    // votdMode kept in sync purely for downgrade safety (legacy field).
    setQuranPrefs({ companionMode: m, votdMode: m });

  const sectionHeader = (label: string, active: boolean) => (
    <Text
      style={[
        styles.sectionHeader,
        { color: active ? palette.accentSolid : palette.muted },
      ]}>
      {label}
      {active ? `  ·  ${t('quran.companionActive', 'active')}` : ''}
    </Text>
  );

  return (
    <View>
      {/* Mode segmented toggle */}
      <View style={[styles.segments, { borderColor: palette.border }]}>
        {(
          [
            ['translation', t('quran.viewToggleTranslation', 'Translation')],
            ['tafsir', t('quran.tafsir', 'Tafsir')],
          ] as Array<[CompanionMode, string]>
        ).map(([m, label]) => {
          const selected = mode === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => setMode(m)}
              style={[
                styles.segment,
                selected && { backgroundColor: palette.accentBg },
              ]}>
              <Text
                style={{
                  color: selected ? palette.accentSolid : palette.muted,
                  fontWeight: '700',
                  fontSize: 13,
                }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* BOTH edition lists, always visible (v2.7.40) — picking an edition
          from either section also ACTIVATES that section's mode, so one tap
          does the whole job (no separate toggle step). */}
      {sectionHeader(
        t('quran.viewToggleTranslation', 'Translation'),
        mode === 'translation',
      )}
      {QURAN_TRANSLATIONS.map((ed, i) => {
        const selected = mode === 'translation' && ed.id === translationEdition;
        return (
          <Pressable
            key={ed.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={ed.label}
            onPress={() => {
              updateSettings({ quranTranslationEdition: ed.id });
              setMode('translation');
              onPick?.();
            }}
            style={[
              styles.row,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: palette.border,
              },
            ]}>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: palette.text },
                  selected && { fontWeight: '700' },
                ]}>
                {ed.label}
              </Text>
              <Text style={[styles.rowSub, { color: palette.muted }]}>
                {ed.language}
              </Text>
            </View>
            {selected ? (
              <Text style={[styles.check, { color: palette.accent }]}>✓</Text>
            ) : null}
          </Pressable>
        );
      })}

      {sectionHeader(t('quran.tafsir', 'Tafsir'), mode === 'tafsir')}
      {/* ALL shipped tafsir editions — not just the app locale's: the
          language of study need not match the UI language. */}
      {TAFSIR_EDITIONS.map((ed, i) => {
        const selected = mode === 'tafsir' && ed.id === activeTafsir.id;
        return (
          <Pressable
            key={ed.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={ed.label}
            onPress={() => {
              setQuranPrefs({
                tafsirEditionId: ed.id,
                companionMode: 'tafsir',
                votdMode: 'tafsir',
              });
              onPick?.();
            }}
            style={[
              styles.row,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: palette.border,
              },
            ]}>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: palette.text },
                  ed.rtl && styles.rtl,
                  selected && { fontWeight: '700' },
                ]}>
                {ed.label}
              </Text>
              <Text
                style={[
                  styles.rowSub,
                  { color: palette.muted },
                  ed.rtl && styles.rtl,
                ]}>
                {ed.language}
              </Text>
            </View>
            {selected ? (
              <Text style={[styles.check, { color: palette.accent }]}>✓</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom-sheet wrapper — the Quran page / reader entry point. */
export function CompanionTextSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: palette.card }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('quran.companionTitle', 'Under each verse')}
        </Text>
        <ScrollView style={styles.list}>
          {/* Picking an edition applies AND closes — no extra Done press. */}
          <CompanionTextControls onPick={onClose} />
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.done', 'Done')}
          onPress={onClose}
          style={[styles.doneBtn, { backgroundColor: palette.accentSolid }]}>
          <Text style={styles.doneLabel}>{t('common.done', 'Done')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowText: { flex: 1, paddingEnd: 12 },
  rowLabel: { fontSize: 16 },
  rowSub: { fontSize: 12, marginTop: 1 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  check: { fontSize: 18, fontWeight: '700' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '75%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  list: { flexGrow: 0 },
  doneBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneLabel: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
