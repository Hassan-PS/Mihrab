/**
 * Dua / supplication library — task #26.
 *
 * Bundled, offline, no analytics. Each entry carries the Arabic, a
 * transliteration, an English translation, and a `source` field — religious
 * content must always be attributable per the `reviewer` subagent's rule.
 *
 * The MVP ships a starter set of 12 widely-used duas across 5 categories.
 * The full Hisnul Muslim collection (~250 duas) is a follow-on data import
 * once licensing is verified (the task #26 spec calls this out — Hisnul
 * Muslim is widely treated as public-domain but we should confirm before
 * shipping the full set).
 */

export type DuaCategory =
  | 'morning'
  | 'evening'
  | 'afterPrayer'
  | 'food'
  | 'distress'
  | 'sleep'
  | 'travel'
  | 'mosque'
  | 'gratitude'
  | 'forgiveness'
  | 'weather'
  | 'family'
  | 'sickness'
  | 'funeral'
  | 'eid'
  | 'beforeQuran'
  | 'knowledge'
  | 'protection'
  | 'guidance';

export type Dua = {
  /** Stable id used in deep-links and bookmarks. */
  id: string;
  category: DuaCategory;
  /** Short title (English fallback; localized via `duas.<id>.title`). */
  titleEn: string;
  /** Arabic text with diacritics. */
  arabic: string;
  /** Latin-script transliteration. */
  transliteration: string;
  /** English translation. */
  translation: string;
  /** Source citation. NEVER omit — religious content must be attributable. */
  source: string;
  /** Times to recite (for after-prayer / morning-evening adhkar). */
  repeat?: number;
};

