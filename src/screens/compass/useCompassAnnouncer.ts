import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CompassMode, SignalQuality } from './useCompassSensor';

/**
 * Debounced screen-reader announcements for compass heading and signal
 * quality changes. Only fires when:
 *   • Mode is 'live' (we have actual sensor readings).
 *   • A screen reader is active.
 *   • Heading has shifted ≥5° since the last announcement, OR signal quality
 *     has crossed a category boundary.
 */
export function useCompassAnnouncer(args: {
  mode: CompassMode;
  needleDeg: number;
  signalQuality: SignalQuality;
}): void {
  const { mode, needleDeg, signalQuality } = args;
  const { t } = useTranslation();
  const lastAnnouncedDegRef = useRef<number | null>(null);
  const lastAnnouncedQualityRef = useRef<SignalQuality | null>(null);

  const announceHeading = useCallback(
    (deg: number) => {
      const last = lastAnnouncedDegRef.current;
      if (last === null || Math.abs(deg - last) >= 5) {
        lastAnnouncedDegRef.current = deg;
        const rounded = Math.round(deg);
        AccessibilityInfo.announceForAccessibility(
          t('compass.a11yNeedleDeg', { deg: rounded }),
        );
      }
    },
    [t],
  );

  const announceQuality = useCallback(
    (quality: SignalQuality) => {
      if (quality !== lastAnnouncedQualityRef.current) {
        lastAnnouncedQualityRef.current = quality;
        if (
          quality === 'good' ||
          quality === 'weak' ||
          quality === 'very_weak'
        ) {
          AccessibilityInfo.announceForAccessibility(
            t(`compass.a11ySignal_${quality}`),
          );
        }
      }
    },
    [t],
  );

  useEffect(() => {
    if (mode !== 'live') return;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => {
        if (enabled) announceHeading(needleDeg);
      })
      .catch(() => {});
  }, [mode, needleDeg, announceHeading]);

  useEffect(() => {
    if (mode !== 'live') return;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => {
        if (enabled) announceQuality(signalQuality);
      })
      .catch(() => {});
  }, [mode, signalQuality, announceQuality]);
}
