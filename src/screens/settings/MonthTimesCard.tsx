/**
 * Month times, from Settings (design review 2e).
 *
 * The month view lost its tile when the tool grid went and its tab when
 * "More" went. It is reference material — a table you consult, not a daily
 * action — so it lives with the other things you set up once and come back
 * to occasionally. The Today card's own "Prayer times for the whole month"
 * row still reaches it in one tap from where the times are.
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { CalendarIcon } from '../../components/HeaderToolbarIcons';
import { SettingsGroup, SettingsNavRow } from './SettingsGroup';

function MonthTimesCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();

  return (
    <SettingsGroup>
      <SettingsNavRow
        icon={<CalendarIcon color={palette.accentSolid} size={20} />}
        title={t('nav.month')}
        subtitle={t('home.monthTimesLink')}
        onPress={() => navigation.navigate('MonthTimes' as never)}
      />
    </SettingsGroup>
  );
}

export const MonthTimesCard = memo(MonthTimesCardImpl);
