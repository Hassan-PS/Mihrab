/**
 * Settings → Prayer times. Where the numbers come from and how they are
 * worked out: the source, the calculation method, the madhab, whether the
 * Mālikī second times are computed and printed, the per-prayer nudges,
 * and which optional rows the month table carries.
 *
 * WHAT IS NOT HERE: anything that fires. The Mālikī alerts and their lead
 * time moved to Notifications (#23) — this page is what the times ARE,
 * that page is what interrupts you. The switch that turns the second
 * times on stayed, because whether they are computed at all is a question
 * about the times.
 *
 * Three modals belong to this page, which is most of the reason it is a
 * page: they were all owned by one screen before, and the screen could
 * not say which of them any given card would open.
 */
import { useCallback, useRef, useState } from 'react';
import { ProviderPickerModal } from '../../../components/ProviderPickerModal';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { useTranslation } from 'react-i18next';
import { CalculationCard } from '../CalculationCard';
import { DataSourceCard } from '../DataSourceCard';
import { MadhabModal } from '../MadhabModal';
import { MethodModal } from '../MethodModal';
import { asrSchoolFor, selectedMadhab } from '../../../prayer/madhab';
import { MonthTimesCard } from '../MonthTimesCard';
import { PrayerOffsetsModal } from '../PrayerOffsetsModal';
import { SettingsPage } from '../SettingsPage';

export function PrayerTimesSettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [providerModal, setProviderModal] = useState(false);
  const [methodModal, setMethodModal] = useState(false);
  const [offsetsModal, setOffsetsModal] = useState(false);
  const [madhabModal, setMadhabModal] = useState(false);
  const deferBack = useRef(false);
  deferBack.current =
    providerModal || methodModal || offsetsModal || madhabModal;

  const openProvider = useCallback(() => setProviderModal(true), []);
  const closeProvider = useCallback(() => setProviderModal(false), []);
  const openMethod = useCallback(() => setMethodModal(true), []);
  const closeMethod = useCallback(() => setMethodModal(false), []);
  const openMadhab = useCallback(() => setMadhabModal(true), []);
  const closeMadhab = useCallback(() => setMadhabModal(false), []);
  const openOffsets = useCallback(() => setOffsetsModal(true), []);
  const closeOffsets = useCallback(() => setOffsetsModal(false), []);

  return (
    <>
      <SettingsPage deferBackRef={deferBack}>
        <DataSourceCard onOpenProviderPicker={openProvider} />
        <CalculationCard
          onOpenMethodPicker={openMethod}
          onOpenOffsetsModal={openOffsets}
          onOpenMadhabPicker={openMadhab}
        />
        <MonthTimesCard />
      </SettingsPage>

      <ProviderPickerModal
        visible={providerModal}
        onClose={closeProvider}
        settings={settings}
        updateSettings={updateSettings}
        palette={{
          card: palette.card,
          text: palette.text,
          muted: palette.muted,
          border: palette.border,
          bg: palette.bg,
          overlay: palette.overlay,
          flatChrome: palette.flatChrome,
          accent: palette.accent,
          accentBg: palette.accentBg,
          danger: palette.danger,
        }}
      />
      {/* Picking a school sets the shadow it implies — and nothing that
          fires. See src/prayer/madhab.ts. */}
      <MadhabModal
        visible={madhabModal}
        current={selectedMadhab(settings.madhab, settings.school)}
        palette={palette}
        onSelect={m =>
          updateSettings({ madhab: m, school: asrSchoolFor(m) })
        }
        onClose={closeMadhab}
      />
      <MethodModal
        visible={methodModal}
        currentMethod={settings.calculationMethod}
        palette={palette}
        onSelect={id => updateSettings({ calculationMethod: id })}
        onClose={closeMethod}
      />
      <PrayerOffsetsModal
        visible={offsetsModal}
        current={settings.prayerOffsets}
        palette={palette}
        onChange={next => updateSettings({ prayerOffsets: next })}
        onClose={closeOffsets}
      />
    </>
  );
}
