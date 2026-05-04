import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { searchPlaces, type GeocodedPlace } from '../geocoding/nominatim';
import {
  bannerEdgeStyle,
  cardEdgeStyle,
  inputChromeStyle,
  listRowBottomBorder,
} from '../theme/chrome';

type Palette = {
  bg: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  accentBg: ColorValue;
  card: ColorValue;
  flatChrome: boolean;
};

type Props = {
  palette: Palette;
  onSelectPlace: (place: GeocodedPlace) => void;
};

const DEBOUNCE_MS = 350;

export function PlaceSearchSection({ palette, onSelectPlace }: Props) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [appliedLabel, setAppliedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    const debounceTimer = setTimeout(() => {
      // Pass the active i18n locale so Nominatim returns place names in the
      // user's language ("München" for de, "Munich" for en, etc.) — matches
      // user expectation when typing in a non-English locale (#125).
      searchPlaces(query, i18n.language)
        .then(rows => {
          setResults(rows);
          setSearched(true);
        })
        .catch(e => {
          // Surface the error so we can tell whether the network is failing
          // vs. the query truly returning zero matches. Previously a thrown
          // error showed only a "no results" silence and the user could not
          // tell that anything was wrong (#125).
          if (__DEV__) {
            console.warn('searchPlaces failed:', e);
          }
          setResults([]);
          setSearched(true);
          setError(
            e instanceof Error ? e.message : t('placeSearch.searchFailed'),
          );
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer);
  }, [query, t, i18n.language]);

  useEffect(() => {
    if (query.trim().length >= 2) {
      setAppliedLabel(null);
    }
  }, [query]);

  useEffect(() => {
    if (!appliedLabel) {
      return;
    }
    const t = setTimeout(() => setAppliedLabel(null), 5000);
    return () => clearTimeout(t);
  }, [appliedLabel]);

  const handleSelectPlace = (item: GeocodedPlace) => {
    const short = item.displayName.split(',').slice(0, 2).join(',').trim();
    setAppliedLabel(short);
    setResults([]);
    setQuery('');
    setError(null);
    setSearched(false);
    onSelectPlace(item);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('placeSearch.label')}
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        placeholder={t('placeSearch.placeholder')}
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
      <Text style={[styles.hint, { color: palette.muted }]}>
        {t('placeSearch.hint')}
      </Text>
      {appliedLabel != null && (
        <View
          style={[
            styles.appliedBanner,
            bannerEdgeStyle(palette),
            {
              backgroundColor: palette.accentBg,
            },
          ]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Location applied: ${appliedLabel}`}>
          <Text style={[styles.appliedCheck, { color: palette.accent }]}>
            ✓
          </Text>
          <View style={styles.appliedTextWrap}>
            <Text style={[styles.appliedTitle, { color: palette.text }]}>
              {t('placeSearch.appliedTitle')}
            </Text>
            <Text style={[styles.appliedSubtitle, { color: palette.muted }]}>
              {appliedLabel}
            </Text>
          </View>
        </View>
      )}
      {loading && (
        <ActivityIndicator
          style={styles.loader}
          color={palette.accent}
          size="small"
        />
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {!loading &&
        !error &&
        searched &&
        results.length === 0 &&
        query.trim().length >= 2 && (
          <Text style={[styles.noResults, { color: palette.muted }]}>
            {t('placeSearch.noResults')}
          </Text>
        )}
      {!loading && results.length > 0 && (
        <View
          style={[
            styles.listCard,
            cardEdgeStyle(palette),
            { backgroundColor: palette.card },
          ]}>
          {results.map((item, i) => (
            <Pressable
              key={`${item.latitude},${item.longitude},${i}`}
              accessibilityRole="button"
              accessibilityLabel={item.displayName}
              onPress={() => handleSelectPlace(item)}
              style={[
                styles.resultRow,
                listRowBottomBorder(palette, i === results.length - 1),
              ]}>
              <Text style={[styles.resultTitle, { color: palette.text }]}>
                {item.displayName.split(',').slice(0, 2).join(',').trim()}
              </Text>
              <Text style={[styles.resultMeta, { color: palette.muted }]}>
                {item.latitude.toFixed(4)}°, {item.longitude.toFixed(4)}°
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  loader: {
    alignSelf: 'flex-start',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  noResults: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  appliedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  appliedCheck: {
    fontSize: 18,
    fontWeight: '700',
  },
  appliedTextWrap: {
    flex: 1,
  },
  appliedTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  appliedSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  listCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  resultMeta: {
    fontSize: 13,
    marginTop: 4,
  },
});
