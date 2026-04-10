/**
 * City names expected by the Sweden bönetider widget (Swedish city list).
 * Source: public bönetider page city selector (2026).
 */
export const ISLAMISKA_FORBUNDET_BONETIDER_CITIES = [
  'Stockholm',
  'Alingsås',
  'Avesta',
  'Bengtsfors',
  'Boden',
  'Bollnäs',
  'Borlänge',
  'Borås',
  'Eksjö',
  'Enköping',
  'Eskilstuna',
  'Eslöv',
  'Fagersta',
  'Falkenberg',
  'Falköping',
  'Flen',
  'Filipstad',
  'Gislaved',
  'Gnosjö',
  'Gällivare',
  'Gävle',
  'Göteborg',
  'Halmstad',
  'Haparanda',
  'Helsingborg',
  'Hudiksvall',
  'Hultsfred',
  'Härnösand',
  'Hässleholm',
  'Högsby',
  'Hörby',
  'Jokkmokk',
  'Jönköping',
  'Kalmar',
  'Karlshamn',
  'Karlskoga',
  'Karlskrona',
  'Karlstad',
  'Katrineholm',
  'Kiruna',
  'Kristianstad',
  'Kristinehamn',
  'Köping',
  'Laholm',
  'Landskrona',
  'Lessebo',
  'Lidköping',
  'Linköping',
  'Ludvika',
  'Luleå',
  'Lund',
  'Lysekil',
  'Malmö',
  'Mariestad',
  'Mellerud',
  'Mjölby',
  'Mora',
  'Munkedal',
  'Mönsterås',
  'Märsta',
  'Norrköping',
  'Norrtälje',
  'Nybro',
  'Nyköping',
  'Nynäshamn',
  'Nässjö',
  'Oskarshamn',
  'Oxelösund',
  'Pajala',
  'Piteå',
  'Ronneby',
  'Sala',
  'Simrishamn',
  'Skara',
  'Skellefteå',
  'Skövde',
  'Sollefteå',
  'Strängnäs',
  'Sundsvall',
  'Säffle',
  'Sävsjö',
  'Söderhamn',
  'Södertälje',
  'Sölvesborg',
  'Tierp',
  'Torsby',
  'Tranemo',
  'Tranås',
  'Trelleborg',
  'Trollhättan',
  'Uddevalla',
  'Ulricehamn',
  'Umeå',
  'Uppsala',
  'Varberg',
  'Vetlanda',
  'Vimmerby',
  'Visby',
  'Vänersborg',
  'Värnamo',
  'Västervik',
  'Västerås',
  'Växjö',
  'Ystad',
  'Åmål',
  'Ängelholm',
  'Örebro',
  'Örnsköldsvik',
  'Östersund',
] as const;

const NORMALIZED_TO_CANONICAL = new Map<string, string>();
for (const c of ISLAMISKA_FORBUNDET_BONETIDER_CITIES) {
  NORMALIZED_TO_CANONICAL.set(normalizeCityKey(c), c);
}

/** Lowercase ASCII-ish key for matching (handles sv-SE letters via same string). */
function normalizeCityKey(name: string): string {
  return name
    .trim()
    .replace(/\s+(kommun|municipality)$/iu, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('sv-SE');
}

/**
 * Map a locality string from Nominatim (or manual input) to the canonical name IF expects.
 * Returns undefined if no listed city matches — caller may fall back to formatted free text.
 */
export function matchIslamiskaForbundetCity(raw: string): string | undefined {
  const stripped = raw
    .trim()
    .replace(/\s+(kommun|municipality)$/iu, '')
    .split(',')[0]
    ?.trim();
  if (!stripped) {
    return undefined;
  }

  const key = normalizeCityKey(stripped);
  const direct = NORMALIZED_TO_CANONICAL.get(key);
  if (direct) {
    return direct;
  }
  if (key.length >= 5 && key.endsWith('s')) {
    const gen = NORMALIZED_TO_CANONICAL.get(key.slice(0, -1));
    if (gen) {
      return gen;
    }
  }

  for (const canonical of ISLAMISKA_FORBUNDET_BONETIDER_CITIES) {
    const ck = normalizeCityKey(canonical);
    if (key === ck || key.startsWith(`${ck} `)) {
      return canonical;
    }
  }

  return undefined;
}
