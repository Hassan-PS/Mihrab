/**
 * CHANGING MUṢḤAF, IN ONE PLACE.
 *
 * Setting `prefs.riwayah` is not the whole of it. A `unicode` riwayah
 * starts and ends every page exactly where the printed one does, but its
 * LINES are laid out by the device rather than taken from the print —
 * someone who has memorised where an ayah sits on the page of their own
 * copy will notice, and finding out by being confused is the worst way to
 * learn it. So the first switch to one says so, once, and records that it
 * has (`riwayahNoticeSeen`).
 *
 * That lived inside the muṣḥaf screen while the reader's header was the
 * only way to switch. A second entry point — Settings → Qur'an — would
 * have set the preference without the notice AND without the flag, so the
 * alert would have gone off later, inside the reader, about a muṣḥaf the
 * reader had already been using for a week. Two callers is exactly when a
 * rule stops being a screen's business.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setQuranPrefs, useQuranState } from './quranState';
import { riwayahById, type RiwayahId } from './riwayat';

export function useSwitchRiwayah(): (id: RiwayahId) => void {
  const { t } = useTranslation();
  const quran = useQuranState();
  const seen = quran.prefs.riwayahNoticeSeen;
  return useCallback(
    (id: RiwayahId) => {
      const target = riwayahById(id);
      setQuranPrefs({ riwayah: target.id });
      if (target.render !== 'unicode' || seen) return;
      // The flag is written BEFORE the alert, not after it: an alert is
      // not a promise that anybody read it, and one that could fire twice
      // because the second switch happened while the first was on screen
      // is worse than one nobody reads.
      setQuranPrefs({ riwayahNoticeSeen: true });
      Alert.alert(
        t('quran.riwayahReflowTitle', 'Pages match, lines may not'),
        t(
          'quran.riwayahReflowBody',
          'This muṣḥaf starts and ends every page exactly where the printed one does, but its lines are laid out by your device rather than taken from the print, so they will not always break in the same places.',
        ),
      );
    },
    [seen, t],
  );
}
