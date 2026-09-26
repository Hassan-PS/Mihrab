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
  | 'tafkheem'
  // Warsh's own (issue #58) — `scripts/mushaf/warsh_tajweed.py`.
  | 'madd_badal'
  | 'leen_mahmooz'
  | 'laam_taghleedh'
  | 'raa_tarqeeq'
  | 'naql'
  | 'tasheel'
  | 'taqleel';

/**
 * One colour, one idea: the guide is arranged by what the reader sees,
 * and a reader who has learnt "green is a hum" has learnt six rules'
 * worth of pages.
 */
export type TajweedFamilyId =
  | 'silent'
  | 'ghunnah'
  | 'madd'
  | 'qalqalah'
  | 'tafkheem'
  /** What Warsh reads differently: the moved or eased hamza, taqlīl, the thin rāʾ. */
  | 'warsh';

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
  /**
   * The riwayah the rule belongs to, when it is not a shared one. A Warsh
   * rule's example is a Warsh word at a Warsh reference, and the Ḥafṣ
   * guide does not list it.
   */
  riwayah?: 'warsh';
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
  riwayah?: 'warsh',
): TajweedRule {
  return { id, family, light: ink[0], dark: ink[1], example, counts, riwayah };
}

// Warsh's own inks. Not the Complex's — its tajwīd fonts are Ḥafṣ only —
// so chosen to sit apart from the five it does use: a purple for the
// hamza that moves or softens, a rose for taqlīl, a teal for the thin rāʾ.
const HAMZA_CHANGE = ['#8e44ad', '#c39bd3'] as const;
const TAQLEEL = ['#c2185b', '#f48fb1'] as const;
const TARQEEQ = ['#00897b', '#4db6ac'] as const;

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
  // ── Warsh ─────────────────────────────────────────────────────────
  // References are Warsh's own numbering, where the muṣḥaf differs.
  rule('madd_badal', 'madd', MADD_PERMISSIBLE, { text: 'ءَامَنُواْ', surah: 2, ayah: 8, word: 4 }, '2 · 4 · 6', 'warsh'),
  rule('leen_mahmooz', 'madd', MADD_PERMISSIBLE, { text: 'شَےْءٖ', surah: 2, ayah: 19, word: 24 }, '4 · 6', 'warsh'),
  rule('laam_taghleedh', 'tafkheem', TAFKHEEM, { text: 'اَ۬لصَّلَوٰةَ', surah: 2, ayah: 2, word: 5 }, undefined, 'warsh'),
  rule('raa_tarqeeq', 'warsh', TARQEEQ, { text: 'خَيْرٞ', surah: 2, ayah: 53, word: 18 }, undefined, 'warsh'),
  rule('naql', 'warsh', HAMZA_CHANGE, { text: 'قَدَ اَفْلَحَ', surah: 23, ayah: 1, word: 2 }, undefined, 'warsh'),
  rule('tasheel', 'warsh', HAMZA_CHANGE, { text: 'شُهَدَآءَ ا۪ذْ', surah: 2, ayah: 132, word: 5 }, undefined, 'warsh'),
  rule('taqleel', 'warsh', TAQLEEL, { text: 'اِ۬لنَّصَٰر۪ىٰ', surah: 2, ayah: 112, word: 4 }, undefined, 'warsh'),
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
  'warsh',
];

/**
 * The family's rules for a reader of `riwayah`: the shared rules always,
 * and a riwayah's own only for that riwayah. Without one, the Ḥafṣ set.
 */
export function rulesOfFamily(family: TajweedFamilyId, riwayah?: string): TajweedRule[] {
  return TAJWEED_RULES.filter(
    r => r.family === family && (r.riwayah == null || r.riwayah === riwayah),
  );
}

/** The families with anything in them for this riwayah. */
export function familiesFor(riwayah?: string): TajweedFamilyId[] {
  return TAJWEED_FAMILIES.filter(f => rulesOfFamily(f, riwayah).length > 0);
}

/** Does this riwayah have tajwīd colours at all — Ḥafṣ's fonts, Warsh's spans. */
export function riwayahHasTajweed(riwayah: string): boolean {
  return riwayah === 'hafs' || riwayah === 'warsh';
}

/** The rule's page ink for the tone the page is in. */
export function tajweedInk(rule: TajweedRule, nightMode: boolean): string {
  return nightMode ? rule.dark : rule.light;
}
