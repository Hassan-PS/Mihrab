import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PlaceSearchSection } from '../components/PlaceSearchSection';
import { ProviderPickerModal } from '../components/ProviderPickerModal';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import type { AppPalette } from '../theme/appPalette';
import type { GeocodedPlace } from '../geocoding/nominatim';
import { CALCULATION_METHODS, getMethodLabel } from '../settings/methods';
import {
  providerHidesCalculationMethod,
  providerHidesHanafiAsr,
} from '../settings/providerUi';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../settings/effectiveProvider';
import {
  getProviderLabel,
  PRAYER_DATA_PROVIDERS,
} from '../settings/providersCatalog';
import type { AppLanguage, WidgetHighlightId } from '../settings/types';
import { showDonationsUi } from '../distribution';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  cardEdgeStyle,
  inputChromeStyle,
  rowDividerStyle,
  segmentChromeStyle,
} from '../theme/chrome';

function MaybeSupportDeveloperSection({ palette }: { palette: AppPalette }) {
  if (!showDonationsUi()) {
    return null;
  }
  const { SupportDeveloperSection } = require('../donations/SupportDeveloperSection');
  return <SupportDeveloperSection palette={palette} />;
}

const WIDGET_HIGHLIGHT_SWATCHES: { id: Exclude<WidgetHighlightId, 'custom'>; hex: string }[] =
  [
    { id: 'green', hex: '#6BC98A' },
    { id: 'teal', hex: '#4EC9B0' },
    { id: 'blue', hex: '#6BA3F5' },
    { id: 'amber', hex: '#E5C07B' },
  ];

