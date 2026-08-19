export type NotificationSoundId =
  | 'default'
  | 'custom'
  | 'adhan_abdul_basit'
  | 'adhan_abdul_ghaffar'
  | 'adhan_abdul_hakam'
  | 'adhan_makkah'
  | 'adhan_madina'
  | 'adhan_aqsa'
  | 'adhan_egypt'
  | 'adhan_halab'
  | 'adhan_al_hussaini'
  | 'adhan_bakir_bash'
  | 'adhan_hafez'
  | 'adhan_hafiz_murad'
  | 'adhan_minshawi'
  | 'adhan_naghshbandi'
  | 'adhan_saber'
  | 'adhan_sharif_doman'
  | 'adhan_yusuf_islam';

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
    id: 'adhan_abdul_basit',
    labelKey: 'settings.notificationSoundAbdulBasit',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-abdul-basit',
    androidSound: 'adhan_abdul_basit',
    iosSound: 'adhan_abdul_basit.caf',
  },
  {
    id: 'adhan_abdul_ghaffar',
    labelKey: 'settings.notificationSoundAbdulGhaffar',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-abdul-ghaffar',
    androidSound: 'adhan_abdul_ghaffar',
    iosSound: 'adhan_abdul_ghaffar.caf',
  },
  {
    id: 'adhan_abdul_hakam',
    labelKey: 'settings.notificationSoundAbdulHakam',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-abdul-hakam',
    androidSound: 'adhan_abdul_hakam',
    iosSound: 'adhan_abdul_hakam.caf',
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
  {
    id: 'adhan_egypt',
    labelKey: 'settings.notificationSoundEgypt',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-egypt',
    androidSound: 'adhan_egypt',
    iosSound: 'adhan_egypt.caf',
  },
  {
    id: 'adhan_halab',
    labelKey: 'settings.notificationSoundHalab',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-halab',
    androidSound: 'adhan_halab',
    iosSound: 'adhan_halab.caf',
  },
  {
    id: 'adhan_al_hussaini',
    labelKey: 'settings.notificationSoundAlHussaini',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-al-hussaini',
    androidSound: 'adhan_al_hussaini',
    iosSound: 'adhan_al_hussaini.caf',
  },
  {
    id: 'adhan_bakir_bash',
    labelKey: 'settings.notificationSoundBakirBash',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-bakir-bash',
    androidSound: 'adhan_bakir_bash',
    iosSound: 'adhan_bakir_bash.caf',
  },
  {
    id: 'adhan_hafez',
    labelKey: 'settings.notificationSoundHafez',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-hafez',
    androidSound: 'adhan_hafez',
    iosSound: 'adhan_hafez.caf',
  },
  {
    id: 'adhan_hafiz_murad',
    labelKey: 'settings.notificationSoundHafizMurad',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-hafiz-murad',
    androidSound: 'adhan_hafiz_murad',
    iosSound: 'adhan_hafiz_murad.caf',
  },
  {
    id: 'adhan_minshawi',
    labelKey: 'settings.notificationSoundMinshawi',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-minshawi',
    androidSound: 'adhan_minshawi',
    iosSound: 'adhan_minshawi.caf',
  },
  {
    id: 'adhan_naghshbandi',
    labelKey: 'settings.notificationSoundNaghshbandi',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-naghshbandi',
    androidSound: 'adhan_naghshbandi',
    iosSound: 'adhan_naghshbandi.caf',
  },
  {
    id: 'adhan_saber',
    labelKey: 'settings.notificationSoundSaber',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-saber',
    androidSound: 'adhan_saber',
    iosSound: 'adhan_saber.caf',
  },
  {
    id: 'adhan_sharif_doman',
    labelKey: 'settings.notificationSoundSharifDoman',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-sharif-doman',
    androidSound: 'adhan_sharif_doman',
    iosSound: 'adhan_sharif_doman.caf',
  },
  {
    id: 'adhan_yusuf_islam',
    labelKey: 'settings.notificationSoundYusufIslam',
    helpKey: 'settings.notificationSoundVoiceHelp',
    androidChannelId: 'prayer-times-adhan-yusuf-islam',
    androidSound: 'adhan_yusuf_islam',
    iosSound: 'adhan_yusuf_islam.caf',
  },
  {
    id: 'custom',
    labelKey: 'settings.notificationSoundCustom',
    helpKey: 'settings.notificationSoundCustomHelp',
    // BOTH OF THESE ARE PLACEHOLDERS, and nothing should ever schedule
    // against them. The real channel and the real sound file depend on which
    // recording the user imported, so they arrive at runtime through
    // `registerCustomAdhan` and are read back through `resolveSoundTargets`.
    // They are the default option's values so that a caller which reaches for
    // the raw fields anyway gets a working notification rather than a silent
    // one.
    androidChannelId: 'prayer-times-default',
    iosSound: 'default',
  },
];

/**
 * The adhan the user imported, as the notification layer needs to address it.
 *
 * Everything here is decided by the file itself, which is why none of it can
 * live in the table above. On Android the channel id carries a token derived
 * from the file's bytes, because a channel's sound cannot be changed after it
 * is created — a fixed id would mean importing a second adhan and going on
 * hearing the first. On iOS the same token names the converted clip in
 * `Library/Sounds`, for the same reason.
 */
export type CustomAdhanSound = {
  /** What to show the user — the original file's name. */
  name: string;
  /** Derived from the file's contents; identifies this exact recording. */
  token: string;
  /** Android: the channel built around this file. */
  channelId?: string;
  /** iOS: the converted clip's filename inside `Library/Sounds`. */
  soundName?: string;
  /** iOS: absolute path to the full-length original, for foreground playback. */
  path?: string;
  durationMs: number;
  /** iOS trims to fit the 30s notification-sound ceiling; Android does not. */
  trimmed: boolean;
};

let registeredCustom: CustomAdhanSound | null = null;

/**
 * Tell the notification layer which recording is currently imported, or null
 * when there is none.
 *
 * A setter rather than a native call so this module stays importable — and
 * testable — without a native module behind it.
 */
export function registerCustomAdhan(sound: CustomAdhanSound | null): void {
  registeredCustom = sound;
}

export function getRegisteredCustomAdhan(): CustomAdhanSound | null {
  return registeredCustom;
}

/**
 * Where a notification should actually point, for a given choice.
 *
 * FALLS BACK TO THE DEFAULT SOUND WHEN 'custom' IS SELECTED BUT NOTHING IS
 * IMPORTED, which is not a hypothetical: the setting persists, the file does
 * not survive a reinstall, and the user can delete the recording from the
 * picker while it is still the selected sound. Scheduling against a channel
 * that was never created is a notification that arrives silently, which reads
 * as a missed prayer rather than as a missing file.
 */
export function resolveSoundTargets(id: NotificationSoundId): {
  androidChannelId: string;
  iosSound: string;
} {
  const option = getNotificationSoundOption(id);
  if (id !== 'custom') {
    return {
      androidChannelId: option.androidChannelId,
      iosSound: option.iosSound,
    };
  }
  const fallback = getNotificationSoundOption('default');
  return {
    androidChannelId: registeredCustom?.channelId ?? fallback.androidChannelId,
    iosSound: registeredCustom?.soundName ?? fallback.iosSound,
  };
}

/** Is 'custom' currently a choice the user can actually hear? */
export function isCustomAdhanReady(): boolean {
  return Boolean(registeredCustom?.channelId ?? registeredCustom?.soundName);
}

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
