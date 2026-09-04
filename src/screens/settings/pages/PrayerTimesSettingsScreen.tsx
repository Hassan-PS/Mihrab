/**
 * Settings → Prayer times. Where the numbers come from and how they are
 * worked out: the source, the calculation method, the madhab, the
 * Mālikī second times, the per-prayer nudges, and which optional rows
 * the month table carries.
 *
 * Four modals belong to this page, which is most of the reason it is a
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
import { MethodModal } from '../MethodModal';
import { MonthTimesCard } from '../MonthTimesCard';
import { PrayerOffsetsModal } from '../PrayerOffsetsModal';
import { PreReminderModal } from '../PreReminderModal';
import { SettingsPage } from '../SettingsPage';

export function PrayerTimesSettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [providerModal, setProviderModal] = useState(false);
  const [methodModal, setMethodModal] = useState(false);
  const [offsetsModal, setOffsetsModal] = useState(false);
  const [daruriLeadModal, setDaruriLeadModal] = useState(false);

  const deferBack = useRef(false);
  deferBack.current =
    providerModal || methodModal || offsetsModal || daruriLeadModal;

  const openProvider = useCallback(() => setProviderModal(true), []);
  const closeProvider = useCallback(() => setProviderModal(false), []);
  const openMethod = useCallback(() => setMethodModal(true), []);
  const closeMethod = useCallback(() => setMethodModal(false), []);
  const openOffsets = useCallback(() => setOffsetsModal(true), []);
  const closeOffsets = useCallback(() => setOffsetsModal(false), []);
  const openDaruriLead = useCallback(() => setDaruriLeadModal(true), []);
  const closeDaruriLead = useCallback(() => setDaruriLeadModal(false), []);

  return (
    <>
      <SettingsPage deferBackRef={deferBack}>
        <DataSourceCard onOpenProviderPicker={openProvider} />
        <CalculationCard
          onOpenMethodPicker={openMethod}
          onOpenOffsetsModal={openOffsets}
          onOpenDaruriLeadPicker={openDaruriLead}
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
        }}
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
      {/* The same picker as the pre-prayer reminder, asking the same
          question about a different boundary. */}
      <PreReminderModal
        visible={daruriLeadModal}
        current={settings.malikiSecondTimeAlertMinutes}
        palette={palette}
        title={t('settings.malikiAlertsLeadTitle')}
        offLabel={t('settings.malikiAlertsAtTime')}
        onSelect={minutes =>
          updateSettings({ malikiSecondTimeAlertMinutes: minutes })
        }
        onClose={closeDaruriLead}
      />
    </>
  );
}
