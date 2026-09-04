/**
 * The settings sections, in one list.
 *
 * The index renders it and the root navigator registers it, so a section
 * cannot exist on one and not the other — which is the failure mode of a
 * settings screen split into pages: a card that is still in the codebase
 * but no longer reachable from anywhere.
 */
import type { ComponentType } from 'react';
import type { ColorValue } from 'react-native';
import type { RootStackParamList } from '../../navigation/types';
import {
  AboutIcon,
  AppearanceIcon,
  LocationIcon,
  NotificationsIcon,
  PrayerTimesIcon,
  QuranIcon,
  WidgetsIcon,
} from './SettingsSectionIcons';
import { AboutSettingsScreen } from './pages/AboutSettingsScreen';
import { AppearanceSettingsScreen } from './pages/AppearanceSettingsScreen';
import { LocationSettingsScreen } from './pages/LocationSettingsScreen';
import { NotificationSettingsScreen } from './pages/NotificationSettingsScreen';
import { PrayerTimesSettingsScreen } from './pages/PrayerTimesSettingsScreen';
import { QuranSettingsScreen } from './pages/QuranSettingsScreen';
import { WidgetSettingsScreen } from './pages/WidgetSettingsScreen';

export type SettingsSubpageRoute = Extract<
  keyof RootStackParamList,
  `Settings${string}`
>;

export type SettingsSubpage = {
  route: SettingsSubpageRoute;
  /** i18n key for the page's own header title. */
  titleKey: string;
  /** i18n key for the one line under it on the index. */
  blurbKey: string;
  Icon: ComponentType<{ size?: number; color: ColorValue }>;
  component: ComponentType<Record<string, never>>;
};

export const SETTINGS_SUBPAGES: readonly SettingsSubpage[] = [
  {
    route: 'SettingsPrayerTimes',
    titleKey: 'settings.sectionPrayerTimes',
    blurbKey: 'settings.sectionPrayerTimesBlurb',
    Icon: PrayerTimesIcon,
    component: PrayerTimesSettingsScreen,
  },
  {
    route: 'SettingsNotifications',
    titleKey: 'settings.sectionNotifications',
    blurbKey: 'settings.sectionNotificationsBlurb',
    Icon: NotificationsIcon,
    component: NotificationSettingsScreen,
  },
  {
    route: 'SettingsLocation',
    titleKey: 'settings.sectionLocation',
    blurbKey: 'settings.sectionLocationBlurb',
    Icon: LocationIcon,
    component: LocationSettingsScreen,
  },
  {
    route: 'SettingsAppearance',
    titleKey: 'settings.sectionAppearance',
    blurbKey: 'settings.sectionAppearanceBlurb',
    Icon: AppearanceIcon,
    component: AppearanceSettingsScreen,
  },
  {
    route: 'SettingsWidgets',
    titleKey: 'settings.sectionWidgets',
    blurbKey: 'settings.sectionWidgetsBlurb',
    Icon: WidgetsIcon,
    component: WidgetSettingsScreen,
  },
  {
    route: 'SettingsQuran',
    titleKey: 'settings.sectionQuran',
    blurbKey: 'settings.sectionQuranBlurb',
    Icon: QuranIcon,
    component: QuranSettingsScreen,
  },
  {
    route: 'SettingsAbout',
    titleKey: 'settings.sectionAbout',
    blurbKey: 'settings.sectionAboutBlurb',
    Icon: AboutIcon,
    component: AboutSettingsScreen,
  },
] as const;
