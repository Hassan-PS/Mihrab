/**
 * What changed — every release, in one continuous list.
 *
 * ── THIS WAS A PAGER ──────────────────────────────────────────────────
 *
 * The surface before it was `WhatsNewModal`: the retired feature tour's
 * machinery — a full-screen, horizontally paged modal with dots and a
 * Next button — pointed at release notes. It inherited two real lessons
 * (the dots must be `muted`, because `border` is transparent under the
 * iOS Liquid Glass palette; the pager scrolls in LTR pixel space while
 * the page order stays logical, so Next advances in both directions) and
 * one bad habit: a pager asks the reader to work for each sentence, and
 * it can only show what somebody hand-wrote slides for, which was two
 * releases out of fifty-eight.
 *
 * A changelog is a list. It scrolls, it is skimmed, the newest thing is
 * at the top, and the reader decides where to stop — so neither lesson
 * above survives into this file, because there is no pager left to learn
 * them about.
 *
 * ── ONE SHEET, TWO DOORS ──────────────────────────────────────────────
 *
 * The first launch after an update opens it with everything since the
 * version this phone last ran marked new; Settings → About opens the
 * same component with nothing marked. There is no second "history"
 * screen, because the history was always under the new part anyway.
 *
 * `ResponsiveModal` decides the shape: a bottom sheet on a phone, a
 * centred card on an iPad or a Mac. `bare` and `maxHeightRatio` are for
 * this caller — the list runs to the rounded corners and stops at 88% of
 * the window, so there is always a strip of dimmed page above it saying
 * what it is on top of.
 */
import { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { getInstalledAppVersionName } from '../appVersion';
import { isRtlLanguage } from '../i18n/layoutDirection';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE, typeStyle } from '../theme/typography';
import { parseNote, type NoteBlock, type Span } from './notesMarkup';
import {
  CHANGELOG,
  compareVersions,
  lastSeenFrom,
  noteFor,
  unseenVersionSet,
  type ReleaseNote,
} from './releaseNotes';

const SEEN_KEY = 'mihrab.lastSeenVersion';
/**
 * The feature tour's flag, read but never written again. Its presence is
 * how an install that predates release notes is told apart from a fresh
 * one — see `lastSeenFrom` and `LEGACY_BASELINE_VERSION` in releaseNotes.
 */
const LEGACY_TOUR_KEY = 'mihrab.featureTour.v1';

/** How much of the window the sheet may take, at most. */
const MAX_HEIGHT_RATIO = 0.88;

/**
 * A version number, kept the right way round in Arabic and Urdu.
 *
 * `2.18.5-beta` inside a right-to-left paragraph is reordered by the
 * bidi algorithm into `beta-2.18.5`: the digits are neutral-ish, the
 * hyphen is neutral, and the run gets laid out by the paragraph's
 * direction. Wrapping it in a left-to-right isolate says "this is one
 * left-to-right thing" without affecting a character outside it. Same
 * pair the compass uses for a bearing — see screens/compass/StatusBanners.
 */
/** LEFT-TO-RIGHT ISOLATE and POP DIRECTIONAL ISOLATE, by code point
 *  rather than as themselves: an invisible character in source is a
 *  character nobody can see to review. */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

function ltr(version: string): string {
  return `${LRI}${version}${PDI}`;
}

/**
 * The hairline between two releases, and under the header, and over the
 * footer.
 *
 * A named component rather than an inline arrow because `FlatList` takes
 * it as `ItemSeparatorComponent`: an arrow defined during render is a new
 * component TYPE on every render, and React responds by unmounting and
 * remounting every separator in the list.
 */
function Rule() {
  const { palette } = useAppPalette();
  return <View style={[styles.rule, { backgroundColor: palette.border }]} />;
}

// ------------------------------------------------------------ storage

/**
 * The version this user last ran, or null on a fresh install.
 *
 * An install from before this key existed has no value under it, and
 * would read as fresh — so the tour flag every such install carries
 * stands in, as the last version that had no release notes to show.
 */
export async function readLastSeenVersion(): Promise<string | null> {
  try {
    const [stored, legacy] = await AsyncStorage.multiGet([
      SEEN_KEY,
      LEGACY_TOUR_KEY,
    ]);
    return lastSeenFrom(stored[1], legacy[1] === '1');
  } catch {
    // Storage unavailable → err on the side of NOT interrupting.
    return getInstalledAppVersionName();
  }
}

export async function markVersionSeen(version?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SEEN_KEY,
      version ?? getInstalledAppVersionName(),
    );
  } catch {
    /* non-critical */
  }
}

/**
 * The version to open the sheet FOR, or null when it should not open.
 *
 * Called on Home's first focus after onboarding is complete. A fresh
 * install gets null — and gets its version stamped, so the next update
 * is an upgrade rather than a first sighting.
 *
 * Returning the last-seen version rather than a list of releases is what
 * lets the sheet show the whole changelog with only part of it marked:
 * the caller says "this reader was on 2.18.4", not "here are two notes".
 */
