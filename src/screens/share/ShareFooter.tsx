// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme).
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import { MIHRAB_WEBSITE_LABEL } from '../../config/links';

/**
 * The foot of the sheet: where the times came from, and a caution.
 *
 * A timetable that does not say where its numbers came from cannot be
 * checked, and one that does not say it is calculated invites people to
 * treat it as a local mosque's own. Both lines belong on the paper rather
 * than in the app that made it, because the paper is what travels.
 */
type Props = {
  t: TFunction;
  /** Provider the times were fetched from, in words. */
  sourceLine: string;
  rtl: boolean;
};

function ShareFooterImpl({ t, sourceLine, rtl }: Props) {
  const align = rtl ? ('right' as const) : ('left' as const);
  return (
    <View
      style={[styles.footer, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <View style={styles.left}>
        <Text style={[styles.source, { textAlign: align }]}>{sourceLine}</Text>
        <Text style={[styles.note, { textAlign: align }]}>
          {t(
            'share.footerNote',
            'Calculated times. Follow your local mosque where it differs.',
          )}
        </Text>
      </View>
      <Text style={styles.site}>{MIHRAB_WEBSITE_LABEL}</Text>
    </View>
  );
}

export const ShareFooter = memo(ShareFooterImpl);

const styles = StyleSheet.create({
  footer: {
    paddingTop: 8,
    // Never squeezed. The table above takes the page's slack with
    // `flex: 1`, and in a language whose banner runs a line taller — 
    // Arabic does — the footer was the thing that got clipped.
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: { flex: 1, gap: 1 },
  source: { color: '#4b5563', fontSize: 9 },
  note: { color: '#6b7280', fontSize: 9 },
  site: { color: '#166534', fontSize: 9, fontWeight: '700' },
});
