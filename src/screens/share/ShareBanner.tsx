// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import { MIHRAB_WEBSITE_LABEL } from '../../config/links';

/**
 * The head of the month sheet.
 *
 * ── WHAT A SHEET ON A WALL HAS TO SAY ─────────────────────────────────
 *
 * This banner used to carry the app's name, a URL, a small QR and three
 * lines of month and coordinates. That is enough for the person who made
 * it and not enough for anyone else: a prayer timetable pinned up in a
 * hallway is read by people who did not choose its settings, and the
 * first question any of them has is whose times these are. Printed sheets
 * from mosques answer it in the header — the place, the month in both
 * calendars, and the reckoning the times were computed by — because a
 * timetable without its method is a list of numbers you cannot check.
 *
 * So: the city, both calendars, the calculation method and the Asr
 * school, stated. The location is a place name rather than the
 * coordinates it used to print, which told a reader nothing they could
 * use and told a stranger where the sender lives to four decimals.
 *
 * The QR is large enough to scan from a photograph of the wall, and the
 * store badges beside it say what the code leads to. A bare QR on a
 * sheet is a thing most people will not point a camera at.
 *
 * Absolute colours, not theme tokens: the image leaves the phone and is
 * read by people who do not have the app, so it must not vary with the
 * sender's dark mode.
 */
type Props = {
  t: TFunction;
  islamicMonthName: string;
  gregorianMonthName: string;
  locationName: string;
  /** e.g. "Muslim World League · Asr: Shafi'i" — the reckoning, stated. */
  methodLine: string;
  /** True when the SHEET's language runs right to left. */
  rtl: boolean;
};

function ShareBannerImpl({
  t,
  islamicMonthName,
  gregorianMonthName,
  locationName,
  methodLine,
  rtl,
}: Props) {
  const align = rtl ? ('flex-end' as const) : ('flex-start' as const);
  const textAlign = rtl ? ('right' as const) : ('left' as const);
  return (
    <View style={[styles.banner, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <View style={[styles.left, { alignItems: align }]}>
        <Text style={[styles.appName, { textAlign }]}>{t('app.name')}</Text>
        <Text style={[styles.tagline, { textAlign }]}>
          {t('share.tagline', 'Prayer times, qibla and the Qur’an')}
        </Text>

        <View style={styles.rule} />

        <Text style={[styles.forPlace, { textAlign }]}>
          {t('share.timesFor', {
            defaultValue: 'Prayer times for {{place}}',
            place: locationName,
          })}
        </Text>
        <Text style={[styles.islamicMonth, { textAlign }]}>
          {islamicMonthName}
        </Text>
        <Text style={[styles.gregorianMonth, { textAlign }]}>
          {gregorianMonthName}
        </Text>
        <Text style={[styles.method, { textAlign }]}>{methodLine}</Text>
      </View>

      <View style={styles.right}>
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../../assets/qr-code.png')}
          style={styles.qrCode}
          resizeMode="contain"
        />
        <Text style={styles.qrCaption}>
          {t('share.scanForApp', 'Scan to get the app')}
        </Text>
        <View style={styles.badges}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../../assets/badge-appstore.png')}
            style={styles.badge}
            resizeMode="contain"
          />
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../../assets/badge-googleplay.png')}
            style={styles.badge}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.siteLink}>{MIHRAB_WEBSITE_LABEL}</Text>
      </View>
    </View>
  );
}

export const ShareBanner = memo(ShareBannerImpl);

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#166534',
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flex: 1, gap: 1 },
  right: { width: 176, alignItems: 'center', gap: 5 },
  appName: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  tagline: { color: '#bbf7d0', fontSize: 11 },
  rule: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: '#3f8a5f',
    marginVertical: 8,
  },
  forPlace: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  islamicMonth: { color: '#ffffff', fontSize: 19, fontWeight: '800', marginTop: 2 },
  gregorianMonth: { color: '#dcfce7', fontSize: 13 },
  method: { color: '#a7d7bb', fontSize: 10, marginTop: 6 },
  // Big enough to survive being photographed off a wall, which is how a
  // sheet like this actually spreads.
  qrCode: { width: 108, height: 108, backgroundColor: '#ffffff', borderRadius: 6 },
  qrCaption: { color: '#dcfce7', fontSize: 9, textAlign: 'center' },
  badges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // The official badges, at their own aspect ratios (503×168, 564×168).
  badge: { width: 80, height: 27 },
  siteLink: { color: '#bbf7d0', fontSize: 9 },
});