export async function pendingChangelog(): Promise<string | null> {
  const current = getInstalledAppVersionName();
  const last = await readLastSeenVersion();
  const unseen = last ? unseenVersionSet(last, current) : new Set<string>();
  if (unseen.size === 0) {
    // Nothing to announce — a fresh install, a build between releases, or
    // a version already seen. Stamp now so the next launch does not have
    // to work this out again, and so the NEXT update reads as an upgrade
    // from here rather than from the legacy baseline.
    await markVersionSeen(current);
    return null;
  }
  // With something to show, the stamp waits for the sheet's own dismissal:
  // a reader who kills the app mid-way is shown it again, which is right.
  return last;
}

// ------------------------------------------------------------- body

/**
 * One note's blocks, drawn.
 *
 * `language` is the note's own, `reader` is the app's. They differ for
 * exactly the languages that have no translated notes and fall back to
 * English — and of those, Urdu is laid out right to left. An English
 * paragraph inside a mirrored tree is laid out by the tree: the block
 * hugs the right edge, the bullet sits on the right of the text, and the
 * bidi algorithm puts the full stop at the START of the line, because in
 * a right-to-left paragraph that is where the end is.
 *
 * Three things put it right, and all three are needed:
 *
 *   • `textAlign` to the note's own side — physical `left`/`right`, since
 *     the tree's `start` is the wrong side by definition here;
 *   • `row-reverse` on the bullet rows, which inside a mirrored tree is
 *     the way to say "the other way round" — the ONE place in this file
 *     that reverses, and only when the two directions disagree;
 *   • the text wrapped in a directional isolate, so the punctuation at
 *     its ends belongs to the run and not to the paragraph. This is what
 *     Android needs: `writingDirection` is honoured on iOS only.
 *
 * When the two agree — every other reader — none of this fires and the
 * tree's own direction does the work, as i18n/layoutDirection.ts asks.
 */
const RLI = String.fromCharCode(0x2067);

/**
 * The `textAlign` that puts a note against its OWN edge when the layout
 * runs the other way. It is `right` — for an English note in an Urdu
 * layout AND for the reverse — and the reason is worth writing down,
 * because `left` is what anyone would reach for first, and `left` puts
 * the English on the right on both platforms.
 *
 * Neither platform treats `left`/`right` as physical once a layout is
 * mirrored. iOS mirrors the word against the LAYOUT direction: under a
 * right-to-left layout, `right` means the left edge. Android mirrors it
 * against the TEXT direction whenever that disagrees with the layout's:
 * English under a right-to-left layout is such a disagreement, and there
 * `right` resolves to the text's own normal edge, which for English is
 * the left. Two different rules, and in the one situation this function
 * is for — text and layout disagreeing — both send `right` to the same
 * place: the text's own start. `left` goes the other way on both.
 *
 * Seen on the Android emulator and the iOS simulator, both words, before
 * this was settled. Only ever used when the two directions disagree; when
 * they agree the tree's own `start` is right and nothing is set.
 */
export const ALIGN_TO_OWN_SIDE = 'right' as const;

