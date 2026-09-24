/**
 * The tajwīd rules the muṣḥaf colours, and what each colour means.
 *
 * The colours are the King Fahd Complex's (the QPC V4 tajwīd page fonts,
 * `docs/mushaf-fidelity-rules.md`, "Tajwīd colours"): a letter is painted
 * for the rule it falls under, in the ink the Complex chose for that rule.
 * The fonts carry two palettes — one cut for a light page, one for a dark
 * — and the swatches here are those palettes' own entries, so a legend
 * drawn beside the page is in the page's ink and not a near miss of it.
 *
 * The rule ids are quran.com's (`text_uthmani_tajweed` markup), which is
 * where `assets/quran/tajweed/{NNN}.json` comes from; the colours are the
 * font's, matched to them by what each paints. `tafkheem` has no rule in
 * that markup, so the build reads it off the fonts instead: a word whose
 * glyph has a layer in the tafkhīm ink carries the rule over its whole
 * text — the font knows the word, not the letter.
 */

export type TajweedRuleId =
  | 'ham_wasl'
  | 'laam_shamsiyah'
  | 'slnt'
  | 'idgham_wo_ghunnah'
  | 'idgham_mutajanisayn'
  | 'idgham_mutaqaribayn'
  | 'ghunnah'
  | 'ikhafa'
  | 'idgham_ghunnah'
  | 'iqlab'
  | 'ikhafa_shafawi'
  | 'idgham_shafawi'
  | 'madda_normal'
  | 'madda_permissible'
  | 'madda_obligatory_mottasel'
  | 'madda_obligatory_monfasel'
  | 'madda_necessary'
  | 'qalaqah'
  | 'tafkheem';

/**
 * One colour, one idea: the guide is arranged by what the reader sees,
 * and a reader who has learnt "green is a hum" has learnt six rules'
 * worth of pages.
 */
export type TajweedFamilyId = 'silent' | 'ghunnah' | 'madd' | 'qalqalah' | 'tafkheem';

export type TajweedRule = {
  id: TajweedRuleId;
  family: TajweedFamilyId;
  /** The page ink on a light page and on a dark one. */
  light: string;
  dark: string;
  /** Roughly how long: counts of a vowel, for the madd family. */
  counts?: string;
  /** An example word, and where it is — the guide's "show me". */
  example: { text: string; surah: number; ayah: number; word: number };
};

// The CPAL entries of the V4 tajwīd fonts, light palette then dark.
const GREY = ['#a3a5a5', '#999999'] as const;
const GREEN = ['#09b000', '#26b55d'] as const;
const MADD_NORMAL = ['#ce9e00', '#ffc1e0'] as const;
const MADD_PERMISSIBLE = ['#ff7b00', '#ff8e3b'] as const;
const MADD_OBLIGATORY = ['#f40000', '#ff5e8e'] as const;
const MADD_NECESSARY = ['#b50000', '#e30000'] as const;
const QALQALAH = ['#2fadff', '#00deff'] as const;
const TAFKHEEM = ['#3f48e6', '#3c84d5'] as const;

function rule(
  id: TajweedRuleId,
  family: TajweedFamilyId,
  ink: readonly [string, string],
  example: TajweedRule['example'],
  counts?: string,
): TajweedRule {
  return { id, family, light: ink[0], dark: ink[1], example, counts };
}

/** Every rule, in the order the guide lists them. */
export const TAJWEED_RULES: readonly TajweedRule[] = [
  // ── Grey: written, not sounded ────────────────────────────────────
  rule('ham_wasl', 'silent', GREY, { text: 'ٱللَّهِ', surah: 1, ayah: 1, word: 2 }),
  rule('laam_shamsiyah', 'silent', GREY, { text: 'ٱلرَّحِيمِ', surah: 1, ayah: 1, word: 4 }),
  rule('slnt', 'silent', GREY, { text: 'أُوْلَـٰٓئِكَ', surah: 2, ayah: 5, word: 1 }),
  rule('idgham_wo_ghunnah', 'silent', GREY, { text: 'هُدٗى لِّلۡمُتَّقِينَ', surah: 2, ayah: 2, word: 6 }),
  rule('idgham_mutajanisayn', 'silent', GREY, { text: 'قَد تَّبَيَّنَ', surah: 2, ayah: 256, word: 5 }),
  rule('idgham_mutaqaribayn', 'silent', GREY, { text: 'قُل رَّبِّ', surah: 23, ayah: 93, word: 1 }),
  // ── Green: the hum ────────────────────────────────────────────────
  rule('ghunnah', 'ghunnah', GREEN, { text: 'إِنَّ', surah: 2, ayah: 6, word: 1 }, '2'),
  rule('ikhafa', 'ghunnah', GREEN, { text: 'مِن قَبۡلِكَ', surah: 2, ayah: 4, word: 8 }),
  rule('idgham_ghunnah', 'ghunnah', GREEN, { text: 'هُدًى مِّن', surah: 2, ayah: 5, word: 3 }),
  rule('iqlab', 'ghunnah', GREEN, { text: 'صُمُّۢ بُكۡمٌ', surah: 2, ayah: 18, word: 1 }),
  rule('ikhafa_shafawi', 'ghunnah', GREEN, { text: 'تَرۡمِيهِم بِحِجَارَةٖ', surah: 105, ayah: 4, word: 1 }),
  rule('idgham_shafawi', 'ghunnah', GREEN, { text: 'قُلُوبِهِم مَّرَضٌ', surah: 2, ayah: 10, word: 2 }),
  // ── Red, by how long ──────────────────────────────────────────────
  rule('madda_normal', 'madd', MADD_NORMAL, { text: 'مَـٰلِكِ', surah: 1, ayah: 4, word: 1 }, '2'),
  rule('madda_permissible', 'madd', MADD_PERMISSIBLE, { text: 'ٱلۡعَـٰلَمِينَ', surah: 1, ayah: 2, word: 4 }, '2 · 4 · 6'),
  rule('madda_obligatory_mottasel', 'madd', MADD_OBLIGATORY, { text: 'جَآءَ', surah: 110, ayah: 1, word: 2 }, '4 · 5'),
  rule('madda_obligatory_monfasel', 'madd', MADD_OBLIGATORY, { text: 'بِمَآ أُنزِلَ', surah: 2, ayah: 4, word: 3 }, '4 · 5'),
  rule('madda_necessary', 'madd', MADD_NECESSARY, { text: 'ٱلضَّآلِّينَ', surah: 1, ayah: 7, word: 9 }, '6'),
  // ── Blue: the bounce, and the heavy letter ────────────────────────
  rule('qalaqah', 'qalqalah', QALQALAH, { text: 'أَحَدٌ', surah: 112, ayah: 1, word: 4 }),
  rule('tafkheem', 'tafkheem', TAFKHEEM, { text: 'رَبِّ', surah: 1, ayah: 2, word: 3 }),
];

const BY_ID = new Map(TAJWEED_RULES.map(r => [r.id, r]));

export function tajweedRule(id: string): TajweedRule | undefined {
  return BY_ID.get(id as TajweedRuleId);
}

/** The families, in the guide's order. */
export const TAJWEED_FAMILIES: readonly TajweedFamilyId[] = [
  'silent',
  'ghunnah',
  'madd',
  'qalqalah',
  'tafkheem',
];

export function rulesOfFamily(family: TajweedFamilyId): TajweedRule[] {
  return TAJWEED_RULES.filter(r => r.family === family);
}

/** The rule's page ink for the tone the page is in. */
export function tajweedInk(rule: TajweedRule, nightMode: boolean): string {
  return nightMode ? rule.dark : rule.light;
}
