/**
 * Reciter picker — v2.7.27.
 *
 * With 42 reciters the old inline radio list stopped scaling, so
 * switching now lives in its own searchable bottom sheet: type-ahead
 * filter (Latin or Arabic), the active reciter pinned visually via
 * check + accent, and a small "word highlight" badge on reciters with
 * quran-align timing data. Opened from the playback settings sheet and
 * directly from the mini player, so switching is one tap from anywhere
 * recitation is visible.
 */
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { setQuranPrefs, useQuranState } from '../quranState';
import { searchReciters, type Reciter } from './reciters';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ReciterPickerSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { prefs } = useQuranState();
  const [query, setQuery] = useState('');

  // Transliteration-tolerant (v2.8.4): "alajami", "Al-Ajmi" and "ajmy" all
  // reach أحمد العجمي. The old exact-substring filter returned nothing for
  // any spelling but the one stored, which reads as "that reciter isn't in
  // the app" — see `searchReciters`.
  const data = useMemo(() => searchReciters(query), [query]);

  const renderRow = ({ item }: { item: Reciter }) => {
    const selected = item.id === prefs.reciterId;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => {
          setQuranPrefs({ reciterId: item.id });
          onClose();
        }}
        style={[
          styles.row,
          { backgroundColor: selected ? palette.accentBg : 'transparent' },
        ]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: palette.text }]}>
            {item.name}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.arabic, { color: palette.muted }]}>
              {item.arabicName}
            </Text>
            {item.hasTimings ? (
              <View style={[styles.badge, { borderColor: palette.border }]}>
                <Text style={[styles.badgeText, { color: palette.muted }]}>
                  {t('quran.wordHighlightBadge', 'word highlight')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {selected ? (
          <Text style={{ color: palette.accentSolid, fontSize: 17 }}>✓</Text>
        ) : null}
      </Pressable>
    );
  };

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
          {t('quran.chooseReciter', 'Choose reciter')}
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('quran.searchReciters', 'Search reciters…')}
          placeholderTextColor={String(palette.muted)}
          accessibilityLabel={t('quran.searchReciters', 'Search reciters…')}
          clearButtonMode="while-editing"
          style={[
            styles.search,
            {
              color: palette.text,
              backgroundColor: palette.bg,
              borderColor: palette.border,
            },
          ]}
        />
        <FlatList
          data={data}
          keyExtractor={r => r.id}
          renderItem={renderRow}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '75%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  search: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    marginBottom: 8,
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
    marginVertical: 1,
  },
  name: { fontSize: 15, fontWeight: '600' },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  arabic: { fontSize: 12 },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
