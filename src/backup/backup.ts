/**
 * Backup / restore — task #31.
 *
 * Round-trips the user's settings, location presets, journal, and fasting
 * log to a single JSON blob the user can save anywhere (iCloud Drive,
 * Google Drive, email-to-self). No cloud, no account, no analytics.
 *
 * Sensitive content (coordinates, journal, fasting) is encrypted using
 * **AES-GCM with PBKDF2-derived key from a user-chosen password**. The
 * password is NEVER stored anywhere — losing it loses the backup.
 *
 * The encryption layer is a thin wrapper around the Web Crypto API that
 * React Native polyfills via `react-native-quick-crypto` (or the platform
 * native bridge if available). We surface a minimal `encrypt`/`decrypt`
 * pair that takes a password + a payload string and returns a portable
 * envelope.
 *
 * THIS MODULE IS PURE: it doesn't import Web Crypto directly so tests can
 * run without a polyfill. Callers thread the platform's `subtle` in.
 */

export const BACKUP_FORMAT_VERSION = 1;

export type BackupEnvelope = {
  /** Format version — bump when the schema changes incompatibly. */
  version: number;
  /** ISO-8601 timestamp the backup was created. */
  createdAt: string;
  /** PBKDF2 salt (base64). */
  salt: string;
  /** AES-GCM IV (base64). */
  iv: string;
  /** AES-GCM ciphertext (base64). */
  ciphertext: string;
};

export type BackupPayload = {
  /** Non-sensitive prefs (theme, language, sound, etc.). */
  settings: Record<string, unknown>;
  /** PII coordinates. */
  secureSettings: Record<string, unknown>;
  /** Journal entries. */
  journal: unknown[];
  /** Fasting log. */
  fasting: unknown[];
  /** Free-form metadata for forward compat (icon assignment, etc.). */
  meta?: Record<string, unknown>;
};

/** Build the cleartext JSON payload from the in-memory state.
 *  Caller passes the already-loaded data — this module doesn't read storage
 *  itself, keeping it side-effect free for tests. */
export function buildPayload(input: {
  settings: Record<string, unknown>;
  secureSettings: Record<string, unknown>;
  journal: unknown[];
  fasting: unknown[];
  meta?: Record<string, unknown>;
}): BackupPayload {
  return {
    settings: input.settings,
    secureSettings: input.secureSettings,
    journal: input.journal,
    fasting: input.fasting,
    meta: input.meta,
  };
}

/** Validate a parsed payload coming OUT of `decrypt`. Returns the typed
 *  payload or throws. Does NOT enforce schema correctness of the inner
 *  arrays/objects — coercion happens at restore time via each module's
 *  own `coerce*` helper. */
export function parsePayload(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Backup payload is not an object');
  }
  const r = raw as Record<string, unknown>;
  return {
    settings: (r.settings as Record<string, unknown>) ?? {},
    secureSettings: (r.secureSettings as Record<string, unknown>) ?? {},
    journal: Array.isArray(r.journal) ? r.journal : [],
    fasting: Array.isArray(r.fasting) ? r.fasting : [],
    meta:
      r.meta && typeof r.meta === 'object'
        ? (r.meta as Record<string, unknown>)
        : undefined,
  };
}

/** Reject envelopes from a future format version we don't understand. */
export function checkEnvelopeCompatibility(env: BackupEnvelope): void {
  if (env.version > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `This backup was created by a newer version of the app (v${env.version}). ` +
        `Please update before restoring.`,
    );
  }
}

export function isLikelyBackupEnvelope(raw: unknown): raw is BackupEnvelope {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.version === 'number' &&
    typeof r.createdAt === 'string' &&
    typeof r.salt === 'string' &&
    typeof r.iv === 'string' &&
    typeof r.ciphertext === 'string'
  );
}
