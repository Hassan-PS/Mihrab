/**
 * Choosing which muṣḥaf the reader is in.
 *
 * ── WHY THIS REPLACED A TOGGLE ────────────────────────────────────────
 *
 * With two riwayat the control was one button that cycled, and it showed
 * the name of the muṣḥaf you would GET rather than the one you were in.
 * That is defensible with two and wrong with four: cycling makes reaching
 * the fourth a three-tap guessing game, and a control labelled with a
 * place you are not is the thing that had someone reading Warsh under a
 * heading that said Ḥafṣ.
 *
 * So it names where you ARE, and opens a list. The list is the honest
 * shape for this: every riwayah the app can draw, the installed ones
 * selectable with the current one marked, and the rest shown as what they
 * are — available, once the text is on the device.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { arabicTextStyle } from '../theme/typography';
import {
  DEFAULT_RIWAYAH,
  riwayahAvailable,
  RIWAYAT,
  type RiwayahId,
} from './riwayat';
import { MODAL_ORIENTATIONS } from '../components/modalOrientations';

export function RiwayahPicker({
  visible,
  current,
  onClose,
  onPick,
  onManage,
}: {
  visible: boolean;
  current: RiwayahId;
  onClose: () => void;
  onPick: (id: RiwayahId) => void;
  /** Opens Manage downloads, for a riwayah not on the device yet. */
  onManage?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  // Not `visible={false}` on a mounted <Modal>: the picker is rendered
  // beside the reader for the whole life of the screen, and on Mac
  // Catalyst a modal that is mounted-but-hidden is still a presentation
  // the window is holding — which is how the navigation bar's own chips
  // stop answering the mouse. The fade-out is given up with it, which is
  // a fair price for chrome that keeps working; the jump-to-page card has
  // always unmounted itself the same way.
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      // Landscape too, or the muṣḥaf on its side cannot open this
      // at all — see MODAL_ORIENTATIONS.
      supportedOrientations={MODAL_ORIENTATIONS}
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          // Swallows the tap so choosing inside the card does not also
          // dismiss it through the scrim underneath.
          onPress={() => {}}
          style={[styles.card, { backgroundColor: palette.card }]}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('quran.riwayahPickerTitle', 'Reading tradition')}
          </Text>
          {RIWAYAT.map(riwayah => {
            const here = riwayah.id === current;
            const have = riwayahAvailable(riwayah.id);
            return (
              <Pressable
                key={riwayah.id}
                accessibilityRole="button"
                accessibilityState={{ selected: here, disabled: !have }}
                accessibilityLabel={
                  have
                    ? t('quran.switchRiwayah', {
                        defaultValue: 'Switch to the {{name}} reading',
                        name: t(riwayah.nameKey, riwayah.arabic),
                      })
                    : t('quran.riwayahNotOnDevice', {
                        defaultValue: '{{name}} — not on this device yet',
                        name: t(riwayah.nameKey, riwayah.arabic),
                      })
                }
                onPress={() => (have ? onPick(riwayah.id) : onManage?.())}
                style={[
                  styles.row,
                  { borderColor: palette.border },
                  here && { backgroundColor: palette.accentBg },
                ]}>
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.name,
                      { color: have ? palette.text : palette.muted },
                    ]}>
                    {t(riwayah.nameKey, riwayah.arabic)}
                    {/* Said on the row rather than by its position in the
                        list. Ḥafṣ being first is a fact about the order;
                        that it is the one the app ships with, reads by
                        default and falls back to is a fact about the
                        riwayah, and a reader deciding whether to take a
                        download needs the second one. */}
                    {riwayah.id === DEFAULT_RIWAYAH ? (
                      <Text style={{ color: palette.muted }}>
                        {` ${t('quran.riwayahDefault', '(default)')}`}
                      </Text>
                    ) : null}
                  </Text>
                  {!have ? (
                    <Text style={[styles.note, { color: palette.muted }]}>
                      {t('quran.riwayahAddIt', 'Tap to add it')}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.arabic,
                    { color: here ? palette.accentSolid : palette.muted },
                  ]}>
                  {riwayah.arabic}
                </Text>
                {/* The tick, not a colour, is what says "this one" — the
                    row tint alone does not survive a colourblind reader
                    or a very dark theme.

                    Rendered or absent, never drawn in `transparent`: a
                    transparent tick came out as a solid dark one on the
                    device, so every row claimed to be the current one.
                    A view that is not there cannot be mis-coloured. */}
                <View style={styles.tick}>
                  {here ? (
                    <Text
                      style={[styles.tickMark, { color: palette.accentSolid }]}>
                      ✓
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancel}>
            <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 16, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 12, marginTop: 2 },
  arabic: { ...arabicTextStyle('body'), fontSize: 17, fontWeight: '700' },
  tick: { width: 16, alignItems: 'center' },
  tickMark: { fontSize: 15, fontWeight: '700' },
  cancel: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
});
