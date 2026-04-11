import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useState } from 'react';
import type { ColorValue } from 'react-native';
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
import { SupportDeveloperSection } from '../donations/SupportDeveloperSection';
import type { AndroidWidgetHighlightId, AppLanguage } from '../settings/types';
import {
  ANDROID_WIDGET_BASE_BG,
  ANDROID_WIDGET_HIGHLIGHT_OPTIONS,
  androidWidgetHighlightHex,
} from '../widget/androidWidgetStyle';
import {
  cardEdgeStyle,
  inputChromeStyle,
  rowDividerStyle,
  segmentChromeStyle,
} from '../theme/chrome';

const WIDGET_OPACITY_PRESETS = [45, 60, 75, 88, 100] as const;

function widgetHighlightLabelKey(id: AndroidWidgetHighlightId): string {
  switch (id) {
    case 'green':
      return 'settings.widgetHighlightGreen';
    case 'teal':
      return 'settings.widgetHighlightTeal';
    case 'blue':
      return 'settings.widgetHighlightBlue';
    case 'amber':
      return 'settings.widgetHighlightAmber';
    default:
      return 'settings.widgetHighlightGreen';
  }
}

function AndroidWidgetPreview({
  opacity,
  highlightId,
  highlightColorOverride,
}: {
  opacity: number;
  highlightId: AndroidWidgetHighlightId;
  /** When system dynamic colors are on, matches widget highlight (primary). */
  highlightColorOverride?: ColorValue;
}) {
  const { r, g, b } = ANDROID_WIDGET_BASE_BG;
  const a = Math.min(1, Math.max(0, opacity / 100));
  const hi = highlightColorOverride ?? androidWidgetHighlightHex(highlightId);
  const cols = [
    { l: 'Fajr', t: '05:12', h: false },
    { l: 'Dhuhr', t: '12:10', h: true },
    { l: 'Asr', t: '15:20', h: false },
    { l: 'Magh', t: '18:05', h: false },
    { l: 'Isha', t: '19:30', h: false },
  ] as const;
  return (
    <View style={styles.widgetPreviewOuter}>
      <View
        style={[
          styles.widgetPreviewInner,
          { backgroundColor: `rgba(${r},${g},${b},${a})` },
        ]}>
        <Text style={styles.widgetPreviewDay}>Wed, Apr 9</Text>
        <View style={styles.widgetPreviewRow}>
          {cols.map(c => (
            <View key={c.l} style={styles.widgetPreviewCol}>
              <Text
                style={[
                  styles.widgetPreviewLabelSmall,
                  { color: c.h ? hi : '#E8EAED' },
                ]}
                numberOfLines={1}>
                {c.l}
              </Text>
              <Text
                style={[
                  styles.widgetPreviewTime,
                  { color: c.h ? hi : '#E8EAED' },
                ]}
                numberOfLines={1}>
                {c.t}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette, isDark } = useAppPalette();
  const [methodModal, setMethodModal] = useState(false);
  const [providerModal, setProviderModal] = useState(false);
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);

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

        {Platform.OS === 'android' ? (
          <>
            <Text style={[styles.sectionTitle, { color: palette.muted }]}>
              {t('settings.widgetAndroid')}
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.widgetAndroidHelp')}
              </Text>
              <Text
                style={[
                  styles.label,
                  { color: palette.muted, marginTop: 14 },
                ]}>
                {t('settings.widgetPreviewLabel')}
              </Text>
              <AndroidWidgetPreview
                opacity={settings.androidWidgetBackgroundOpacity}
                highlightId={settings.androidWidgetHighlight}
                highlightColorOverride={
                  settings.appearance === 'system' &&
                  settings.useSystemDynamicTheme
                    ? palette.accent
                    : undefined
                }
              />
              <Text
                style={[
                  styles.label,
                  { color: palette.muted, marginTop: 14 },
                ]}>
                {t('settings.widgetBackgroundOpacity')}
              </Text>
              <View style={styles.widgetOpacityRow}>
                {WIDGET_OPACITY_PRESETS.map(pct => (
                  <Pressable
                    key={pct}
                    style={[
                      styles.widgetOpacityChip,
                      segmentChromeStyle(
                        palette,
                        settings.androidWidgetBackgroundOpacity === pct,
                      ),
                    ]}
                    onPress={() =>
                      updateSettings({ androidWidgetBackgroundOpacity: pct })
                    }>
                    <Text
                      style={[
                        styles.widgetOpacityChipLabel,
                        { color: palette.text },
                        settings.androidWidgetBackgroundOpacity === pct && {
                          color: palette.accent,
                        },
                      ]}>
                      {pct}%
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.widgetBackgroundOpacityHelp')}
              </Text>
              <Text
                style={[
                  styles.label,
                  { color: palette.muted, marginTop: 14 },
                ]}>
                {t('settings.widgetHighlight')}
              </Text>
              <View style={styles.segmentRow}>
                {ANDROID_WIDGET_HIGHLIGHT_OPTIONS.map(id => (
                  <Pressable
                    key={id}
                    style={[
                      styles.segment,
                      styles.appearanceSegment,
                      segmentChromeStyle(
                        palette,
                        settings.androidWidgetHighlight === id,
                      ),
                    ]}
                    onPress={() =>
                      updateSettings({ androidWidgetHighlight: id })
                    }>
                    <Text
                      style={[
                        styles.appearanceSegmentLabel,
                        { color: palette.text },
                        settings.androidWidgetHighlight === id && {
                          color: palette.accent,
                        },
                      ]}>
                      {t(widgetHighlightLabelKey(id))}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.help, { color: palette.muted }]}>
                {t('settings.widgetHighlightHelp')}
              </Text>
            </View>
          </>
        ) : null}

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

        <SupportDeveloperSection palette={palette} />
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
  widgetPreviewOuter: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  widgetPreviewInner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  widgetPreviewDay: {
    color: '#9AA0A6',
    fontSize: 8,
    fontWeight: '600',
  },
  widgetPreviewRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  widgetPreviewCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  widgetPreviewLabelSmall: {
    fontSize: 10,
    fontWeight: '500',
  },
  widgetPreviewTime: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  widgetOpacityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  widgetOpacityChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  widgetOpacityChipLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