export function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette, isDark } = useAppPalette();
  const [methodModal, setMethodModal] = useState(false);
  const [providerModal, setProviderModal] = useState(false);
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [widgetHexDraft, setWidgetHexDraft] = useState(
    settings.widgetHighlightCustomHex,
  );

  const deferHardwareBackRef = useRef(false);
  deferHardwareBackRef.current = methodModal || providerModal;
  useAndroidSubScreenBack(deferHardwareBackRef);

  useEffect(() => {
    setWidgetHexDraft(settings.widgetHighlightCustomHex);
  }, [settings.widgetHighlightCustomHex]);

  useFocusEffect(
    useCallback(() => {
      setDraftLat(String(settings.manualLatitude));
      setDraftLng(String(settings.manualLongitude));
      setCoordError(null);
    }, [settings.manualLatitude, settings.manualLongitude]),
  );

  const coordsForEffective = useMemo(
    () => resolveCoordsFromSettings(settings),
    [settings],
  );
  const effectiveProvider = useMemo(
    () =>
      getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coordsForEffective,
      ),
    [
      settings.dataProviderAuto,
      settings.dataProvider,
      coordsForEffective,
    ],
  );

  const applyCoords = () => {
    const lat = parseFloat(draftLat.replace(',', '.'));
    const lng = parseFloat(draftLng.replace(',', '.'));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordError(t('errors.coordLat'));
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setCoordError(t('errors.coordLng'));
      return;
    }
    setCoordError(null);
    updateSettings({
      manualLatitude: lat,
      manualLongitude: lng,
      manualLocationLabel: undefined,
    });
  };

  const onSearchSelect = (place: GeocodedPlace) => {
    setDraftLat(String(place.latitude));
    setDraftLng(String(place.longitude));
    setCoordError(null);
    updateSettings({
      manualLatitude: place.latitude,
      manualLongitude: place.longitude,
      manualLocationLabel: place.displayName,
    });
  };

  const searchPalette = {
    bg: palette.bg,
    text: palette.text,
    muted: palette.muted,
    border: palette.border,
    accent: palette.accent,
    accentBg: palette.accentBg,
    card: palette.card,
    flatChrome: palette.flatChrome,
  };

  const onNotificationsToggle = async (value: boolean) => {
    if (
      value &&
      Platform.OS === 'android' &&
      typeof Platform.Version === 'number' &&
      Platform.Version >= 33
    ) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return;
      }
    }
    updateSettings({ notificationsEnabled: value });
  };

  const lockedProviderDesc = useMemo(() => {
    const opt = PRAYER_DATA_PROVIDERS.find(
      o => o.id === settings.dataProvider,
    );
    return t(`providers.${settings.dataProvider}.desc`, {
      defaultValue: opt?.description ?? '',
    });
  }, [settings.dataProvider, t]);

  return (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: palette.bg }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.appearance')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.label, { color: palette.muted }]}>
            {t('settings.theme')}
          </Text>
          <View style={styles.segmentRow}>
            {(
              [
                { id: 'system' as const, label: t('settings.themeSystem') },
                { id: 'light' as const, label: t('settings.themeLight') },
                { id: 'dark' as const, label: t('settings.themeDark') },
              ] as const
            ).map(opt => (
              <Pressable
                key={opt.id}
                style={[
                  styles.segment,
                  styles.appearanceSegment,
                  segmentChromeStyle(palette, settings.appearance === opt.id),
                ]}
                onPress={() => updateSettings({ appearance: opt.id })}>
                <Text
                  style={[
                    styles.appearanceSegmentLabel,
                    { color: palette.text },
                    settings.appearance === opt.id && {
                      color: palette.accent,
                    },
                  ]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View
            style={[
              styles.switchRow,
              {
                marginTop: 14,
                opacity: settings.appearance === 'system' ? 1 : 0.45,
              },
            ]}
            pointerEvents={
              settings.appearance === 'system' ? 'auto' : 'none'
            }>
            <View style={styles.switchCopy}>
              <Text style={[styles.valueText, { color: palette.text }]}>
                {t('settings.systemDynamicColors')}
              </Text>
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.systemDynamicColorsHelp')}
              </Text>
            </View>
            <Switch
              value={settings.useSystemDynamicTheme}
              disabled={settings.appearance !== 'system'}
              onValueChange={v =>
                updateSettings({ useSystemDynamicTheme: v })
              }
            />
          </View>
          <Text style={[styles.help, { color: palette.muted }]}>
            {t('settings.themeHelp')}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.language')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={styles.segmentRow}>
            {(
              [
                { id: 'en' as const, label: t('settings.langEn') },
                { id: 'sv' as const, label: t('settings.langSv') },
                { id: 'ar' as const, label: t('settings.langAr') },
              ] as const
            ).map(opt => (
              <Pressable
                key={opt.id}
                style={[
                  styles.segment,
                  styles.appearanceSegment,
                  segmentChromeStyle(palette, settings.language === opt.id),
                ]}
                onPress={() =>
                  updateSettings({ language: opt.id as AppLanguage })
                }>
                <Text
                  style={[
                    styles.appearanceSegmentLabel,
                    { color: palette.text },
                    settings.language === opt.id && {
                      color: palette.accent,
                    },
                  ]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.help, { color: palette.muted }]}>
            {t('settings.languageHelp')}
          </Text>
        </View>

        {isDark ? (
          <View
            style={[
              styles.card,
              styles.switchRow,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <View style={styles.switchCopy}>
              <Text style={[styles.valueText, { color: palette.text }]}>
                {t('settings.pureBlack')}
              </Text>
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.pureBlackHelp')}
              </Text>
            </View>
            <Switch
              value={settings.pureBlackDark}
              onValueChange={v => updateSettings({ pureBlackDark: v })}
            />
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.homeScreenWidget')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          {Platform.OS === 'android' ? (
            <>
              <Text style={[styles.label, { color: palette.muted }]}>
                {t('settings.widgetBackgroundOpacity')}
              </Text>
              <View style={styles.widgetOpacityRow}>
                <Pressable
                  style={[
                    styles.widgetOpacityBtn,
                    {
                      borderColor: palette.border,
                      opacity:
                        settings.androidWidgetBackgroundOpacity <= 20 ? 0.4 : 1,
                    },
                  ]}
                  disabled={settings.androidWidgetBackgroundOpacity <= 20}
                  onPress={() =>
                    updateSettings({
                      androidWidgetBackgroundOpacity: Math.max(
                        20,
                        settings.androidWidgetBackgroundOpacity - 4,
                      ),
                    })
                  }>
                  <Text style={{ color: palette.text, fontSize: 20 }}>−</Text>
                </Pressable>
                <Text style={[styles.widgetOpacityValue, { color: palette.text }]}>
                  {settings.androidWidgetBackgroundOpacity}%
                </Text>
                <Pressable
                  style={[
                    styles.widgetOpacityBtn,
                    {
                      borderColor: palette.border,
                      opacity:
                        settings.androidWidgetBackgroundOpacity >= 100 ? 0.4 : 1,
                    },
                  ]}
                  disabled={settings.androidWidgetBackgroundOpacity >= 100}
                  onPress={() =>
                    updateSettings({
                      androidWidgetBackgroundOpacity: Math.min(
                        100,
                        settings.androidWidgetBackgroundOpacity + 4,
                      ),
                    })
                  }>
                  <Text style={{ color: palette.text, fontSize: 20 }}>+</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          <Text
            style={[
              styles.label,
              {
                color: palette.muted,
                marginTop: Platform.OS === 'android' ? 16 : 0,
              },
            ]}>
            {t('settings.widgetHighlight')}
          </Text>
          <View style={styles.widgetSwatchRow}>
            {WIDGET_HIGHLIGHT_SWATCHES.map(s => {
              const selected = settings.widgetHighlightId === s.id;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(`settings.widgetHighlight_${s.id}`)}
                  onPress={() => updateSettings({ widgetHighlightId: s.id })}
                  style={[
                    styles.widgetSwatch,
                    {
                      backgroundColor: s.hex,
                      borderColor: selected ? palette.accent : palette.border,
                      borderWidth: selected ? 3 : 2,
                    },
                  ]}
                />
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.widgetHighlight_custom')}
              onPress={() => updateSettings({ widgetHighlightId: 'custom' })}
              style={[
                styles.widgetSwatch,
                styles.widgetSwatchCustom,
                {
                  backgroundColor: palette.card,
                  borderColor:
                    settings.widgetHighlightId === 'custom'
                      ? palette.accent
                      : palette.border,
                  borderWidth:
                    settings.widgetHighlightId === 'custom' ? 3 : 2,
                },
              ]}>
              <Text style={[styles.widgetSwatchCustomLabel, { color: palette.muted }]}>
                {t('settings.widgetHighlight_customAbbr')}
              </Text>
            </Pressable>
          </View>

          {settings.widgetHighlightId === 'custom' ? (
            <TextInput
              style={[
                styles.input,
                {
                  marginTop: 10,
                  borderColor: palette.border,
                  color: palette.text,
                  backgroundColor: palette.bg,
                },
              ]}
              value={widgetHexDraft}
              onChangeText={setWidgetHexDraft}
              onBlur={() => {
                const trimmed = widgetHexDraft.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
                  updateSettings({ widgetHighlightCustomHex: trimmed });
                } else {
                  setWidgetHexDraft(settings.widgetHighlightCustomHex);
                }
              }}
              placeholder={t('settings.widgetHighlightHexPlaceholder')}
              placeholderTextColor={palette.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          ) : null}

          <Text style={[styles.help, { color: palette.muted }]}>
            {t('settings.widgetHighlightDynamicHelp')}
          </Text>
          {Platform.OS === 'android' ? (
            <Text style={[styles.help, { color: palette.muted }]}>
              {t('settings.widgetConfigureHint')}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.dataSource')}
        </Text>
        <Pressable
          style={[
            styles.card,
            styles.rowPress,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={() => setProviderModal(true)}>
          <View style={styles.providerCopy}>
            <Text style={[styles.label, { color: palette.muted }]}>
              {t('settings.provider')}
            </Text>
            <Text style={[styles.valueText, { color: palette.text }]}>
              {settings.dataProviderAuto
                ? t('settings.providerAutoLine', {
                    label: getProviderLabel(effectiveProvider),
                  })
                : getProviderLabel(settings.dataProvider)}
            </Text>
            <Text style={[styles.help, { color: palette.muted }]}>
              {settings.dataProviderAuto
                ? t('settings.providerAutoHelp')
                : lockedProviderDesc}
            </Text>
          </View>
          <Text style={[styles.changeLink, { color: palette.accent }]}>
            {t('common.change')}
          </Text>
        </Pressable>

        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.location')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={styles.segmentRow}>
            <Pressable
              style={[
                styles.segment,
                segmentChromeStyle(palette, settings.locationMode === 'gps'),
              ]}
              onPress={() => updateSettings({ locationMode: 'gps' })}>
              <Text
                style={[
                  styles.segmentLabel,
                  { color: palette.text },
                  settings.locationMode === 'gps' && { color: palette.accent },
                ]}>
                {t('settings.gps')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segment,
                segmentChromeStyle(
                  palette,
                  settings.locationMode === 'manual',
                ),
              ]}
              onPress={() => updateSettings({ locationMode: 'manual' })}>
              <Text
                style={[
                  styles.segmentLabel,
                  { color: palette.text },
                  settings.locationMode === 'manual' && {
                    color: palette.accent,
                  },
                ]}>
                {t('settings.manual')}
              </Text>
            </Pressable>
          </View>
          {settings.locationMode === 'manual' && (
            <View style={styles.manualBlock}>
              <PlaceSearchSection
                palette={searchPalette}
                onSelectPlace={onSearchSelect}
              />
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.manualSearchHelp')}
              </Text>
              <Text style={[styles.label, { color: palette.muted }]}>
                {t('settings.coordsLabel')}
              </Text>
              <TextInput
                value={draftLat}
                onChangeText={setDraftLat}
                keyboardType="numbers-and-punctuation"
                placeholder={t('settings.latPlaceholder')}
                placeholderTextColor={palette.muted}
                style={[
                  styles.input,
                  inputChromeStyle(palette),
                  {
                    color: palette.text,
                    backgroundColor: palette.bg,
                  },
                ]}
              />
              <TextInput
                value={draftLng}
                onChangeText={setDraftLng}
                keyboardType="numbers-and-punctuation"
                placeholder={t('settings.lngPlaceholder')}
                placeholderTextColor={palette.muted}
                style={[
                  styles.input,
                  inputChromeStyle(palette),
                  {
                    color: palette.text,
                    backgroundColor: palette.bg,
                  },
                ]}
              />
              {coordError && (
                <Text style={styles.errorText}>{coordError}</Text>
              )}
              <Pressable
                onPress={applyCoords}
                style={[styles.applyBtn, { backgroundColor: palette.accent }]}>
                <Text style={styles.applyBtnLabel}>
                  {t('settings.applyCoords')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.calculation')}
        </Text>
        {providerHidesCalculationMethod(effectiveProvider) ? (
          <View
            style={[
              styles.card,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <Text style={[styles.help, { color: palette.muted }]}>
              {effectiveProvider === 'islamiska_forbundet'
                ? t('settings.calcHiddenSweden')
                : t('settings.calcHiddenPraytimes')}
            </Text>
          </View>
        ) : (
          <Pressable
            style={[
              styles.card,
              styles.rowPress,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}
            onPress={() => setMethodModal(true)}>
            <View>
              <Text style={[styles.label, { color: palette.muted }]}>
                {t('settings.method')}
              </Text>
              <Text style={[styles.valueText, { color: palette.text }]}>
                {getMethodLabel(settings.calculationMethod)}
              </Text>
            </View>
            <Text style={[styles.changeLink, { color: palette.accent }]}>
              {t('common.change')}
            </Text>
          </Pressable>
        )}

        {!providerHidesHanafiAsr(effectiveProvider) && (
          <View
            style={[
              styles.card,
              styles.switchRow,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <View style={styles.switchCopy}>
              <Text style={[styles.valueText, { color: palette.text }]}>
                {t('settings.hanafiAsr')}
              </Text>
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.hanafiAsrHelp')}
              </Text>
            </View>
            <Switch
              value={settings.school === 1}
              onValueChange={v => updateSettings({ school: v ? 1 : 0 })}
            />
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: palette.muted }]}>
          {t('settings.notifications')}
        </Text>
        <View
          style={[
            styles.card,
            styles.switchRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={styles.switchCopy}>
            <Text style={[styles.valueText, { color: palette.text }]}>
              {t('settings.prayerAlerts')}
            </Text>
            <Text style={[styles.help, { color: palette.muted }]}>
              {t('settings.prayerAlertsHelp')}
            </Text>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={onNotificationsToggle}
          />
        </View>

        <MaybeSupportDeveloperSection palette={palette} />
      </ScrollView>

      <ProviderPickerModal
        visible={providerModal}
        onClose={() => setProviderModal(false)}
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

      <Modal
        visible={methodModal}
        animationType="slide"
        transparent
        onRequestClose={() => setMethodModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[styles.modalFill, { backgroundColor: palette.overlay }]}
            onPress={() => setMethodModal(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>
              {t('settings.methodModalTitle')}
            </Text>
            <FlatList
              data={CALCULATION_METHODS}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.methodRow,
                    rowDividerStyle(palette),
                    settings.calculationMethod === item.id && {
                      backgroundColor: palette.bg,
                    },
                  ]}
                  onPress={() => {
                    updateSettings({ calculationMethod: item.id });
                    setMethodModal(false);
                  }}>
                  <Text style={[styles.methodName, { color: palette.text }]}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentActive: {
    borderWidth: 2,
  },
  segmentLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  appearanceSegment: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  appearanceSegmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  manualBlock: {
    marginTop: 16,
    gap: 10,
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  applyBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  rowPress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  changeLink: {
    fontSize: 17,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchCopy: {
    flex: 1,
    paddingRight: 12,
  },
  help: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  widgetOpacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 8,
  },
  widgetOpacityBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetOpacityValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 52,
    textAlign: 'center',
  },
  widgetSwatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  widgetSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  widgetSwatchCustom: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  widgetSwatchCustomLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalFill: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  methodRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  methodName: {
    fontSize: 16,
  },
  providerSub: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