export const DUAS: ReadonlyArray<Dua> = [
  // — Morning adhkar —
  {
    id: 'morning_subhanallah',
    category: 'morning',
    titleEn: 'Glorification on rising',
    arabic: 'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ',
    transliteration: 'Subḥān-Allāhi wa biḥamdihi',
    translation: 'Glory be to Allah, and praise be to Him.',
    source: 'Sahih Muslim 2692',
    repeat: 100,
  },
  {
    id: 'morning_protection',
    category: 'morning',
    titleEn: 'Seeking protection at daybreak',
    arabic: 'أَعُوذُ بِكَلِمَاتِ ٱللَّٰهِ ٱلتَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    transliteration: 'Aʿūdhu bi-kalimāt-illāh-it-tāmmāti min sharri mā khalaq',
    translation:
      'I seek refuge in the perfect words of Allah from the evil of what He has created.',
    source: 'Sahih Muslim 2708',
    repeat: 3,
  },
  // — Evening adhkar —
  {
    id: 'evening_amsayna',
    category: 'evening',
    titleEn: 'Evening greeting',
    arabic:
      'أَمْسَيْنَا وَأَمْسَى ٱلْمُلْكُ لِلَّٰهِ، وَٱلْحَمْدُ لِلَّٰهِ، لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ',
    transliteration:
      'Amsaynā wa amsal-mulku lillāh, walḥamdu lillāh, lā ilāha illallāhu waḥdahu lā sharīka lah',
    translation:
      'We have reached evening, and so has all dominion — to Allah belongs all praise. There is no god but Allah alone, with no partner.',
    source: 'Sahih Muslim 2723',
  },
  // — After prayer —
  {
    id: 'afterPrayer_astaghfirullah',
    category: 'afterPrayer',
    titleEn: 'Seeking forgiveness',
    arabic: 'أَسْتَغْفِرُ ٱللَّٰهَ',
    transliteration: 'Astaghfir-Allāh',
    translation: 'I seek the forgiveness of Allah.',
    source: 'Sahih Muslim 591',
    repeat: 3,
  },
  {
    id: 'afterPrayer_allahumma_antas_salam',
    category: 'afterPrayer',
    titleEn: 'Allah is the source of peace',
    arabic:
      'ٱللَّٰهُمَّ أَنْتَ ٱلسَّلَامُ وَمِنْكَ ٱلسَّلَامُ، تَبَارَكْتَ يَا ذَا ٱلْجَلَالِ وَٱلْإِكْرَامِ',
    transliteration:
      'Allāhumma anta-s-salām, wa minka-s-salām, tabārakta yā dhāl-jalāli wal-ikrām',
    translation:
      'O Allah, You are Peace, and from You is peace. Blessed are You, O Possessor of Majesty and Honour.',
    source: 'Sahih Muslim 591',
  },
  {
    id: 'afterPrayer_subhanallah_33',
    category: 'afterPrayer',
    titleEn: 'Tasbih (33 × 3)',
    arabic: 'سُبْحَانَ ٱللَّٰهِ، ٱلْحَمْدُ لِلَّٰهِ، ٱللَّٰهُ أَكْبَرُ',
    transliteration: 'Subḥān-Allāh, al-ḥamdu lillāh, Allāhu akbar',
    translation: 'Glory be to Allah, praise be to Allah, Allah is greater.',
    source: 'Sahih al-Bukhari 843, Sahih Muslim 595',
    repeat: 33,
  },
  // — Food —
  {
    id: 'food_before',
    category: 'food',
    titleEn: 'Before eating',
    arabic: 'بِسْمِ ٱللَّٰهِ',
    transliteration: 'Bismillāh',
    translation: 'In the name of Allah.',
    source: 'Sunan Abi Dawud 3767, Jami at-Tirmidhi 1858',
  },
  {
    id: 'food_after',
    category: 'food',
    titleEn: 'After eating',
    arabic:
      'ٱلْحَمْدُ لِلَّٰهِ ٱلَّذِي أَطْعَمَنِي هَٰذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ',
    transliteration:
      'Al-ḥamdu lillāhilladhī aṭʿamanī hādhā wa razaqanīhi min ghayri ḥawlin minnī wa lā quwwah',
    translation:
      'All praise is for Allah who fed me this and provided it for me without any might nor power from myself.',
    source: 'Sunan Abi Dawud 4023, Jami at-Tirmidhi 3458',
  },
  // — Distress —
  {
    id: 'distress_lahawla',
    category: 'distress',
    titleEn: 'There is no power but with Allah',
    arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ',
    transliteration: 'Lā ḥawla wa lā quwwata illā billāh',
    translation: 'There is no might nor power except with Allah.',
    source: 'Sahih al-Bukhari 6384',
  },
  {
    id: 'distress_innallaha_maana',
    category: 'distress',
    titleEn: 'When in fear',
    arabic: 'حَسْبُنَا ٱللَّٰهُ وَنِعْمَ ٱلْوَكِيلُ',
    transliteration: 'Ḥasbunallāhu wa niʿma-l-wakīl',
    translation: 'Allah is sufficient for us, and what an excellent Trustee He is.',
    source: 'Quran 3:173, recited by Prophet Muhammad in distress (Sahih al-Bukhari 4563)',
  },
  {
    id: 'distress_yaa_hayyu',
    category: 'distress',
    titleEn: 'Calling on the Ever-Living',
    arabic: 'يَا حَيُّ يَا قَيُّومُ، بِرَحْمَتِكَ أَسْتَغِيثُ',
    transliteration: 'Yā ḥayyu yā qayyūm, bi-raḥmatika astaghīth',
    translation: 'O Ever-Living, O Self-Sustaining, by Your mercy I seek aid.',
    source: 'Jami at-Tirmidhi 3524',
  },
  {
    id: 'distress_ayatkursi_intro',
    category: 'distress',
    titleEn: 'Ayat al-Kursi (sleep protection)',
    arabic:
      'ٱللَّٰهُ لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ',
    transliteration: 'Allāhu lā ilāha illā huwal-ḥayyul-qayyūm',
    translation:
      'Allah — there is no deity except Him, the Ever-Living, the Sustainer of all existence. (full ayah continues)',
    source: 'Quran 2:255, Sahih al-Bukhari 2311 (recited at sleep)',
  },
  {
    id: 'distress_dua_al_faraj',
    category: 'distress',
    titleEn: 'Dua al-Faraj (relief from worry & sorrow)',
    arabic:
      'ٱللَّٰهُمَّ إِنِّي عَبْدُكَ، ٱبْنُ عَبْدِكَ، ٱبْنُ أَمَتِكَ، نَاصِيَتِي بِيَدِكَ، مَاضٍ فِيَّ حُكْمُكَ، عَدْلٌ فِيَّ قَضَاؤُكَ، أَسْأَلُكَ بِكُلِّ ٱسْمٍ هُوَ لَكَ، سَمَّيْتَ بِهِ نَفْسَكَ، أَوْ عَلَّمْتَهُ أَحَدًا مِنْ خَلْقِكَ، أَوْ أَنْزَلْتَهُ فِي كِتَابِكَ، أَوِ ٱسْتَأْثَرْتَ بِهِ فِي عِلْمِ ٱلْغَيْبِ عِنْدَكَ، أَنْ تَجْعَلَ ٱلْقُرْآنَ رَبِيعَ قَلْبِي، وَنُورَ صَدْرِي، وَجَلَاءَ حُزْنِي، وَذَهَابَ هَمِّي.',
    transliteration:
      'Allāhumma innī ʿabduk, ibnu ʿabdik, ibnu amatik, nāṣiyatī bi-yadik, māḍin fiyya ḥukmuk, ʿadlun fiyya qaḍāʾuk. Asʾaluka bi-kulli-smin huwa lak, sammayta bihi nafsak, aw ʿallamtahu aḥadan min khalqik, aw anzaltahu fī kitābik, aw-staʾtharta bihi fī ʿilmi-l-ghaybi ʿindak, an tajʿalal-qurʾāna rabīʿa qalbī, wa nūra ṣadrī, wa jalāʾa ḥuznī, wa dhahāba hammī.',
    translation:
      'O Allah, I am Your servant, son of Your male servant, son of Your female servant. My forelock is in Your hand. Your judgment over me is assured, and Your decree concerning me is just. I ask You by every Name that is Yours — those You named Yourself with, or taught to any of Your creation, or revealed in Your Book, or kept hidden in the knowledge of the unseen with You — that You make the Quran the spring of my heart, the light of my chest, the lifting of my sorrow, and the departing of my grief.',
    source: 'Musnad Ahmad 3712 — recited by anyone troubled, with sincere certainty.',
    repeat: 1,
  },
  {
    id: 'distress_dua_al_karb',
    category: 'distress',
    titleEn: 'Dua at the time of grief',
    arabic:
      'ٱللَّٰهُمَّ إِلَيْكَ أَشْكُو ضَعْفَ قُوَّتِي، وَقِلَّةَ حِيلَتِي، وَهَوَانِي عَلَى ٱلنَّاسِ. يَا أَرْحَمَ ٱلرَّاحِمِينَ، أَنْتَ أَرْحَمُ ٱلرَّاحِمِينَ. إِلَىٰ مَنْ تَكِلُنِي؟ إِلَىٰ عَدُوٍّ يَتَجَهَّمُنِي، أَمْ إِلَىٰ قَرِيبٍ مَلَّكْتَهُ أَمْرِي؟ إِنْ لَمْ تَكُنْ غَضْبَانَ عَلَيَّ فَلَا أُبَالِي، غَيْرَ أَنَّ عَافِيَتَكَ أَوْسَعُ لِي. أَعُوذُ بِنُورِ وَجْهِكَ ٱلَّذِي أَشْرَقَتْ لَهُ ٱلظُّلُمَاتُ، وَصَلَحَ عَلَيْهِ أَمْرُ ٱلدُّنْيَا وَٱلْآخِرَةِ، أَنْ تُنْزِلَ بِي غَضَبَكَ، أَوْ تُحِلَّ عَلَيَّ سَخَطَكَ. لَكَ ٱلْعُتْبَىٰ حَتَّىٰ تَرْضَىٰ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِكَ.',
    transliteration:
      'Allāhumma ilayka ashkū ḍaʿfa quwwatī, wa qillata ḥīlatī, wa hawānī ʿalan-nās. Yā arḥama-r-rāḥimīn, anta arḥamu-r-rāḥimīn. Ilā man takilunī? Ilā ʿaduwwin yatajahhamunī, am ilā qarībin mallaktahu amrī? In lam takun ghaḍbāna ʿalayya fa-lā ubālī, ghayra anna ʿāfiyataka awsaʿu lī. Aʿūdhu bi-nūri wajhikalladhī ashraqat lahu-ẓ-ẓulumāt, wa ṣalaḥa ʿalayhi amrud-dunyā wal-ākhira, an tunzila bī ghaḍabak, aw tuḥilla ʿalayya sakhaṭak. Laka-l-ʿutbā ḥattā tarḍā, wa lā ḥawla wa lā quwwata illā bik.',
    translation:
      'O Allah, to You I complain of the weakness of my strength, the fewness of my resources, and my insignificance before people. O Most Merciful of those who show mercy, You are the Most Merciful. To whom do You leave me — to an enemy who scowls at me, or to a relative to whom You have entrusted my affair? If You are not angry with me, I do not care, but Your protection is more spacious for me. I seek refuge in the light of Your Face which lit up the darknesses and set right the affairs of this world and the next, lest Your anger descend upon me or Your displeasure befall me. To You belongs the right to reproach until You are pleased, and there is no power and no strength except by You.',
    source: 'The Prophet ﷺ said this when the people of Taif rejected him (Sirat Ibn Hisham; al-Tabarani al-Kabir).',
    repeat: 1,
  },
  // — Sleep —
  {
    id: 'sleep_bismika',
    category: 'sleep',
    titleEn: 'Before sleeping',
    arabic: 'بِٱسْمِكَ ٱللَّٰهُمَّ أَمُوتُ وَأَحْيَا',
    transliteration: 'Bismika-Allāhumma amūtu wa aḥyā',
    translation: 'In Your name, O Allah, I die and I live.',
    source: 'Sahih al-Bukhari 6324',
  },
  {
    id: 'sleep_alhamdu_ahyana',
    category: 'sleep',
    titleEn: 'On waking',
    arabic:
      'ٱلْحَمْدُ لِلَّٰهِ ٱلَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ ٱلنُّشُورُ',
    transliteration:
      'Al-ḥamdu lillāhilladhī aḥyānā baʿda mā amātanā wa ilayhi-n-nushūr',
    translation:
      'All praise is for Allah, who gave us life after having taken it from us, and to Him is the resurrection.',
    source: 'Sahih al-Bukhari 6324',
  },
  {
    id: 'sleep_three_quls',
    category: 'sleep',
    titleEn: 'Three quls before sleep',
    arabic:
      'قُلْ هُوَ ٱللَّٰهُ أَحَدٌ · قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ · قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    transliteration: 'Qul huwa-llāhu aḥad · Qul aʿūdhu bi-rabbil-falaq · Qul aʿūdhu bi-rabbin-nās',
    translation:
      'Recite Surah al-Ikhlas, al-Falaq, and an-Nas, then blow into the palms and wipe over the body.',
    source: 'Sahih al-Bukhari 5017',
    repeat: 3,
  },
  // — Travel —
  {
    id: 'travel_subhanalladhi',
    category: 'travel',
    titleEn: 'On boarding a vehicle',
    arabic:
      'سُبْحَانَ ٱلَّذِي سَخَّرَ لَنَا هَٰذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَىٰ رَبِّنَا لَمُنْقَلِبُونَ',
    transliteration:
      'Subḥānalladhī sakhkhara lanā hādhā wa mā kunnā lahu muqrinīn, wa innā ilā rabbinā la-munqalibūn',
    translation:
      'Glory be to the One who placed this at our service — we could never have done it ourselves — and to our Lord we shall return.',
    source: 'Quran 43:13–14, Sunan Abi Dawud 2602',
  },
  {
    id: 'travel_journey',
    category: 'travel',
    titleEn: 'For a journey — full text',
    arabic:
      'ٱللَّٰهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَٰذَا ٱلْبِرَّ وَٱلتَّقْوَىٰ، وَمِنَ ٱلْعَمَلِ مَا تَرْضَىٰ. ٱللَّٰهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَٰذَا وَٱطْوِ عَنَّا بُعْدَهُ. ٱللَّٰهُمَّ أَنْتَ ٱلصَّاحِبُ فِي ٱلسَّفَرِ، وَٱلْخَلِيفَةُ فِي ٱلْأَهْلِ. ٱللَّٰهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ ٱلسَّفَرِ، وَكَآبَةِ ٱلْمَنْظَرِ، وَسُوءِ ٱلْمُنْقَلَبِ فِي ٱلْمَالِ وَٱلْأَهْلِ.',
    transliteration:
      'Allāhumma innā nasʾaluka fī safarinā hādhā-l-birra wat-taqwā, wa minal-ʿamali mā tarḍā. Allāhumma hawwin ʿalaynā safaranā hādhā wa-ṭwi ʿannā buʿdah. Allāhumma anta-ṣ-ṣāḥibu fis-safar, wal-khalīfatu fil-ahl. Allāhumma innī aʿūdhu bika min waʿthāʾis-safar, wa kaʾābatil-manẓar, wa sūʾil-munqalabi fil-māli wal-ahl.',
    translation:
      'O Allah, we ask You on this journey of ours for righteousness, piety, and deeds that please You. O Allah, ease this journey for us and shorten its distance. O Allah, You are the Companion on the journey and the Successor over the family. O Allah, I seek refuge in You from the hardships of travel, the bleakness of sights, and any harmful return upon family or wealth.',
    source: 'Sahih Muslim 1342. Recite when starting a journey, after saying "Allāhu Akbar" three times. On the return, add the next dua "Āyibūn tāʾibūn ʿābidūn li-rabbinā ḥāmidūn".',
    repeat: 1,
  },
  {
    id: 'travel_returning',
    category: 'travel',
    titleEn: 'On returning home',
    arabic: 'آيِبُونَ تَائِبُونَ عَابِدُونَ لِرَبِّنَا حَامِدُونَ',
    transliteration: 'Āyibūna tāʾibūna ʿābidūna li-rabbinā ḥāmidūn',
    translation:
      'We return, we repent, we worship, and we praise our Lord.',
    source: 'Sahih Muslim 1345',
  },
  // — Mosque —
  {
    id: 'mosque_entering',
    category: 'mosque',
    titleEn: 'Entering the mosque',
    arabic: 'ٱللَّٰهُمَّ ٱفْتَحْ لِي أَبْوَابَ رَحْمَتِكَ',
    transliteration: 'Allāhumma-ftaḥ lī abwāba raḥmatik',
    translation: 'O Allah, open for me the doors of Your mercy.',
    source: 'Sahih Muslim 713',
  },
  {
    id: 'mosque_leaving',
    category: 'mosque',
    titleEn: 'Leaving the mosque',
    arabic: 'ٱللَّٰهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ',
    transliteration: 'Allāhumma innī asʾaluka min faḍlik',
    translation: 'O Allah, I ask You for Your bounty.',
    source: 'Sahih Muslim 713',
  },
  {
    id: 'mosque_adhan_response',
    category: 'mosque',
    titleEn: 'After hearing the adhan',
    arabic:
      'ٱللَّٰهُمَّ رَبَّ هَٰذِهِ ٱلدَّعْوَةِ ٱلتَّامَّةِ وَٱلصَّلَاةِ ٱلْقَائِمَةِ، آتِ مُحَمَّدًا ٱلْوَسِيلَةَ وَٱلْفَضِيلَةَ',
    transliteration:
      'Allāhumma rabba hādhihid-daʿwati-t-tāmmati waṣ-ṣalātil-qāʾimah, āti Muḥammadan-il-wasīlata wal-faḍīlah',
    translation:
      'O Allah, Lord of this perfect call and the prayer about to be established, grant Muhammad al-Waseelah (the highest station) and excellence.',
    source: 'Sahih al-Bukhari 614',
  },
  // — Gratitude —
  {
    id: 'gratitude_blessing',
    category: 'gratitude',
    titleEn: 'On receiving a blessing',
    arabic: 'ٱلْحَمْدُ لِلَّٰهِ ٱلَّذِي بِنِعْمَتِهِ تَتِمُّ ٱلصَّالِحَاتُ',
    transliteration: 'Al-ḥamdu lillāhilladhī bi-niʿmatihi tatimmuṣ-ṣāliḥāt',
    translation:
      'All praise is for Allah, by whose grace good deeds are perfected.',
    source: 'Sunan Ibn Majah 3803',
  },
  {
    id: 'gratitude_kindness',
    category: 'gratitude',
    titleEn: 'When someone does you a kindness',
    arabic: 'جَزَاكَ ٱللَّٰهُ خَيْرًا',
    transliteration: 'Jazākallāhu khayrā',
    translation: 'May Allah reward you with goodness.',
    source: 'Jami at-Tirmidhi 2035',
  },
  // — Forgiveness —
  {
    id: 'forgiveness_sayyidul',
    category: 'forgiveness',
    titleEn: 'Master supplication for forgiveness (Sayyid al-Istighfar)',
    arabic:
      'ٱللَّٰهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا ٱسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي، فَٱغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ ٱلذُّنُوبَ إِلَّا أَنْتَ',
    transliteration:
      'Allāhumma anta rabbī, lā ilāha illā anta, khalaqtanī wa anā ʿabduk, wa anā ʿalā ʿahdika wa waʿdika mā-staṭaʿt. Aʿūdhu bika min sharri mā ṣanaʿt. Abūʾu laka bi-niʿmatika ʿalayya, wa abūʾu laka bi-dhanbī fa-ghfir lī, fa-innahu lā yaghfiru-dh-dhunūba illā anta.',
    translation:
      'O Allah, You are my Lord, none has the right to be worshipped except You. You created me, and I am Your servant. I keep Your covenant and Your promise as much as I can. I seek refuge in You from the evil I have done. I acknowledge Your favor upon me and I acknowledge my sin — so forgive me, for none can forgive sins except You.',
    source: 'Sahih al-Bukhari 6306',
  },
  {
    id: 'forgiveness_rabbi_ighfir',
    category: 'forgiveness',
    titleEn: "Adam's plea for forgiveness",
    arabic:
      'رَبَّنَا ظَلَمْنَا أَنْفُسَنَا وَإِنْ لَمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ ٱلْخَاسِرِينَ',
    transliteration:
      'Rabbanā ẓalamnā anfusanā wa in lam taghfir lanā wa tarḥamnā la-nakūnanna minal-khāsirīn',
    translation:
      'Our Lord, we have wronged ourselves, and if You do not forgive us and have mercy on us we will surely be among the losers.',
    source: 'Quran 7:23',
  },
  {
    id: 'forgiveness_tawwab',
    category: 'forgiveness',
    titleEn: 'Turning to Allah in repentance',
    arabic: 'أَسْتَغْفِرُ ٱللَّٰهَ ٱلْعَظِيمَ ٱلَّذِي لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ وَأَتُوبُ إِلَيْهِ',
    transliteration:
      'Astaghfirullāha-l-ʿaẓīm alladhī lā ilāha illā huwa-l-ḥayyu-l-qayyūm wa atūbu ilayh',
    translation:
      'I seek the forgiveness of Allah the Almighty, beside whom there is no god, the Ever-Living, the Sustainer, and I turn to Him in repentance.',
    source: 'Sunan Abi Dawud 1517, Jami at-Tirmidhi 3577',
  },
  // — Additional morning/evening —
  {
    id: 'morning_three_protections',
    category: 'morning',
    titleEn: "Allah's name protects me",
    arabic:
      'بِسْمِ ٱللَّٰهِ ٱلَّذِي لَا يَضُرُّ مَعَ ٱسْمِهِ شَيْءٌ فِي ٱلْأَرْضِ وَلَا فِي ٱلسَّمَاءِ، وَهُوَ ٱلسَّمِيعُ ٱلْعَلِيمُ',
    transliteration:
      'Bismillāhi-lladhī lā yaḍurru maʿasmihi shayʾun fī-l-arḍi wa lā fī-s-samāʾ, wa huwa-s-samīʿu-l-ʿalīm',
    translation:
      'In the name of Allah, with whose name nothing on earth or in the heaven can cause harm — and He is the All-Hearing, the All-Knowing.',
    source: 'Sunan Abi Dawud 5088, Jami at-Tirmidhi 3388',
    repeat: 3,
  },
  {
    id: 'morning_radhitu_billahi',
    category: 'morning',
    titleEn: 'Pleased with Allah as Lord',
    arabic:
      'رَضِيتُ بِٱللَّٰهِ رَبًّا، وَبِٱلْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
    transliteration: 'Raḍītu billāhi rabbā, wa bil-Islāmi dīnā, wa bi-Muḥammadin nabiyyā',
    translation:
      'I am pleased with Allah as my Lord, with Islam as my religion, and with Muhammad ﷺ as my Prophet.',
    source: 'Sunan Abi Dawud 5072',
    repeat: 3,
  },
  {
    id: 'evening_three_protections',
    category: 'evening',
    titleEn: "Allah's name protects me (evening)",
    arabic:
      'بِسْمِ ٱللَّٰهِ ٱلَّذِي لَا يَضُرُّ مَعَ ٱسْمِهِ شَيْءٌ فِي ٱلْأَرْضِ وَلَا فِي ٱلسَّمَاءِ، وَهُوَ ٱلسَّمِيعُ ٱلْعَلِيمُ',
    transliteration:
      'Bismillāhi-lladhī lā yaḍurru maʿasmihi shayʾun fī-l-arḍi wa lā fī-s-samāʾ, wa huwa-s-samīʿu-l-ʿalīm',
    translation:
      'In the name of Allah, with whose name nothing on earth or in the heaven can cause harm — and He is the All-Hearing, the All-Knowing.',
    source: 'Sunan Abi Dawud 5088, Jami at-Tirmidhi 3388',
    repeat: 3,
  },
  // — Additional after-prayer —
  {
    id: 'afterPrayer_la_ilaha_illallah',
    category: 'afterPrayer',
    titleEn: 'Tahlil x10 after Fajr / Maghrib',
    arabic:
      'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Lā ilāha illallāhu waḥdahu lā sharīka lah, lahul-mulku wa lahul-ḥamd, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'There is no god but Allah alone, with no partner. To Him belongs all sovereignty and all praise, and He is over all things capable.',
    source: 'Jami at-Tirmidhi 3474',
    repeat: 10,
  },
  // — Additional distress —
  {
    id: 'distress_grief',
    category: 'distress',
    titleEn: 'For relief from grief and anxiety',
    arabic:
      'ٱللَّٰهُمَّ إِنِّي عَبْدُكَ، ٱبْنُ عَبْدِكَ، ٱبْنُ أَمَتِكَ، نَاصِيَتِي بِيَدِكَ، مَاضٍ فِيَّ حُكْمُكَ، عَدْلٌ فِيَّ قَضَاؤُكَ',
    transliteration:
      'Allāhumma innī ʿabduka, ibnu ʿabdika, ibnu amatika, nāṣiyatī bi-yadik, māḍin fīyya ḥukmuk, ʿadlun fīyya qaḍāʾuk',
    translation:
      'O Allah, I am Your servant, son of Your servant, son of Your female servant. My forelock is in Your hand. Your judgment over me is assured, and Your decree concerning me is just.',
    source: 'Musnad Ahmad 3712',
  },
  {
    id: 'distress_difficulty',
    category: 'distress',
    titleEn: 'When in difficulty',
    arabic: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ ٱلْعَظِيمُ ٱلْحَلِيمُ، لَا إِلَٰهَ إِلَّا ٱللَّٰهُ رَبُّ ٱلْعَرْشِ ٱلْعَظِيمِ',
    transliteration:
      'Lā ilāha illa-llāhu-l-ʿaẓīmu-l-ḥalīm, lā ilāha illa-llāhu rabbu-l-ʿarshil-ʿaẓīm',
    translation:
      'There is no god but Allah, the Mighty, the Forbearing. There is no god but Allah, Lord of the Mighty Throne.',
    source: 'Sahih al-Bukhari 6346',
  },
  {
    id: 'distress_rain',
    category: 'distress',
    titleEn: 'When rain falls',
    arabic: 'ٱللَّٰهُمَّ صَيِّبًا نَافِعًا',
    transliteration: 'Allāhumma ṣayyiban nāfiʿā',
    translation: 'O Allah, may it be a beneficial rain cloud.',
    source: 'Sahih al-Bukhari 1032',
  },
  // — Weather —
  {
    id: 'weather_after_rain',
    category: 'weather',
    titleEn: 'After rain has fallen',
    arabic: 'مُطِرْنَا بِفَضْلِ ٱللَّٰهِ وَرَحْمَتِهِ',
    transliteration: 'Muṭirnā bi-faḍli-llāhi wa raḥmatih',
    translation: 'We have been given rain by the grace and mercy of Allah.',
    source: 'Sahih al-Bukhari 846',
  },
  {
    id: 'weather_thunder',
    category: 'weather',
    titleEn: 'On hearing thunder',
    arabic:
      'سُبْحَانَ ٱلَّذِي يُسَبِّحُ ٱلرَّعْدُ بِحَمْدِهِ وَٱلْمَلَائِكَةُ مِنْ خِيفَتِهِ',
    transliteration:
      'Subḥānalladhī yusabbiḥu-r-raʿdu bi-ḥamdihi wal-malāʾikatu min khīfatih',
    translation:
      'Glory be to the One whom thunder declares praise of, and the angels too out of awe of Him.',
    source: 'Muwatta Malik 1812',
  },
  {
    id: 'weather_strong_wind',
    category: 'weather',
    titleEn: 'When wind blows strongly',
    arabic:
      'ٱللَّٰهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا وَخَيْرَ مَا فِيهَا وَخَيْرَ مَا أُرْسِلَتْ بِهِ، وَأَعُوذُ بِكَ مِنْ شَرِّهَا وَشَرِّ مَا فِيهَا وَشَرِّ مَا أُرْسِلَتْ بِهِ',
    transliteration:
      'Allāhumma innī asʾaluka khayrahā wa khayra mā fīhā wa khayra mā ursilat bih, wa aʿūdhu bika min sharrihā wa sharri mā fīhā wa sharri mā ursilat bih',
    translation:
      'O Allah, I ask You for its good, the good within it, and the good of what was sent with it. And I seek refuge in You from its evil, the evil within it, and the evil of what was sent with it.',
    source: 'Sahih Muslim 899',
  },
  // — Family —
  {
    id: 'family_for_offspring',
    category: 'family',
    titleEn: 'For righteous offspring',
    arabic:
      'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَٱجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا',
    transliteration:
      'Rabbanā hab lanā min azwājinā wa dhurriyyātinā qurrata aʿyunin waj-ʿalnā lil-muttaqīna imāmā',
    translation:
      'Our Lord, grant us from among our spouses and offspring comfort to our eyes, and make us a leader for the righteous.',
    source: 'Quran 25:74',
  },
  {
    id: 'family_for_parents',
    category: 'family',
    titleEn: 'For parents',
    arabic: 'رَبِّ ٱرْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
    transliteration: 'Rabbi irḥamhumā kamā rabbayānī ṣaghīrā',
    translation: 'My Lord, have mercy on them as they raised me when I was small.',
    source: 'Quran 17:24',
  },
  {
    id: 'family_blessing_marriage',
    category: 'family',
    titleEn: 'On a marriage congratulation',
    arabic: 'بَارَكَ ٱللَّٰهُ لَكَ وَبَارَكَ عَلَيْكَ وَجَمَعَ بَيْنَكُمَا فِي خَيْرٍ',
    transliteration: 'Bārakallāhu laka wa bāraka ʿalayka wa jamaʿa baynakumā fī khayr',
    translation:
      'May Allah bless you, shower His blessings on you, and unite you both in goodness.',
    source: 'Sunan Abi Dawud 2130',
  },
  {
    id: 'family_for_child',
    category: 'family',
    titleEn: 'Seeking refuge for a child',
    arabic:
      'أُعِيذُكَ بِكَلِمَاتِ ٱللَّٰهِ ٱلتَّامَّةِ مِنْ كُلِّ شَيْطَانٍ وَهَامَّةٍ وَمِنْ كُلِّ عَيْنٍ لَامَّةٍ',
    transliteration:
      'Uʿīdhuka bi-kalimātillāhi-t-tāmmati min kulli shayṭānin wa hāmmatin wa min kulli ʿaynin lāmmah',
    translation:
      'I seek refuge for you in the perfect words of Allah from every devil, every harmful insect, and every evil eye.',
    source: 'Sahih al-Bukhari 3371',
  },
  // — Sickness —
  {
    id: 'sickness_visit',
    category: 'sickness',
    titleEn: 'Visiting the sick',
    arabic:
      'لَا بَأْسَ طَهُورٌ إِنْ شَاءَ ٱللَّٰهُ',
    transliteration: 'Lā baʾsa, ṭahūrun in shāʾa-llāh',
    translation: 'No worry — it is a purification, Allah willing.',
    source: 'Sahih al-Bukhari 3616',
  },
  {
    id: 'sickness_prayer_for_sick',
    category: 'sickness',
    titleEn: 'Prayer for a sick person',
    arabic:
      'ٱللَّٰهُمَّ رَبَّ ٱلنَّاسِ، أَذْهِبِ ٱلْبَأْسَ، ٱشْفِ، أَنْتَ ٱلشَّافِي، لَا شِفَاءَ إِلَّا شِفَاؤُكَ، شِفَاءً لَا يُغَادِرُ سَقَمًا',
    transliteration:
      'Allāhumma rabba-n-nās, adhhibi-l-baʾs, ishfi, anta-sh-shāfī, lā shifāʾa illā shifāʾuk, shifāʾan lā yughādiru saqamā',
    translation:
      'O Allah, Lord of mankind, remove the harm, heal — You are the Healer; there is no cure but Yours — a cure that leaves no illness behind.',
    source: 'Sahih al-Bukhari 5675',
  },
  {
    id: 'sickness_when_in_pain',
    category: 'sickness',
    titleEn: 'When feeling pain in the body',
    arabic:
      'بِسْمِ ٱللَّٰهِ',
    transliteration: 'Bismillāh (×3), then: Aʿūdhu billāhi wa qudratihi min sharri mā ajidu wa uḥādhir (×7)',
    translation:
      'Place your hand on the painful area, say "Bismillāh" three times, then: "I seek refuge in Allah and His power from the evil of what I find and what I fear" seven times.',
    source: 'Sahih Muslim 2202',
    repeat: 7,
  },
  // — Funeral —
  {
    id: 'funeral_inna_lillah',
    category: 'funeral',
    titleEn: 'On hearing of a death',
    arabic: 'إِنَّا لِلَّٰهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ',
    transliteration: 'Innā lillāhi wa innā ilayhi rājiʿūn',
    translation: 'Indeed we belong to Allah, and indeed to Him we shall return.',
    source: 'Quran 2:156',
  },
  {
    id: 'funeral_consolation',
    category: 'funeral',
    titleEn: 'Consoling the bereaved',
    arabic:
      'إِنَّ لِلَّٰهِ مَا أَخَذَ، وَلَهُ مَا أَعْطَىٰ، وَكُلُّ شَيْءٍ عِنْدَهُ بِأَجَلٍ مُسَمًّى',
    transliteration:
      'Inna lillāhi mā akhadh, wa lahu mā aʿṭā, wa kullu shayʾin ʿindahu bi-ajalin musammā',
    translation:
      "Indeed to Allah belongs what He has taken, and to Him belongs what He has given, and everything with Him has an appointed term.",
    source: 'Sahih al-Bukhari 1284',
  },
  {
    id: 'funeral_graveyard_visit',
    category: 'funeral',
    titleEn: 'Entering a graveyard',
    arabic:
      'ٱلسَّلَامُ عَلَيْكُمْ أَهْلَ ٱلدِّيَارِ مِنَ ٱلْمُؤْمِنِينَ وَٱلْمُسْلِمِينَ، وَإِنَّا إِنْ شَاءَ ٱللَّٰهُ بِكُمْ لَلَاحِقُونَ',
    transliteration:
      'As-salāmu ʿalaykum ahla-d-diyāri mina-l-muʾminīna wal-muslimīn, wa innā in shāʾa-llāhu bikum la-lāḥiqūn',
    translation:
      'Peace be upon you, dwellers of these abodes from among the believers and Muslims. We will, Allah willing, be joining you.',
    source: 'Sahih Muslim 974',
  },
  // — Eid —
  {
    id: 'eid_takbir',
    category: 'eid',
    titleEn: 'Eid takbir',
    arabic:
      'ٱللَّٰهُ أَكْبَرُ، ٱللَّٰهُ أَكْبَرُ، لَا إِلَٰهَ إِلَّا ٱللَّٰهُ، وَٱللَّٰهُ أَكْبَرُ، ٱللَّٰهُ أَكْبَرُ، وَلِلَّٰهِ ٱلْحَمْدُ',
    transliteration:
      'Allāhu akbar, Allāhu akbar, lā ilāha illā-llāh, wallāhu akbar, Allāhu akbar, wa lillāhil-ḥamd',
    translation:
      'Allah is greatest, Allah is greatest. There is no god but Allah. Allah is greatest, Allah is greatest, and to Allah belongs all praise.',
    source: 'Practice of Ibn ʿUmar — Musannaf Ibn Abi Shaybah 5638',
  },
  {
    id: 'eid_taqabbal',
    category: 'eid',
    titleEn: 'Eid greeting',
    arabic: 'تَقَبَّلَ ٱللَّٰهُ مِنَّا وَمِنْكُمْ',
    transliteration: 'Taqabbalallāhu minnā wa minkum',
    translation: 'May Allah accept from us and from you.',
    source: 'Reported from the Companions — al-Mahamiliyyat 290',
  },
  // — Before Quran recitation —
  {
    id: 'beforeQuran_taawwudh',
    category: 'beforeQuran',
    titleEn: 'Seeking refuge before reciting',
    arabic: 'أَعُوذُ بِٱللَّٰهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ',
    transliteration: 'Aʿūdhu billāhi mina-sh-shayṭāni-r-rajīm',
    translation: 'I seek refuge in Allah from Satan, the accursed.',
    source: 'Quran 16:98',
  },
  {
    id: 'beforeQuran_basmalah',
    category: 'beforeQuran',
    titleEn: 'Beginning every action',
    arabic: 'بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    transliteration: 'Bismillāhi-r-Raḥmāni-r-Raḥīm',
    translation: 'In the name of Allah, the Most Gracious, the Most Merciful.',
    source: 'Quran 1:1',
  },
  // — Knowledge —
  {
    id: 'knowledge_seeking',
    category: 'knowledge',
    titleEn: 'For increase in knowledge',
    arabic: 'رَبِّ زِدْنِي عِلْمًا',
    transliteration: 'Rabbi zidnī ʿilmā',
    translation: 'My Lord, increase me in knowledge.',
    source: 'Quran 20:114',
  },
  {
    id: 'knowledge_understanding',
    category: 'knowledge',
    titleEn: 'For understanding',
    arabic:
      'ٱللَّٰهُمَّ ٱنْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا',
    transliteration:
      'Allāhumma-nfaʿnī bimā ʿallamtanī, wa ʿallimnī mā yanfaʿunī, wa zidnī ʿilmā',
    translation:
      'O Allah, benefit me by what You have taught me, teach me what benefits me, and increase me in knowledge.',
    source: 'Sunan Ibn Majah 251, Jami at-Tirmidhi 3599',
  },
  {
    id: 'knowledge_majlis_kaffarah',
    category: 'knowledge',
    titleEn: 'Closing a gathering (kaffarat al-majlis)',
    arabic:
      'سُبْحَانَكَ ٱللَّٰهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ',
    transliteration:
      'Subḥānaka-llāhumma wa bi-ḥamdik, ashhadu an lā ilāha illā ant, astaghfiruka wa atūbu ilayk',
    translation:
      'Glory and praise be to You, O Allah; I bear witness that there is no god but You. I seek Your forgiveness and turn to You in repentance.',
    source: 'Sunan Abi Dawud 4859',
  },
  // — Protection —
  {
    id: 'protection_morning_evening',
    category: 'protection',
    titleEn: 'Sayyid al-Istighfar shortened (×3 mornings & evenings)',
    arabic: 'ٱللَّٰهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ ٱلْهَمِّ وَٱلْحَزَنِ',
    transliteration: 'Allāhumma innī aʿūdhu bika mina-l-hammi wal-ḥazan',
    translation: 'O Allah, I seek refuge in You from grief and sadness.',
    source: 'Sahih al-Bukhari 6363',
  },
  {
    id: 'protection_evil_eye',
    category: 'protection',
    titleEn: 'Against the evil eye',
    arabic:
      'مَا شَاءَ ٱللَّٰهُ، لَا قُوَّةَ إِلَّا بِٱللَّٰهِ',
    transliteration: 'Mā shāʾa-llāh, lā quwwata illā billāh',
    translation:
      'What Allah has willed; there is no power except with Allah.',
    source: 'Quran 18:39',
  },
  {
    id: 'protection_entering_home',
    category: 'protection',
    titleEn: 'Entering the home',
    arabic:
      'بِسْمِ ٱللَّٰهِ وَلَجْنَا، وَبِسْمِ ٱللَّٰهِ خَرَجْنَا، وَعَلَىٰ ٱللَّٰهِ رَبِّنَا تَوَكَّلْنَا',
    transliteration:
      'Bismillāhi walajnā, wa bismillāhi kharajnā, wa ʿalā-llāhi rabbinā tawakkalnā',
    translation:
      'In the name of Allah we enter, in the name of Allah we leave, and upon Allah our Lord we rely.',
    source: 'Sunan Abi Dawud 5096',
  },
  {
    id: 'protection_leaving_home',
    category: 'protection',
    titleEn: 'Leaving the home',
    arabic:
      'بِسْمِ ٱللَّٰهِ، تَوَكَّلْتُ عَلَى ٱللَّٰهِ، لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ',
    transliteration:
      'Bismillāh, tawakkaltu ʿalā-llāh, lā ḥawla wa lā quwwata illā billāh',
    translation:
      'In the name of Allah, I rely upon Allah; there is no might nor power except with Allah.',
    source: 'Sunan Abi Dawud 5095, Jami at-Tirmidhi 3426',
  },
  {
    id: 'protection_market',
    category: 'protection',
    titleEn: 'Entering the marketplace',
    arabic:
      'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، يُحْيِي وَيُمِيتُ، وَهُوَ حَيٌّ لَا يَمُوتُ، بِيَدِهِ ٱلْخَيْرُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, yuḥyī wa yumīt, wa huwa ḥayyun lā yamūt, bi-yadihi-l-khayr, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'There is no god but Allah alone, with no partner. To Him belongs all sovereignty and all praise. He gives life and causes death. He is Ever-Living and does not die. In His hand is all goodness, and He is over all things capable.',
    source: 'Jami at-Tirmidhi 3428, Sunan Ibn Majah 2235',
  },
  // — Guidance —
  {
    id: 'guidance_istikharah',
    category: 'guidance',
    titleEn: 'Salat al-Istikharah (decision-seeking) — full text',
    arabic:
      'ٱللَّٰهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ ٱلْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ ٱلْغُيُوبِ. ٱللَّٰهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَٰذَا ٱلْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَٱقْدُرْهُ لِي وَيَسِّرْهُ لِي ثُمَّ بَارِكْ لِي فِيهِ. وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَٰذَا ٱلْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَٱصْرِفْهُ عَنِّي وَٱصْرِفْنِي عَنْهُ وَٱقْدُرْ لِيَ ٱلْخَيْرَ حَيْثُ كَانَ ثُمَّ أَرْضِنِي بِهِ.',
    transliteration:
      'Allāhumma innī astakhīruka bi-ʿilmik, wa astaqdiruka bi-qudratik, wa asʾaluka min faḍlika-l-ʿaẓīm. Fa-innaka taqdiru wa lā aqdir, wa taʿlamu wa lā aʿlam, wa anta ʿallāmu-l-ghuyūb. Allāhumma in kunta taʿlamu anna hādhā-l-amra khayrun lī fī dīnī wa maʿāshī wa ʿāqibati amrī, fa-qdurhu lī wa yassirhu lī thumma bārik lī fīh. Wa in kunta taʿlamu anna hādhā-l-amra sharrun lī fī dīnī wa maʿāshī wa ʿāqibati amrī, fa-ṣrifhu ʿannī wa-ṣrifnī ʿanhu wa-qdur liyal-khayra ḥaythu kāna thumma arḍinī bih.',
    translation:
      'O Allah, I seek Your guidance through Your knowledge, and I seek strength through Your power, and I ask You of Your great bounty — for You are able and I am not, You know and I do not, and You are the Knower of the unseen. O Allah, if You know that this matter (mention it) is good for me in my religion, my livelihood, and the outcome of my affairs, then decree it for me, make it easy for me, and bless me in it. And if You know that this matter is bad for me in my religion, my livelihood, and the outcome of my affairs, then turn it away from me, turn me away from it, and decree for me good wherever it may be — then make me pleased with it.',
    source: 'Sahih al-Bukhari 1162. Pray two rakʿahs of voluntary prayer, then make this dua and name your specific need in place of "this matter".',
    repeat: 1,
  },
  {
    id: 'guidance_steadfastness',
    category: 'guidance',
    titleEn: 'For steadfastness on faith',
    arabic:
      'يَا مُقَلِّبَ ٱلْقُلُوبِ ثَبِّتْ قَلْبِي عَلَىٰ دِينِكَ',
    transliteration: 'Yā muqallibal-qulūb, thabbit qalbī ʿalā dīnik',
    translation:
      'O Turner of hearts, keep my heart firm upon Your religion.',
    source: 'Jami at-Tirmidhi 2140',
  },
  {
    id: 'guidance_rabbana_atina',
    category: 'guidance',
    titleEn: 'For good in this life and the next',
    arabic:
      'رَبَّنَا آتِنَا فِي ٱلدُّنْيَا حَسَنَةً وَفِي ٱلْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ ٱلنَّارِ',
    transliteration:
      'Rabbanā ātinā fid-dunyā ḥasanatan wa fil-ākhirati ḥasanatan wa qinā ʿadhāba-n-nār',
    translation:
      'Our Lord, give us in this world good and in the Hereafter good, and protect us from the punishment of the Fire.',
    source: 'Quran 2:201, Sahih al-Bukhari 6389 (most-recited duʿāʾ of the Prophet)',
  },
  {
    id: 'guidance_against_being_misled',
    category: 'guidance',
    titleEn: 'For protection against being misled',
    arabic:
      'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً، إِنَّكَ أَنْتَ ٱلْوَهَّابُ',
    transliteration:
      'Rabbanā lā tuzigh qulūbanā baʿda idh hadaytanā wa hab lanā min ladunka raḥmah, innaka anta-l-wahhāb',
    translation:
      'Our Lord, do not let our hearts deviate after You have guided us, and grant us from Yourself mercy. Indeed You are the Bestower.',
    source: 'Quran 3:8',
  },
] as const;

export const DUA_CATEGORIES: DuaCategory[] = [
  'morning',
  'evening',
  'afterPrayer',
  'food',
  'distress',
  'sleep',
  'travel',
  'mosque',
  'gratitude',
  'forgiveness',
  'weather',
  'family',
  'sickness',
  'funeral',
  'eid',
  'beforeQuran',
  'knowledge',
  'protection',
  'guidance',
];

export function duasByCategory(category: DuaCategory): Dua[] {
  return DUAS.filter(d => d.category === category);
}

export function findDua(id: string): Dua | undefined {
  return DUAS.find(d => d.id === id);
}
