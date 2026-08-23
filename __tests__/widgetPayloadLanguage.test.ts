/**
 * The widget is drawn half in JS and half natively, and only the JS half knows
 * which language Mihrab is set to. Before the payload carried it, a phone in
 * English running Mihrab in Swedish got a widget in both at once: Swedish
 * prayer names under an English heading. Native reads `language` back out and
 * resolves its own labels against it, so these two assertions are the whole
 * contract between the halves — drop the field and the widget silently splits
 * in two again.
 */
import i18n from '../src/i18n';
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';

const today = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '19:30',
};

describe('widget payload language', () => {
  const original = i18n.language;

  afterEach(async () => {
    await i18n.changeLanguage(original);
  });

  it('carries the app language so native can match it', async () => {
    await i18n.changeLanguage('sv');
    const p = buildWidgetPayload(today, undefined, new Date(2026, 3, 9, 14, 0, 0));
    expect(p.language).toBe('sv');
  });

  it('formats the day label in the app language, not the device one', async () => {
    const now = new Date(2026, 3, 9, 14, 0, 0);

    await i18n.changeLanguage('en');
    const en = buildWidgetPayload(today, undefined, now);

    await i18n.changeLanguage('sv');
    const sv = buildWidgetPayload(today, undefined, now);

    expect(sv.language).toBe('sv');
    // `undefined` here would have taken the *device* locale, and under jest
    // that is en-US for both — so the labels differing is the proof the
    // argument is being honoured at all.
    expect(sv.dayLabel).not.toBe(en.dayLabel);
    // Same day, either way round.
    expect(sv.days?.[0]?.dateKey).toBe(en.days?.[0]?.dateKey);
  });

  it('formats each day of the multi-day window in the app language too', async () => {
    await i18n.changeLanguage('sv');
    const p = buildWidgetPayload(
      today,
      undefined,
      new Date(2026, 3, 9, 14, 0, 0),
      undefined,
      undefined,
      undefined,
      [today, today, today],
    );
    const labels = (p.days ?? []).map(d => d.dayLabel);
    expect(labels.length).toBeGreaterThan(1);
    // Swedish abbreviates weekdays lower-case ("tors"), English capitalises.
    expect(labels.every(l => l === l.toLocaleLowerCase('sv'))).toBe(true);
  });
});
