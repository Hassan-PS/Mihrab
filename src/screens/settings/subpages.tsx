/**
 * The settings sections, in one list.
 *
 * The index renders it and the root navigator registers it, so a section
 * cannot exist on one and not the other — which is the failure mode of a
 * settings screen split into pages: a card that is still in the codebase
 * but no longer reachable from anywhere.
 */
import type { ComponentType } from 'react';
import { Platform, type ColorValue } from 'react-native';
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
import { AttributionsSettingsScreen } from './pages/AttributionsSettingsScreen';
import { DailyRemindersSettingsScreen } from './pages/DailyRemindersSettingsScreen';
import { ExtraTimesSettingsScreen } from './pages/ExtraTimesSettingsScreen';
import { LocationSettingsScreen } from './pages/LocationSettingsScreen';
import { NotificationSettingsScreen } from './pages/NotificationSettingsScreen';
import { PrayerTimesSettingsScreen } from './pages/PrayerTimesSettingsScreen';
import { QuranSettingsScreen } from './pages/QuranSettingsScreen';
import { WidgetSettingsScreen } from './pages/WidgetSettingsScreen';

export type SettingsSubpageRoute = Extract<
  keyof RootStackParamList,
  `Settings${string}`
>;

/**
 * A page that hangs off a section rather than off the index.
 *
 * Some sections are a page and a half — Notifications was four unrelated
 * families in one scroll, and by the fourth nobody had read the second.
 * A nested page is how a family moves out without leaving the section
 * that owns it: it is registered on the same stack, it is NOT on the
 * settings index, and the only way in is the row its parent draws for
 * it. `NestedPageRows` draws those rows from this same list, so a page
 * declared here is reachable by construction.
 */
export type SettingsNestedPage = {
  route: SettingsSubpageRoute;
  titleKey: string;
  blurbKey: string;
  component: ComponentType<Record<string, never>>;
};

export type SettingsSubpage = {
  route: SettingsSubpageRoute;
  /** i18n key for the page's own header title. */
  titleKey: string;
  /** i18n key for the one line under it on the index. */
  blurbKey: string;
  Icon: ComponentType<{ size?: number; color: ColorValue }>;
  component: ComponentType<Record<string, never>>;
  /**
   * Platforms this section has anything to say on. Absent = all of them.
   *
   * A section is dropped from BOTH the index and the navigator together,
   * which is the whole reason this list exists — a route registered but
   * not listed is a page you can only reach by accident, and a row listed
   * but not registered crashes on tap.
   */
  platforms?: ReadonlyArray<typeof Platform.OS>;
  /** Pages that hang off this section instead of off the index. */
  children?: readonly SettingsNestedPage[];
};

const ALL_SUBPAGES: readonly SettingsSubpage[] = [
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
    children: [
      {
        route: 'SettingsExtraTimes',
        titleKey: 'settings.additionalTimes',
        blurbKey: 'settings.additionalTimesBlurb',
        component: ExtraTimesSettingsScreen,
      },
      {
        route: 'SettingsDailyReminders',
        titleKey: 'settings.dailyReminders',
        blurbKey: 'settings.dailyRemindersBlurb',
        component: DailyRemindersSettingsScreen,
      },
    ],
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
    // Android only, now that the Live Activity has moved to
    // Notifications where it belongs. `WidgetCard` renders nothing off
    // Android, so everywhere else this was a section that opened onto an
    // empty page — worse than not being there.
    platforms: ['android'],
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
    children: [
      {
        route: 'SettingsAttributions',
        titleKey: 'settings.attributions',
        blurbKey: 'settings.attributionsBlurb',
        component: AttributionsSettingsScreen,
      },
    ],
  },
] as const;

export const SETTINGS_SUBPAGES: readonly SettingsSubpage[] =
  ALL_SUBPAGES.filter(
    page => !page.platforms || page.platforms.includes(Platform.OS),
  );

/** Every section, whatever the platform — for tests that check the set. */
export const ALL_SETTINGS_SUBPAGES = ALL_SUBPAGES;

/**
 * Everything the root stack registers: the sections, then the pages that
 * hang off them.
 *
 * `backTitleKey` is what the back control says. For a section that is
 * "Settings"; for a nested page it is the section's own name, because
 * "‹ Settings" from two levels down points past where back actually
 * goes.
 */
export type RegisteredSettingsPage = {
  route: SettingsSubpageRoute;
  titleKey: string;
  component: ComponentType<Record<string, never>>;
  backTitleKey: string;
};

export const SETTINGS_STACK_PAGES: readonly RegisteredSettingsPage[] =
  SETTINGS_SUBPAGES.flatMap(page => [
    {
      route: page.route,
      titleKey: page.titleKey,
      component: page.component,
      backTitleKey: 'nav.settings',
    },
    ...(page.children ?? []).map(child => ({
      route: child.route,
      titleKey: child.titleKey,
      component: child.component,
      backTitleKey: page.titleKey,
    })),
  ]);

/** The pages hanging off one section, for the rows that open them. */
export function nestedPagesOf(
  route: SettingsSubpageRoute,
): readonly SettingsNestedPage[] {
  return SETTINGS_SUBPAGES.find(p => p.route === route)?.children ?? [];
}
