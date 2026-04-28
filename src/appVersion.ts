import { AppVersionModule } from './native/AppVersion';

export type InstalledAppVersion = {
  versionName: string;
  buildNumber: string;
};

function fromNative(): InstalledAppVersion {
  return {
    versionName: AppVersionModule?.versionName?.trim() || 'unknown',
    buildNumber: AppVersionModule?.buildNumber?.trim() || 'unknown',
  };
}

export function getInstalledAppVersionLabel(): string {
  const v = fromNative();
  return `${v.versionName} (${v.buildNumber})`;
}
