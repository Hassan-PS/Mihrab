/**
 * Settings → About → Attributions.
 *
 * Religious content and bundled assets are attributed under their
 * licences — CC BY 3.0 for the Qur'an text, SIL OFL for the Arabic
 * fonts, and so on. This was eleven-point centred text crammed under the
 * version number at the foot of About, where it read as small print. It
 * is not small print: it names whose work this app is made of, and every
 * line links to the source so the claim can be checked.
 *
 * The riwayat are here too, though they are downloaded rather than
 * bundled — an attributions list that names only what ships answers the
 * wrong question. Someone reading Warsh in this app should be able to
 * find out here whose text it is.
 */
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { SettingsGroup } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';

type Credit = { label: string; sub: string; url: string };

export function AttributionsSettingsScreen() {
  const { t } = useTranslation();

  const scripture: Credit[] = [
    {
      label: t('attributions.quranText', {
        defaultValue: 'Quran Uthmani text',
      }),
      sub: 'Tanzil.net · CC BY 3.0',
      url: 'https://tanzil.net/',
    },
    {
      label: t('attributions.mushafImages', {
        defaultValue: 'Mushaf page images (604)',
      }),
      sub: 'Hassan-PS/Mihrab · KFGQPC fonts · via quran/quran.com-images',
      url: 'https://github.com/Hassan-PS/Mihrab/releases/tag/mushaf-assets-v2',
    },
    {
      label: t('attributions.quranGeometry', {
        defaultValue:
          'Ayah position data (quran.com / Quran for Android project)',
      }),
      sub: 'quran.com · files.quran.app ayahinfo',
      url: 'https://github.com/quran/quran_android',
    },
    {
      label: t('attributions.mushafMetadata', {
        defaultValue: 'Mushaf page metadata',
      }),
      sub: 'alquran.cloud /v1/meta · Tanzil-derived · CC BY 3.0',
      url: 'https://alquran.cloud/api',
    },
    {
      label: t('attributions.riwayat', {
        defaultValue:
          'Warsh, Qālūn and Shuʿbah texts (downloaded, not bundled)',
      }),
      sub: 'quranpedia.net · King Fahd Glorious Quran Printing Complex',
      url: 'https://quranpedia.net',
    },
    {
      label: t('attributions.riwayahLines', {
        defaultValue: 'Printed line geometry for those muṣḥafs',
      }),
      sub: 'quranpedia/quran-svg ayah polygons · CC0',
      url: 'https://github.com/quranpedia/quran-svg',
    },
  ];

  const recitation: Credit[] = [
    {
      label: t('attributions.recitation', {
        defaultValue:
          'Recitation audio (42 reciters): EveryAyah.com · word timings: quran-align (CC BY 4.0)',
      }),
      sub: 'everyayah.com · cpfair/quran-align',
      url: 'https://everyayah.com/',
    },
  ];

  const meaning: Credit[] = [
    {
      label: t('attributions.translationEditions', {
        defaultValue: 'Translation editions (14)',
      }),
      sub: 'alquran.cloud · Tanzil-derived · CC BY 3.0',
      url: 'https://alquran.cloud/',
    },
    {
      label: t('attributions.tafsir', {
        defaultValue:
          'Tafsir texts: Ibn Kathir, Maarif-ul-Quran, al-Muyassar',
      }),
      sub: 'spa5k/tafsir_api · Quran.com tafsir corpus',
      url: 'https://github.com/spa5k/tafsir_api',
    },
    {
      label: t('attributions.sahihIntl', {
        defaultValue: 'Sahih International (English)',
      }),
      sub: 'public domain · via Tanzil',
      url: 'https://tanzil.net/trans/',
    },
    {
      label: t('attributions.pickthall', {
        defaultValue: 'Pickthall (English)',
      }),
      sub: 'public domain',
      url: 'https://tanzil.net/trans/',
    },
    {
      label: t('attributions.hisnulMuslim', {
        defaultValue: 'Hisnul Muslim duas',
      }),
      sub: 'rn0x/hisn_almuslim_json · MIT',
      url: 'https://github.com/rn0x/hisn_almuslim_json',
    },
  ];

  const typefaces: Credit[] = [
    {
      label: t('attributions.amiriFonts', {
        defaultValue: 'Amiri & Amiri Quran fonts',
      }),
      sub: 'aliftype/amiri · SIL OFL 1.1',
      url: 'https://github.com/aliftype/amiri',
    },
  ];

  return (
    <SettingsPage>
      <SettingsGroup title={t('attributions.groupScripture', 'The text')}>
        {scripture.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
      <SettingsGroup title={t('attributions.groupRecitation', 'Recitation')}>
        {recitation.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
      <SettingsGroup
        title={t('attributions.groupMeaning', 'Translation and tafsir')}>
        {meaning.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
      {/* The footer sits on the last group, where a reader who has gone
          through the list arrives at it. */}
      <SettingsGroup
        title={t('attributions.groupTypefaces', 'Typefaces')}
        footer={t(
          'attributions.footer',
          'Every line links to the source it came from.',
        )}>
        {typefaces.map(c => (
          <CreditRow key={c.url + c.label} credit={c} />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

function CreditRow({ credit }: { credit: Credit }) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.row}>
      <Text
        accessibilityRole="link"
        accessibilityLabel={`${credit.label} — ${credit.sub}`}
        onPress={() => {
          void Linking.openURL(credit.url);
        }}>
        <Text style={[styles.label, { color: palette.text }]}>
          {credit.label}
        </Text>
        {'\n'}
        <Text style={[styles.sub, { color: palette.accent }]}>
          {credit.sub}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontSize: 15, lineHeight: 21 },
  sub: { fontSize: 13, lineHeight: 19 },
});
