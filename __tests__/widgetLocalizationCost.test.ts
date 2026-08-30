/**
 * In a widget, `Text("literal")` is a filesystem read.
 *
 * Measured 2026-08-30 against the shipped 2.13.6 build. Launching the app
 * to force one refresh made the extension burn 10.46s of CPU in thirteen
 * seconds, against 0.00s over ten seconds idle. WidgetKit kills an
 * extension that holds 80% for twenty, so one ordinary refresh already sat
 * four fifths of the way to being killed — and a button press, which is
 * just another render, finished it. That is the blank widget, and repeated,
 * the widget that disappears. Five CPU-kill reports on the developer's Mac,
 * spanning 2.10.1 to 2.13.6, every one the same stack.
 *
 * `sample` on the extension mid-burn put 4004 of 4262 samples here:
 *
 *   renderUntilStable → AccessibilityNodeAttachment.init
 *     → AccessibilityText.init → Text.resolveAttributedString
 *       → LocalizedStringKey.resolve
 *         → -[NSBundle localizedAttributedStringForKey:value:table:localization:]
 *           → _copyStringTable → _loadStringsFromData → parse 13 KB of plist
 *
 * The `localization:` on that selector is the whole story. Every widget
 * sets `.environment(\.locale, mihrabLocale())` so labels follow Mihrab's
 * language and not the system's — correct, and the reason the setting
 * exists. But a locale that differs from the bundle's own takes SwiftUI off
 * NSBundle's cached lookup and onto the localization-qualified one, which
 * re-reads and re-parses the .strings file. Per label, per render pass, and
 * again for every accessibility label.
 *
 * So the extension resolves its own strings now and hands SwiftUI a String
 * it cannot look anything up in. These tests exist because the fix is one
 * character away from being undone: `Text("k")` and `widgetText("k")` read
 * the same at a glance, and the cost of the difference is invisible until a
 * user's widgets start vanishing.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const EXT = path.join(__dirname, '..', 'ios', 'PrayerWidgetExtension');
const swift = readdirSync(EXT).filter((f) => f.endsWith('.swift'));
const source = Object.fromEntries(
  swift.map((f) => [f, readFileSync(path.join(EXT, f), 'utf8')]),
);

/** Source lines with `//` comments dropped, so prose about the rule is not the rule. */
function code(text: string): string {
  return text
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
}

describe('no widget label goes through LocalizedStringKey', () => {
  it.each(swift)('%s has no literal Text("key")', (file) => {
    // The overload that takes a LocalizedStringKey is the one Swift picks
    // for a string LITERAL. `Text(someVariable)` is already verbatim; only
    // the literals cost anything, and only they are banned here.
    const offenders = code(source[file])
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /(?<!widget)\bText\("[a-z][a-z0-9_]*"\)/.test(line));
    expect(offenders).toEqual([]);
  });

  it('every widget still sets the app-language locale', () => {
    // The fix must not have been achieved by dropping the feature that
    // made it expensive. Someone whose phone is in English and app in
    // Arabic still gets an Arabic widget.
    const configured = swift.filter((f) => source[f].includes('StaticConfiguration(kind:'));
    expect(configured.length).toBeGreaterThanOrEqual(6);
    for (const f of configured) {
      expect(source[f]).toContain('.environment(\\.locale, mihrabLocale())');
    }
  });

  it('resolves through the cached NSBundle API, not the localization-qualified one', () => {
    // Read the code, not the comments: the note above this function names
    // the selector it is avoiding, and matching on prose would fail the
    // moment someone documented the reason well.
    const main = code(source['PrayerWidgetExtension.swift']);
    expect(main).toContain('localizedString(forKey: key, value: nil, table: nil)');
    expect(main).not.toContain('localizedAttributedString');
  });

  it('memoises, and keys the memo by language', () => {
    // A memo keyed by string alone would keep serving the old language
    // when someone changes it while this process is still alive.
    const main = source['PrayerWidgetExtension.swift'];
    expect(main).toContain('widgetStringMemo');
    expect(main).toMatch(/memoKey = "\\\(mihrabLocalizationTag\(\) \?\? ""\)/);
    expect(main).toContain('widgetStringMemoLock');
  });

  it('hands SwiftUI a String it cannot look anything up in', () => {
    expect(source['PrayerWidgetExtension.swift']).toMatch(
      /func widgetText\(_ key: String\) -> Text \{\s*Text\(verbatim: widgetString\(key\)\)/,
    );
  });
});

describe('the timeline archive stays under WidgetKit\'s size cap', () => {
  const main = code(source['PrayerWidgetExtension.swift']);

  it('caps the entry count well below what 2.13.6 shipped', () => {
    // chronod, 2026-08-30, on the shipped build:
    //   PrayerTimesWidget systemLarge
    //     reload: failed with too large timeline archive 11307528
    // 11.3 MB, refused outright, which is a card with nothing to draw.
    // 60 entries × ~188 KB. Twelve is ~2.3 MB and costs no coverage: the
    // policy re-runs the provider and it rebuilds from the same days[].
    const cap = main.match(/let maxEntries = (\d+)/);
    expect(cap).not.toBeNull();
    const n = Number(cap![1]);
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(20);
    expect(main).toContain('if boundaries.count > maxEntries');
  });

  it('does not carry the claim that large timelines are fine', () => {
    // The comment that made the bug survive review. It is not true: what
    // is bounded is the archive, not the number of entries.
    expect(source['PrayerWidgetExtension.swift']).not.toContain(
      'WidgetKit tolerates large timelines',
    );
  });

  it('still re-runs, so a shorter timeline covers the same days', () => {
    // Cutting entries would be a regression if the provider never ran
    // again — the window the app wrote has to still be honoured in full.
    expect(main).toMatch(/policy: \.after\(refresh\)/);
  });
});

describe('the refresh button', () => {
  const main = source['PrayerWidgetExtension.swift'];

  it('does something', () => {
    // It was `func perform() async throws -> some IntentResult { .result() }`.
    expect(main).not.toMatch(/func perform\(\)[^\n]*\{ \.result\(\) \}/);
    expect(main).toContain('WidgetCenter.shared.reloadTimelines(ofKind: "PrayerTimesWidget")');
  });

  it('reloads one kind, never all of them', () => {
    // A press costs a render. Six renders is how you get an extension
    // killed by the CPU limit — see the note at the top of this file.
    const bare = code(main);
    const intent = bare.slice(bare.indexOf('struct RefreshIntent'));
    const body = intent.slice(0, intent.indexOf('\n}\n'));
    expect(body).not.toContain('reloadAllTimelines');
  });
});
