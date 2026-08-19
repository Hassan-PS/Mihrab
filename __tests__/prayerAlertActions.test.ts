/**
 * The buttons on a prayer alert, and the value a snooze press carries back.
 *
 * The snooze chips used to read "5" "10" "15" "30" under a field labelled
 * "Minutes" — four bare numbers that said nothing about what they did, and
 * needed a second tap on a send button to take effect. They now say "Snooze
 * 5 min" and act on the first tap.
 *
 * The parser matters more than it looks. `allowGeneratedReplies` defaults to
 * TRUE in notifee, so a watch was free to offer its own smart replies on this
 * action: "Sure, on my way" came back as the input, parsed to nothing, and
 * the old code silently snoozed ten minutes nobody had asked for. Generated
 * replies are off now, and the parser recognises the exact label it produced
 * before it will look at digits at all — which is also what makes it survive
 * a translation that puts the number somewhere else in the sentence.
 */
jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: {
    t: (_key: string, second?: unknown, third?: unknown) => {
      const isOpts = (v: unknown) => v != null && typeof v === 'object';
      const fallback = typeof second === 'string' ? second : '';
      const opts = (isOpts(second) ? second : isOpts(third) ? third : {}) as Record<
        string,
        unknown
      >;
      const template =
        typeof opts.defaultValue === 'string' ? opts.defaultValue : fallback;
      return template.replace(/{{(\w+)}}/g, (_m, name) =>
        opts[name] === undefined ? `{{${name}}}` : String(opts[name]),
      );
    },
  },
}));

import {
  parseSnoozeMinutes,
  prayerAlertActions,
  snoozeChoiceLabel,
  snoozeChoices,
  SNOOZE_PRESETS,
} from '../src/notifications/prayerAlertActions';

describe('the snooze chips', () => {
  it('say what they do rather than showing a bare number', () => {
    expect(snoozeChoices()).toEqual([
      'Snooze 5 min',
      'Snooze 10 min',
      'Snooze 15 min',
      'Snooze 30 min',
    ]);
  });

  it('offers the four presets, in order', () => {
    expect([...SNOOZE_PRESETS]).toEqual([5, 10, 15, 30]);
  });

  it('takes effect on the first tap — no free-form field to send from', () => {
    const snooze = prayerAlertActions('Dhuhr')[0];
    expect(snooze.pressAction.id).toBe('adhan_snooze');
    expect(snooze.input?.allowFreeFormInput).toBe(false);
    // The reason the parser can trust its own labels.
    expect(snooze.input?.allowGeneratedReplies).toBe(false);
    expect(snooze.input?.choices).toEqual(snoozeChoices());
  });
});

describe('reading a snooze press back', () => {
  it('recognises every label it generated', () => {
    for (const m of SNOOZE_PRESETS) {
      expect(parseSnoozeMinutes(snoozeChoiceLabel(m))).toBe(m);
    }
  });

  it('recognises its own labels even when the number is not first', () => {
    // Several locales put it that way round — "5 dk ertele", "延后 5 分钟".
    expect(parseSnoozeMinutes('Snooze 15 min')).toBe(15);
  });

  it('still reads a plain number, for the iOS text field', () => {
    expect(parseSnoozeMinutes('5')).toBe(5);
    expect(parseSnoozeMinutes(' 22 ')).toBe(22);
    expect(parseSnoozeMinutes('15 min')).toBe(15);
  });

  it('reads Arabic-Indic digits, which a localised chip can carry', () => {
    expect(parseSnoozeMinutes('تأجيل ١٥ د')).toBe(15);
    expect(parseSnoozeMinutes('۳۰')).toBe(30);
  });

  it('falls back rather than inventing a duration', () => {
    // This is the watch case: whatever a smart reply sends must not become a
    // silent snooze at some number the user never chose. It still falls back
    // — but generated replies are switched off so it should never arrive.
    expect(parseSnoozeMinutes('Sure, on my way')).toBe(10);
    expect(parseSnoozeMinutes('')).toBe(10);
    expect(parseSnoozeMinutes('abc')).toBe(10);
    expect(parseSnoozeMinutes(undefined)).toBe(10);
    expect(parseSnoozeMinutes(null)).toBe(10);
    expect(parseSnoozeMinutes('0')).toBe(10);
  });

  it('refuses a negative rather than reading it as positive', () => {
    // The digit sweep erases the minus; "-4" must not become four minutes.
    expect(parseSnoozeMinutes('-4')).toBe(10);
    expect(parseSnoozeMinutes('snooze -4 min')).toBe(10);
  });

  it('clamps an absurd value instead of scheduling days out', () => {
    expect(parseSnoozeMinutes('9999')).toBe(180);
    expect(parseSnoozeMinutes('181')).toBe(180);
    expect(parseSnoozeMinutes('180')).toBe(180);
  });

  it('honours a caller-supplied fallback', () => {
    expect(parseSnoozeMinutes('7', 5)).toBe(7);
    expect(parseSnoozeMinutes('', 5)).toBe(5);
  });
});

describe('the action row', () => {
  it('never exceeds the three Android will show', () => {
    for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(prayerAlertActions(p).length).toBeLessThanOrEqual(3);
    }
  });

  it('offers both a plain log and a log with sunnah', () => {
    const ids = prayerAlertActions('Maghrib').map(a => a.pressAction.id);
    expect(ids).toEqual([
      'adhan_snooze',
      'journal-log-prayer:Maghrib',
      'journal-log-sunnah:Maghrib',
    ]);
  });

  it('carries the prayer in the id, which a relay cannot strip', () => {
    // A watch bridge is free to drop the notification's `data`; the id is
    // the only part of the press guaranteed to survive it.
    for (const p of ['Fajr', 'Dhuhr', 'Maghrib', 'Isha']) {
      const ids = prayerAlertActions(p).map(a => a.pressAction.id);
      expect(ids).toContain(`journal-log-prayer:${p}`);
      expect(ids).toContain(`journal-log-sunnah:${p}`);
    }
  });

  it('omits "log with sunnah" for Asr, which carries none', () => {
    const ids = prayerAlertActions('Asr').map(a => a.pressAction.id);
    expect(ids).toEqual(['adhan_snooze', 'journal-log-prayer:Asr']);
  });

  it('drops both log buttons for something that is not a prayer', () => {
    // Sunrise and the night times reach this only through the snooze
    // re-fire, where a missing payload leaves the name empty.
    const ids = prayerAlertActions('').map(a => a.pressAction.id);
    expect(ids).toEqual(['adhan_snooze', 'journal-log-prayer:']);
  });

  it('has no "Stop adhan" — a swipe already does that on Android', () => {
    for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const ids = prayerAlertActions(p).map(a => a.pressAction.id);
      expect(ids).not.toContain('adhan_stop');
    }
  });
});
