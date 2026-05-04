/**
 * Backup module tests — task #71.
 *
 * Covers the pure helpers in src/backup/backup.ts (envelope shape,
 * payload coercion, version compatibility check). The crypto layer
 * (encrypt / decrypt with PBKDF2 + AES-GCM) lights up in a future pass
 * once react-native-quick-crypto is wired in; this suite locks in the
 * envelope contract so that pass doesn't break existing backups.
 */

import {
  BACKUP_FORMAT_VERSION,
  buildPayload,
  checkEnvelopeCompatibility,
  isLikelyBackupEnvelope,
  parsePayload,
  type BackupEnvelope,
} from '../src/backup/backup';

describe('buildPayload', () => {
  test('returns the input fields verbatim', () => {
    const p = buildPayload({
      settings: { theme: 'dark' },
      secureSettings: { manualLatitude: 51.5 },
      journal: [{ id: 'j1' }],
      fasting: [{ date: '2026-03-12' }],
    });
    expect(p.settings).toEqual({ theme: 'dark' });
    expect(p.secureSettings).toEqual({ manualLatitude: 51.5 });
    expect(p.journal).toEqual([{ id: 'j1' }]);
    expect(p.fasting).toEqual([{ date: '2026-03-12' }]);
    expect(p.meta).toBeUndefined();
  });

  test('passes meta through when provided', () => {
    const p = buildPayload({
      settings: {},
      secureSettings: {},
      journal: [],
      fasting: [],
      meta: { app: 'PrayerApp', exportedAt: '2026-05-03' },
    });
    expect(p.meta).toEqual({ app: 'PrayerApp', exportedAt: '2026-05-03' });
  });
});

describe('parsePayload', () => {
  test('throws on non-objects', () => {
    expect(() => parsePayload(null)).toThrow();
    expect(() => parsePayload('a string')).toThrow();
    expect(() => parsePayload(42)).toThrow();
  });

  test('coerces missing fields to safe defaults', () => {
    const p = parsePayload({});
    expect(p.settings).toEqual({});
    expect(p.secureSettings).toEqual({});
    expect(p.journal).toEqual([]);
    expect(p.fasting).toEqual([]);
    expect(p.meta).toBeUndefined();
  });

  test('returns arrays for journal/fasting only when input is an array', () => {
    const p = parsePayload({ journal: 'oops', fasting: { not: 'array' } });
    expect(p.journal).toEqual([]);
    expect(p.fasting).toEqual([]);
  });

  test('preserves nested objects in settings and secureSettings', () => {
    const p = parsePayload({
      settings: { theme: 'dark', notif: { enabled: true } },
      secureSettings: { lat: 51.5, lng: -0.1 },
    });
    expect(p.settings.theme).toBe('dark');
    expect((p.settings.notif as Record<string, unknown>).enabled).toBe(true);
    expect(p.secureSettings.lat).toBe(51.5);
  });

  test('drops meta when not an object', () => {
    expect(parsePayload({ meta: 'string' }).meta).toBeUndefined();
    expect(parsePayload({ meta: 42 }).meta).toBeUndefined();
    expect(parsePayload({ meta: ['array'] }).meta).toBeDefined(); // arrays are objects
  });
});

describe('isLikelyBackupEnvelope', () => {
  function envelope(overrides: Partial<BackupEnvelope> = {}): BackupEnvelope {
    return {
      version: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      salt: 'c2FsdA==',
      iv: 'aXY=',
      ciphertext: 'Y2lwaGVy',
      ...overrides,
    };
  }

  test('accepts a well-formed envelope', () => {
    expect(isLikelyBackupEnvelope(envelope())).toBe(true);
  });

  test('rejects null/undefined/strings/numbers', () => {
    expect(isLikelyBackupEnvelope(null)).toBe(false);
    expect(isLikelyBackupEnvelope(undefined)).toBe(false);
    expect(isLikelyBackupEnvelope('hello')).toBe(false);
    expect(isLikelyBackupEnvelope(42)).toBe(false);
  });

  test('rejects objects missing required fields', () => {
    expect(isLikelyBackupEnvelope({})).toBe(false);
    expect(isLikelyBackupEnvelope({ version: 1 })).toBe(false);
    const e = envelope() as unknown as Record<string, unknown>;
    delete e.salt;
    expect(isLikelyBackupEnvelope(e)).toBe(false);
  });

  test('rejects when version is the wrong type', () => {
    expect(
      isLikelyBackupEnvelope({ ...envelope(), version: '1' as unknown as number }),
    ).toBe(false);
  });
});

describe('checkEnvelopeCompatibility', () => {
  test('passes for the current format version', () => {
    expect(() =>
      checkEnvelopeCompatibility({
        version: BACKUP_FORMAT_VERSION,
        createdAt: 'now',
        salt: '',
        iv: '',
        ciphertext: '',
      }),
    ).not.toThrow();
  });

  test('passes for an older format version (forward-compatible reader)', () => {
    expect(() =>
      checkEnvelopeCompatibility({
        version: BACKUP_FORMAT_VERSION - 1,
        createdAt: 'now',
        salt: '',
        iv: '',
        ciphertext: '',
      }),
    ).not.toThrow();
  });

  test('throws for a newer format version with a clear message', () => {
    expect(() =>
      checkEnvelopeCompatibility({
        version: BACKUP_FORMAT_VERSION + 1,
        createdAt: 'now',
        salt: '',
        iv: '',
        ciphertext: '',
      }),
    ).toThrow(/newer version/i);
  });
});
