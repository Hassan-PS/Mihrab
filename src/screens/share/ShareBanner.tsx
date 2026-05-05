// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * Top banner of the share-image composite — task #64 split.
 *
 * Owns the app-name + GitHub-link header row, QR code, and the
 * Hijri / Gregorian / location captions. Intentionally uses absolute
 * style values (not theme tokens) because the share image must look
 * identical regardless of the user's in-app theme — the rendered PNG
 * is sent to people who don't have the app.
 */
type Props = {
  islamicMonthName: string;
  gregorianMonthName: string;
  locationName: string;
};

function ShareBannerImpl({
  islamicMonthName,
  gregorianMonthName,
  locationName,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <View style={[styles.bannerTop, { flexDirection: 'row' }]}>
        <View style={[styles.bannerLeft, { alignItems: 'flex-start' }]}>
          <Text style={styles.appName}>{t('app.name')}</Text>
          <Text style={styles.githubLink}>github.com/Hassan-PS/Mihrab</Text>
        </View>
        <View style={styles.bannerRight}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../../assets/qr-code.png')}
            style={styles.qrCode}
            resizeMode="contain"
          />
        </View>
      </View>
      <View style={styles.bannerBottom}>
        <Text style={styles.islamicMonth}>{islamicMonthName}</Text>
        <Text style={styles.gregorianMonth}>{gregorianMonthName}</Text>
        <Text style={styles.locationText}>{locationName}</Text>
      </View>
    </View>
  );
}

export const ShareBanner = memo(ShareBannerImpl);

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#166534',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerTop: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: { flex: 1 },
  bannerRight: { width: 60, height: 60 },
  qrCode: { width: 60, height: 60 },
  bannerBottom: { marginTop: 10, gap: 2 },
  appName: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  githubLink: { color: '#dcfce7', fontSize: 11 },
  islamicMonth: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  gregorianMonth: { color: '#dcfce7', fontSize: 12 },
  locationText: { color: '#dcfce7', fontSize: 11 },
});
