/**
 * Sound design — task #43.
 *
 * Three concerns:
 *
 *   1. **Adhan audio audit metadata** — each bundled adhan voice is
 *      catalogued with its target loudness (LUFS) and length so a release
 *      check can verify normalisation and 30-second iOS notification cap
 *      compliance. This module owns the catalogue; the actual audio
 *      processing happens at build time (ffmpeg pipeline, future task).
 *
 *   2. **UI sounds gate** — pure helper that decides whether a UI sound
 *      should play given the user's setting + system context (silent mode,
 *      do-not-disturb, tahajjud window where ALL UI sounds suppress).
 *
 *   3. **Critical Alert education** — a flag the onboarding flow checks
 *      to prompt the iOS Critical Alert permission for Fajr (so adhan
 *      fires through silent mode for those who opt in).
 */

export type AdhanSoundProfile = {
  id: string;
  /** Length in seconds — must be ≤ 30 for iOS UNNotification compatibility. */
  durationSeconds: number;
  /** Target integrated loudness in LUFS. Convention: -16 LUFS. */
  targetLufs: number;
  /** Whether the file ships pre-normalised (audited at build time). */
  normalized: boolean;
};

/** Stub catalogue — populated as audio files are normalised in the build pipeline. */
export const ADHAN_PROFILES: ReadonlyArray<AdhanSoundProfile> = [
  { id: 'default', durationSeconds: 0, targetLufs: -16, normalized: true },
  { id: 'mishary', durationSeconds: 28, targetLufs: -16, normalized: false },
  { id: 'abdulBasit', durationSeconds: 26, targetLufs: -16, normalized: false },
  { id: 'husary', durationSeconds: 27, targetLufs: -16, normalized: false },
];

export function findAdhanProfile(id: string): AdhanSoundProfile | undefined {
  return ADHAN_PROFILES.find(p => p.id === id);
}

/** Returns ids of any adhan profiles that need the LUFS pipeline run. */
export function profilesNeedingNormalization(): string[] {
  return ADHAN_PROFILES.filter(p => !p.normalized && p.id !== 'default').map(
    p => p.id,
  );
}

/** Returns ids of any profiles that exceed the 30-second iOS limit. */
export function profilesExceedingIosLimit(): string[] {
  return ADHAN_PROFILES.filter(p => p.durationSeconds > 30).map(p => p.id);
}

// ─── UI sound gate ──────────────────────────────────────────────────────

export type UiSoundContext = {
  /** User-toggled "play UI sounds" setting (default OFF). */
  uiSoundsEnabled: boolean;
  /** Whether we're currently in the Tahajjud window (all UI sounds suppress). */
  inTahajjudWindow: boolean;
  /** Whether the device is in silent mode / DND (best-effort detection). */
  silentMode?: boolean;
};

/**
 * Returns true when the UI should play a sound effect for the given context.
 * Conservative: defaults to false unless the user explicitly opted in AND
 * none of the suppression conditions apply.
 */
export function shouldPlayUiSound(ctx: UiSoundContext): boolean {
  if (!ctx.uiSoundsEnabled) return false;
  if (ctx.inTahajjudWindow) return false;
  if (ctx.silentMode) return false;
  return true;
}
