export type NotificationSoundId =
  | 'default'
  | 'adhan_makkah'
  | 'adhan_madina'
  | 'adhan_aqsa';

export type NotificationSoundOption = {
  id: NotificationSoundId;
  labelKey: string;
  helpKey: string;
  androidChannelId: string;
  androidSound?: string;
  iosSound: string;
};

export const NOTIFICATION_SOUND_OPTIONS: NotificationSoundOption[] = [
  {
    id: 'default',
    labelKey: 'settings.notificationSoundDefault',
    helpKey: 'settings.notificationSoundDefaultHelp',
    androidChannelId: 'prayer-times-default',
    iosSound: 'default',
  },
  {
    id: 'adhan_makkah',
    labelKey: 'settings.notificationSoundMakkah',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-makkah',
    androidSound: 'adhan_makkah',
    iosSound: 'adhan_makkah.caf',
  },
  {
    id: 'adhan_madina',
    labelKey: 'settings.notificationSoundMadina',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-madina',
    androidSound: 'adhan_madina',
    iosSound: 'adhan_madina.caf',
  },
  {
    id: 'adhan_aqsa',
    labelKey: 'settings.notificationSoundAqsa',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-aqsa',
    androidSound: 'adhan_aqsa',
    iosSound: 'adhan_aqsa.caf',
  },
];

export function coerceNotificationSoundId(value: unknown): NotificationSoundId {
  if (
    typeof value === 'string' &&
    NOTIFICATION_SOUND_OPTIONS.some(option => option.id === value)
  ) {
    return value as NotificationSoundId;
  }
  return 'default';
}

export function getNotificationSoundOption(
  id: NotificationSoundId,
): NotificationSoundOption {
  return (
    NOTIFICATION_SOUND_OPTIONS.find(option => option.id === id) ??
    NOTIFICATION_SOUND_OPTIONS[0]
  );
}
