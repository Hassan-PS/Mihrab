/**
 * Ayah share card — QR-24 (docs/quran-reader-plan.md).
 *
 * Renders the selected ayah as an elegant dark card (Arabic + active
 * translation + reference + a quiet Mihrab wordmark), captures it with
 * react-native-view-shot and hands it to the system share sheet.
 * Islamic ornament stays a quiet accent (design principle 2).
 */
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { arabicTextStyle } from '../../theme/typography';
import { findSurah } from '../quran';

type Props = {
  visible: boolean;
  onClose: () => void;
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
};

const CARD_BG = '#14231c';
const CARD_ORNAMENT = '#c9b47a';

export function ShareAyahModal({
  visible,
  onClose,
  surah,
  ayah,
  arabic,
  translation,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const meta = findSurah(surah);
  const reference = `${meta?.romanized ?? ''} ${surah}:${ayah}`;

  const doShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await RNShare.open({
        url: uri.startsWith('file://') ? uri : `file://${uri}`,
        type: 'image/png',
        failOnCancel: false,
      });
    } catch (e) {
      console.warn('ShareAyahModal: share failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
        <View
          ref={cardRef}
          collapsable={false}
          style={styles.card}>
          <Text style={styles.ornamentTop}>﴾ ﴿</Text>
          <Text style={styles.arabic}>{arabic}</Text>
          {translation ? (
            <Text style={styles.translation}>{translation}</Text>
          ) : null}
          <Text style={styles.reference}>{reference}</Text>
          <Text style={styles.wordmark}>Mihrab</Text>
        </View>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onClose}
            style={[styles.btn, { backgroundColor: palette.card }]}>
            <Text style={{ color: palette.text, fontWeight: '600' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.share', 'Share')}
            onPress={doShare}
            style={[styles.btn, { backgroundColor: '#0a7c30' }]}>
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {t('common.share', 'Share')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 26,
    paddingVertical: 30,
    gap: 14,
    alignItems: 'center',
  },
  ornamentTop: { color: CARD_ORNAMENT, fontSize: 18, letterSpacing: 6 },
  arabic: {
    color: '#f4efe2',
    fontSize: 26,
    lineHeight: 58,
    textAlign: 'center',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  translation: {
    color: 'rgba(244,239,226,0.75)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  reference: {
    color: CARD_ORNAMENT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  wordmark: {
    color: 'rgba(244,239,226,0.4)',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: {
    minWidth: 110,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
});
