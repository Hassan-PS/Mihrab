/**
 * The rows that open a section's nested pages.
 *
 * Drawn from `subpages.tsx` rather than written out on each parent, for
 * the same reason the index is: a nested page whose row somebody forgot
 * to add is a setting that still exists, still compiles, and cannot be
 * reached from anywhere in the app.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import { SettingsGroup, SettingsNavRow } from './SettingsGroup';
import { nestedPagesOf, type SettingsSubpageRoute } from './subpages';

export function NestedPageRows({
  parent,
  title,
}: {
  parent: SettingsSubpageRoute;
  /** Optional heading over the group, when the rows need naming. */
  title?: string;
}) {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const pages = nestedPagesOf(parent);
  if (pages.length === 0) return null;
  return (
    <SettingsGroup title={title}>
      {pages.map(page => (
        <SettingsNavRow
          key={page.route}
          title={t(page.titleKey)}
          subtitle={t(page.blurbKey)}
          // Every nested route is paramless; the cast is the price of
          // holding them in one list rather than seven typed call sites.
          onPress={() => navigation.navigate(page.route as 'SettingsAbout')}
        />
      ))}
    </SettingsGroup>
  );
}
