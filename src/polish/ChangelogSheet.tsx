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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { foreignText, LRI, PDI } from '../i18n/foreignText';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE, typeStyle } from '../theme/typography';
import { noteCopyText, parseNote, type NoteBlock, type Span } from './notesMarkup';
import { usePrayerSettingsOrDefaults } from '../context/PrayerSettingsContext';
import { copyToClipboard } from '../sync/clipboard';
import { CheckIcon, CopyIcon } from '../theme/icons';
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
 * `language` is the note's own, which is not always the reader's: ten of
 * the app's thirteen languages have no translated notes and get the
 * English one, and one of those ten — Urdu — is laid out right to left.
 * `foreignText` is what keeps an English paragraph readable inside a
 * mirrored tree, and its header says why all three of its parts are
 * needed and why the alignment is the word it is.
 */
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
  const foreign = foreignText(language, reader);
  const text = [
    typeStyle('body'),
    { color: palette.text },
    // Unconditionally, not only when foreign: a note in the reader's own
    // language still has a direction, and saying so costs nothing.
    { writingDirection: isRtlLanguage(language) ? 'rtl' : 'ltr' } as const,
    foreign.style,
  ];

  // An array rather than a fragment, so the isolates are the Text's own
  // first and last children — which is what the test can see, and what a
  // reader of the tree expects to find.
  const spans = (runs: Span[]) => [
    foreign.open,
    ...runs.map((s, k) => (
      <Text key={k} style={s.bold ? styles.bold : undefined}>
        {s.text}
      </Text>
    )),
    foreign.close,
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
                style={[
                  styles.item,
                  foreign.mismatched ? styles.itemReversed : null,
                ]}>
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

/**
 * COPY THIS RELEASE'S NOTES — for whoever keeps the release, not for
 * everyone who reads it.
 *
 * The notes go out to Play, GitHub, the App Store and replies on issues,
 * and the one place they are all laid out, dated and translated, is this
 * sheet. So a copy button per release — but only behind "Show data
 * statistics", the diagnostic switch that is itself hidden behind five
 * taps on the version: a reader has no use for it, and a copy icon on
 * every release is chrome they would have to read past.
 *
 * What is copied is the note as this sheet shows it, in the note's own
 * language, under the release's name (`noteCopyText`). The icon turns to
 * a tick for two seconds when it lands; Android 13 and up says "Copied"
 * itself, so the word is only added where the system said nothing.
 */
function CopyNotesButton({
  version,
  text,
}: {
  version: string;
  text: string;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [state, setState] = useState<'idle' | 'copied' | 'announced' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onPress = useCallback(async () => {
    const result = await copyToClipboard(text);
    setState(
      result === 'failed' ? 'failed' : result === 'copied-quietly' ? 'copied' : 'announced',
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }, [text]);

  const done = state === 'copied' || state === 'announced';
  const word =
    state === 'copied'
      ? t('whatsNew.copied', 'Copied')
      : state === 'failed'
        ? t('whatsNew.copyFailed', "Couldn't copy")
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('whatsNew.copyNotes', {
        defaultValue: 'Copy release notes for {{version}}',
        version,
      })}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.copy, pressed ? styles.pressed : null]}>
      {word ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typeStyle('footnote'),
            { color: state === 'failed' ? palette.danger : palette.accentSolid },
          ]}>
          {word}
        </Text>
      ) : null}
      {done ? (
        <CheckIcon size={18} color={palette.accentSolid} />
      ) : (
        <CopyIcon size={18} color={palette.muted} />
      )}
    </Pressable>
  );
}

function ReleaseRow({
  release,
  isNew,
  language,
  copyable,
}: {
  release: ReleaseNote;
  isNew: boolean;
  language: string;
  /** Show the copy button — "Show data statistics" is on. */
  copyable: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const note = useMemo(
    () => noteFor(release, language),
    [release, language],
  );
  const blocks = useMemo(() => parseNote(note.text), [note.text]);
  const date = dateLabel(release.date, language);
  const heading = t('whatsNew.installed', {
    defaultValue: 'Mihrab {{version}}',
    version: release.version,
  });

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
        {copyable ? (
          <CopyNotesButton
            version={release.version}
            text={noteCopyText(heading, note.text)}
          />
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
  const copyable = usePrayerSettingsOrDefaults().settings.showDataStats === true;

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
        copyable={copyable}
      />
    ),
    [unseen, language, copyable],
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
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: 32,
    paddingStart: SPACING.sm,
  },
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
