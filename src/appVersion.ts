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

/**
 * Just the marketing version — `2.18.6`, or `2.18.6-beta` on the beta
 * channel, where gradle appends a `versionNameSuffix`.
 *
 * The what's-new surface compares this against the version the user last
 * ran, and its comparison drops anything after the numeric part: a beta
 * of a release has seen what that release has to say.
 */
export function getInstalledAppVersionName(): string {
  return fromNative().versionName;
}
