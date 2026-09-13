/**
 * What leaves the app as text — issue #24.
 *
 * A reader asked to be able to send a dua or a tafsir passage to family,
 * or into Notes, the way an ayah could already be sent. Sharing an ayah
 * as text was written inline in the ayah sheet; two more of these, each
 * assembling its own string somewhere else, is how three formats drift
 * apart and how one of them quietly loses its attribution.
 *
 * ── ATTRIBUTION IS NOT A FIELD, IT IS THE POINT ───────────────────────
 *
 * CLAUDE.md §4: religious content must be sourced and attributed. That
 * rule is easy to keep on a screen, where the source line is drawn beside
 * the text and nobody has to remember it. It is easy to LOSE in a share
 * body, because a share body is assembled by hand, read once by whoever
 * wrote it, and then travels without the app around it — a dua pasted
 * into a family group with no source is a claim about the religion with
 * nothing behind it, and the person who receives it has no way back to
 * where it came from.
 *
 * So every builder here takes its attribution as a required argument and
 * `attributed()` refuses to produce a body without one. A future fourth
 * share cannot forget: it will throw the first time it is used, in a
 * test, rather than ship a quotation with no chain.
 *
 * The shape is the one the ayah share already used, so the three read as
 * one app: blocks separated by a blank line, attribution last behind an
 * em dash.
 */

/** Joins non-empty blocks, and refuses to finish without attribution. */
function attributed(blocks: ReadonlyArray<string | undefined>, source: string): string {
  const attribution = source.trim();
  if (!attribution) {
    throw new Error('shareText: religious content cannot be shared unattributed');
  }
  const body = blocks
    .map(b => b?.trim())
    .filter((b): b is string => Boolean(b))
    .join('\n\n');
  return `${body}\n\n— ${attribution}`;
}

export type AyahShare = {
  arabic: string;
  translation: string;
  /** "Al-Baqarah 2:255". */
  reference: string;
};

/** One ayah: the Arabic, the reader's translation, and where it is from. */
export function ayahShareText({
  arabic,
  translation,
  reference,
}: AyahShare): string {
  return attributed([arabic, translation], reference);
}

export type DuaShare = {
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  /** The citation carried on the dua itself; never optional. */
  source: string;
};

/**
 * How much of a dua to send — issue #47.
 *
 * "If my system language is Arabic, I would normally want to share only
 * the Arabic text. I do not necessarily need the translated text to be
 * included automatically."
 *
 * Which is the whole point: what a person sends depends on who they are
 * sending it to, and the app cannot know that. An Arabic speaker sending
 * to family does not want an English paragraph under it; someone sending
 * a dua to a friend who reads no Arabic does not want a block they cannot
 * read. Both of those used to arrive whatever the sender wanted.
 *
 * `both` is what the share has always been, and it stays the default so
 * nothing changes for the people the old body suited.
 */
export type DuaShareParts = 'arabic' | 'translation' | 'both';

/**
 * One dua.
 *
 * The transliteration travels with `both`. It is behind a toggle on
 * screen — an aid, not the text — but the whole point of sending a dua to
 * someone is that they can say it, and a recipient who does not read
 * Arabic cannot say it from the Arabic. It costs a paragraph.
 *
 * It travels with neither of the other two. A sender who asked for the
 * Arabic alone is sending the dua as it is said, and a pronunciation
 * guide under it is the thing they left out; one who asked for the
 * meaning alone is sending what it means to someone who, by the asking,
 * does not need help pronouncing it.
 *
 * The title and the source are in all three. The source especially: the
 * rule at the top of this file is not one a share option may spend.
 */
export function duaShareText(
  { title, arabic, transliteration, translation, source }: DuaShare,
  parts: DuaShareParts = 'both',
): string {
  const blocks =
    parts === 'arabic'
      ? [title, arabic]
      : parts === 'translation'
        ? [title, translation]
        : [title, arabic, transliteration, translation];
  return attributed(blocks, source);
}

export type AyahWithTafsirShare = {
  arabic: string;
  /** The commentary on that ayah, in the edition the reader has open. */
  tafsir: string;
  /** The edition's own name — "Ibn Kathir (abridged)". A proper noun. */
  edition: string;
  /** "Al-Baqarah 2:255". */
  reference: string;
};

/**
 * One ayah with its commentary, instead of its translation.
 *
 * Asked for after the ayah share became a choice: the reader who wants to
 * send a verse to somebody often wants to send what it MEANS in the sense
 * a commentary gives, not the line-for-line translation.
 *
 * TWO TEXTS, TWO AUTHORS, ONE MESSAGE — so the attribution has to carry
 * both, and in this order. `tafsirShareText` names the edition first
 * because its body IS the commentary and the ayah is only the address;
 * here the body opens with the revelation, so the reference leads and the
 * edition follows it. A reader receiving this must be able to see at a
 * glance which half is the Qur'an and which half is a man's explanation
 * of it.
 */
export function ayahWithTafsirShareText({
  arabic,
  tafsir,
  edition,
  reference,
}: AyahWithTafsirShare): string {
  // Both halves checked before they are joined — see `tafsirShareText`,
  // which learned this the same way: two empty halves joined by a
  // separator is a non-empty string, and would ship as an attribution.
  if (!edition.trim() || !reference.trim()) {
    throw new Error('shareText: religious content cannot be shared unattributed');
  }
  return attributed([arabic, tafsir], `${reference} · ${edition}`);
}

export type TafsirShare = {
  text: string;
  /** The edition's own name — "Ibn Kathir (abridged)". A proper noun. */
  edition: string;
  /** The ayah it explains: "Al-Baqarah 2:255". */
  reference: string;
};

/**
 * One tafsir passage.
 *
 * Its attribution has two halves and needs both. The edition alone does
 * not say which ayah is being explained, and the ayah alone credits a
 * classical commentary to nobody — a paragraph of Ibn Kathir arriving as
 * an anonymous explanation of a verse is exactly the shape of an
 * unsourced religious claim.
 */
export function tafsirShareText({
  text,
  edition,
  reference,
}: TafsirShare): string {
  // Both halves checked BEFORE they are joined. `attributed` sees one
  // string, and two empty halves joined by ", " is a non-empty string —
  // so without this a passage could ship credited to ", ".
  if (!edition.trim() || !reference.trim()) {
    throw new Error('shareText: religious content cannot be shared unattributed');
  }
  return attributed([text], `${edition}, ${reference}`);
}
