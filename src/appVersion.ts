import { NativeModules } from 'react-native';

type AppVersionNative = {
  versionName?: string;
  buildNumber?: string;
};

export type InstalledAppVersion = {
  versionName: string;
  buildNumber: string;
};

function fromNative(): InstalledAppVersion {
  const m = NativeModules.AppVersion as AppVersionNative | undefined;
  return {
    versionName: m?.versionName?.trim() || 'unknown',
    buildNumber: m?.buildNumber?.trim() || 'unknown',
  };
}

export function getInstalledAppVersionLabel(): string {
  const v = fromNative();
  return `${v.versionName} (${v.buildNumber})`;
}
