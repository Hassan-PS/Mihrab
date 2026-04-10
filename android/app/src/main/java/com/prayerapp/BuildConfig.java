package com.prayerapp;

/**
 * Compatibility shim for React Native generated entrypoint.
 * Keeps references to old package BuildConfig working after appId rename.
 */
public final class BuildConfig {
  public static final boolean IS_NEW_ARCHITECTURE_ENABLED =
      com.prayer_times.BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
  public static final boolean IS_EDGE_TO_EDGE_ENABLED =
      com.prayer_times.BuildConfig.IS_EDGE_TO_EDGE_ENABLED;

  private BuildConfig() {}
}
