/**
 * The line across the top of the Quran while something is downloading.
 *
 * ── WHY IT IS ITS OWN FILE ────────────────────────────────────────────
 *
 * It was written inside `MushafReader`, for the mushaf's fonts, and so it
 * only ever appeared there and only ever said "Downloading the mushaf".
 * The recitation downloads — a whole reciter from the picker, one surah
 * from the ayah sheet — had no strip at all: the surah one had a line of
 * text inside a sheet that stops existing the moment you close it, and the
 * reciter one had a row in a list you have to go back to.
 *
 * The manager already owns all three (see `quranDownloadManager`), and a
 * download that survives its screen needs somewhere to be seen from the
 * screens it survived into. So the strip moved out here, learned to name
 * whichever job is running, and is drawn by every Quran screen.
 *
 * ── ONE STRIP, BECAUSE THERE IS ONE DOWNLOAD ──────────────────────────
 *
 * The manager runs one job at a time by design, so this never has to
 * stack or choose. It renders the running job or nothing, which is also
 * why it is safe to mount on several screens at once: only the screen you
 * are looking at is drawing.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { findReciter } from './audio/reciters';
import {
  cancelQuranDownload,
  dismissResumableJob,
  fontSetOf,
  jobSurahName,
  quranDownloadState,
  resumeQuranDownload,
  subscribeQuranDownload,
  type QuranDownloadJob,
  type QuranDownloadState,
} from './quranDownloadManager';
import { SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

/**
 * Follow the manager.
 *
 * Exported because a screen sometimes has to know a strip is up before it
 * draws anything else — the reader pads itself past iOS's floating header
 * and must not do it twice.
 */
export function useQuranDownloadRun(): QuranDownloadState {
  const [run, setRun] = useState<QuranDownloadState>(quranDownloadState);
  useEffect(() => subscribeQuranDownload(setRun), []);
  return run;
}

type Props = {
  /**
   * What the strip has to clear above itself, dp. Zero under an opaque
   * header that is already in flow; the header's height under iOS's
   * translucent one; the cutout in fullscreen.
   */
  top?: number;
};

export function QuranDownloadStrip({ top = 0 }: Props) {
  const run = useQuranDownloadRun();
  return <QuranDownloadStripView run={run} top={top} />;
}

/** The strip itself, given the state — the shape a test can render. */
export function QuranDownloadStripView({
  run,
  top = 0,
}: Props & { run: QuranDownloadState }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const job = run.running;
  /**
   * A DOWNLOAD THAT STOPPED IS STILL SOMETHING THE READER HAS — #55.
   *
   * The strip used to render the running job or nothing, so the moment a
   * connection went the only thing on screen about the download
   * disappeared: no bar, no number, nothing to press. Told "it failed" by
   * a notification and shown nothing by the app, the reporter's
   * conclusion — that the 85% was gone and the only way forward was to
   * delete and start again — was the reasonable one.
   *
   * So the strip stays, saying where it stopped, with the two answers
   * that exist: pick it up, or let it go. The bytes are on disk either
   * way; "let it go" only takes the offer away.
   */
  if (!job) {
    const stopped = run.last;
    if (!stopped || !stopped.interrupted) return null;
    return (
      <StoppedStrip
        job={stopped.job}
        done={stopped.done}
        total={stopped.total}
        top={top}
      />
    );
  }

  const { done, total } = run.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Each job names itself. A bar that says "the mushaf" while it fetches
  // a surah of Abdul Basit is the kind of small lie that survives for
  // releases because nobody reads a progress strip twice.
  const label =
    job.kind === 'fonts'
      ? fontSetOf(job) === 'v2'
        ? t('quran.mushafDownloadStrip', {
            defaultValue: 'Downloading the mushaf · {{pct}}%',
            pct,
          })
        : t('tajweed.downloadStrip', {
            defaultValue: 'Downloading the tajweed colours · {{pct}}%',
            pct,
          })
      : job.kind === 'audio'
        ? t('quran.reciterDownloadStrip', {
            defaultValue: 'Downloading {{name}} · {{pct}}%',
            name: findReciter(job.reciterId).name,
            pct,
          })
        : t('quran.surahDownloadStrip', {
            defaultValue: 'Downloading {{surah}} · {{pct}}%',
            surah: jobSurahName(job.surah),
            pct,
          });

  return (
    <View
      style={[
        styles.strip,
        {
          backgroundColor: palette.card,
          borderBottomColor: palette.border,
          paddingTop: top + STRIP_PADDING_TOP,
        },
      ]}>
      <View style={styles.stripRow}>
        <Text
          style={[styles.stripLabel, { color: palette.muted }]}
          numberOfLines={1}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          hitSlop={10}
          onPress={() => cancelQuranDownload()}>
          <Text style={[styles.stripCancel, { color: palette.accentSolid }]}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.stripTrack, { backgroundColor: palette.accentBg }]}>
        <View
          style={[
            styles.stripFill,
            { width: `${pct}%`, backgroundColor: palette.accentSolid },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * The same strip, for a download that has stopped.
 *
 * Deliberately the same shape and the same place: it is the download the
 * reader was already watching, in the state it is now in, rather than a
 * new kind of message somewhere else. The bar is drawn where it got to,
 * because that is the fact the report says nobody could see.
 */
function StoppedStrip({
  job,
  done,
  total,
  top,
}: {
  job: QuranDownloadJob;
  done: number;
  total: number;
  top: number;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const name =
    job.kind === 'fonts'
      ? fontSetOf(job) === 'v2'
        ? t('downloads.mushaf', 'Mushaf pages')
        : t('tajweed.downloadsRow', 'Tajweed colours')
      : job.kind === 'audio'
        ? findReciter(job.reciterId).name
        : jobSurahName(job.surah);
  return (
    <View
      style={[
        styles.strip,
        {
          backgroundColor: palette.card,
          borderBottomColor: palette.border,
          paddingTop: top + STRIP_PADDING_TOP,
        },
      ]}>
      <View style={styles.stripRow}>
        <Text
          style={[styles.stripLabel, { color: palette.muted }]}
          numberOfLines={1}>
          {t('quran.downloadStoppedStrip', {
            defaultValue: '{{name}} stopped at {{pct}}% · kept',
            name,
            pct,
          })}
        </Text>
        <View style={styles.stripActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'quran.listenDownloadResume',
              'Continue downloading',
            )}
            hitSlop={10}
            onPress={() => resumeQuranDownload()}>
            <Text
              style={[styles.stripCancel, { color: palette.accentSolid }]}
              numberOfLines={1}>
              {t('quran.listenDownloadResume', 'Continue downloading')}
            </Text>
          </Pressable>
          {/* The glyph, not the word: two verbs side by side on a phone
              is where this row runs out of width, and the one that takes
              the offer away is the one that can be a symbol. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss', 'Dismiss')}
            hitSlop={10}
            onPress={() => dismissResumableJob()}>
            <Text style={[styles.stripCancel, { color: palette.muted }]}>
              ✕
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.stripTrack, { backgroundColor: palette.accentBg }]}>
        <View
          style={[
            styles.stripFill,
            { width: `${pct}%`, backgroundColor: palette.muted },
          ]}
        />
      </View>
    </View>
  );
}

/** The strip's own breathing room above its row, dp. */
const STRIP_PADDING_TOP = 6;

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  stripLabel: {
    fontSize: TYPE.label.fontSize,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  stripCancel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  stripActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stripTrack: { height: 3, overflow: 'hidden' },
  stripFill: { height: '100%' },
});