const NoteBody = memo(function NoteBody({
  blocks,
  language,
  reader,
}: {
  blocks: NoteBlock[];
  language: string;
  reader: string;
}) {
  const { palette } = useAppPalette();
  const rtl = isRtlLanguage(language);
  const mismatched = rtl !== isRtlLanguage(reader);
  const text = [
    typeStyle('body'),
    { color: palette.text, writingDirection: rtl ? 'rtl' : 'ltr' } as const,
    mismatched ? { textAlign: ALIGN_TO_OWN_SIDE } : null,
  ];
  const open = mismatched ? (rtl ? RLI : LRI) : '';
  const close = mismatched ? PDI : '';

  // An array rather than a fragment, so the isolates are the Text's own
  // first and last children — which is what the test can see, and what a
  // reader of the tree expects to find.
  const spans = (runs: Span[]) => [
    open,
    ...runs.map((s, k) => (
      <Text key={k} style={s.bold ? styles.bold : undefined}>
        {s.text}
      </Text>
    )),
    close,
  ];

  return (
    <View style={styles.body}>
      {blocks.map((block, i) =>
        block.kind === 'paragraph' ? (
          <Text key={i} style={text}>
            {spans(block.spans)}
          </Text>
        ) : (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              <View
                key={j}
                style={[styles.item, mismatched ? styles.itemReversed : null]}>
                <Text
                  style={[styles.bullet, { color: palette.muted }]}
                  accessibilityElementsHidden>
                  {'\u2022'}
                </Text>
                <Text style={[styles.itemText, text]}>{spans(item)}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
});

/**
 * The release's date in the reader's own language, or nothing.
 *
 * A release the table has no tag for — notes written ahead of the tag,
 * which is the order `release.sh` enforces — has no date, and an empty
 * space is a better answer than today's.
 */
function dateLabel(iso: string | null, language: string): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ------------------------------------------------------------- sheet

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * The version the reader last ran. Releases after it are marked new.
   * `null` — opened from Settings rather than by an update — marks
   * nothing, which is the truth: they have seen all of it.
   */
  since?: string | null;
};

function ReleaseRow({
  release,
  isNew,
  language,
}: {
  release: ReleaseNote;
  isNew: boolean;
  language: string;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const note = useMemo(
    () => noteFor(release, language),
    [release, language],
  );
  const blocks = useMemo(() => parseNote(note.text), [note.text]);
  const date = dateLabel(release.date, language);

  return (
    <View style={styles.release}>
      <View style={styles.head}>
        <Text style={[typeStyle('title3'), { color: palette.text }]}>
          {ltr(release.version)}
        </Text>
        {isNew ? (
          <View style={[styles.pill, { backgroundColor: palette.accentBg }]}>
            <Text style={[styles.pillText, { color: palette.accentSolid }]}>
              {t('whatsNew.newBadge', 'New')}
            </Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        {date ? (
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {date}
          </Text>
        ) : null}
      </View>
      <NoteBody blocks={blocks} language={note.language} reader={language} />
    </View>
  );
}

export function ChangelogSheet({ visible, onClose, since = null }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const wide = useBreakpoint() !== 'compact';
  const installed = getInstalledAppVersionName();
  const language = i18n.language;

  /**
   * Everything the reader could possibly have, newest first.
   *
   * Capped at the installed version because the table is committed ahead
   * of the tag: a build made the day notes for the next release were
   * written would otherwise announce a version that is not on the phone.
   */
  const releases = useMemo(
    () => CHANGELOG.filter(r => compareVersions(r.version, installed) <= 0),
    [installed],
  );
  const unseen = useMemo(
    () => (since ? unseenVersionSet(since, installed) : new Set<string>()),
    [since, installed],
  );

  const finish = useCallback(() => {
    void markVersionSeen();
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ReleaseNote>) => (
      <ReleaseRow
        release={item}
        isNew={unseen.has(item.version)}
        language={language}
      />
    ),
    [unseen, language],
  );

  // A sheet with an empty list is a header and a button. Nothing calls it
  // that way — `pendingChangelog` returns null, and About reads the same
  // table — but a build with no notes at all should show no sheet rather
  // than an empty one.
  if (releases.length === 0) return null;

  return (
    <ResponsiveModal
      visible={visible}
      onClose={finish}
      bare
      maxHeightRatio={MAX_HEIGHT_RATIO}
      closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        {/* The grab handle, and only where there is something to grab:
            on a wide window this is a centred card, not a sheet. */}
        {wide ? null : (
          <View
            accessibilityElementsHidden
            style={[styles.handle, { backgroundColor: palette.border }]}
          />
        )}

        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[typeStyle('title2'), { color: palette.text }]}>
            {t('whatsNew.title', 'What’s new')}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('whatsNew.installed', 'Mihrab {{version}}', {
              version: ltr(installed),
            })}
          </Text>
        </View>
        {/* Not decoration: the list scrolls UNDER the header, and without
            a line the first visible release is a paragraph cut off in
            mid-sentence against the title, which reads as a rendering
            fault rather than as a scroll. Same at the foot, where it
            says the Close button is chrome and not the last row. */}
        <Rule />

        <FlatList
          data={releases}
          keyExtractor={r => String(r.code)}
          renderItem={renderItem}
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          initialNumToRender={4}
          windowSize={5}
          ItemSeparatorComponent={Rule}
        />

        <Rule />
        {/* Pinned, so "how do I get out of this" is answered from the top
            of a fifty-eight-release list as well as the bottom. */}
        <View
          style={[
            styles.footer,
            { paddingBottom: (wide ? 0 : insets.bottom) + SPACING.lg },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Close')}
            onPress={finish}
            style={({ pressed }) => [
              styles.close,
              { backgroundColor: palette.accentBg },
              pressed ? styles.pressed : null,
            ]}>
            <Text
              style={[typeStyle('headline'), { color: palette.accentSolid }]}>
              {t('common.close', 'Close')}
            </Text>
          </Pressable>
        </View>
      </View>
    </ResponsiveModal>
  );
}

const styles = StyleSheet.create({
  // `shrink`, not `flex: 1`: the card is capped, not stretched, so a
  // two-release changelog stays a short sheet.
  sheet: { flexShrink: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: RADIUS.xs,
    alignSelf: 'center',
    marginTop: SPACING.md,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
  },
  scroll: { flexShrink: 1 },
  scrollBody: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  release: { paddingVertical: SPACING.lg, gap: SPACING.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  spacer: { flex: 1 },
  pill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  pillText: {
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
    fontWeight: '700',
  },
  body: { gap: SPACING.sm },
  list: { gap: SPACING.sm },
  // `gap`, not a margin on the bullet: a margin has a side, and the side
  // is wrong the moment the row is reversed.
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  itemReversed: { flexDirection: 'row-reverse' },
  bullet: {
    fontSize: TYPE.body.fontSize,
    lineHeight: TYPE.body.lineHeight,
  },
  itemText: { flex: 1 },
  bold: { fontWeight: '700' },
  rule: { height: StyleSheet.hairlineWidth },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  close: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: RADIUS.md,
  },
  pressed: { opacity: 0.7 },
});
