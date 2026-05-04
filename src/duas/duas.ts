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
  // — Morning adhkar — order, repeat counts, and content match the
  //   uploaded أذكار الصباح note exactly (recited between Fajr and
  //   sunrise; can be made up later if missed).
  {
    id: 'morning_01_ayat_kursi',
    category: 'morning',
    titleEn: 'Ayat al-Kursi',
    arabic:
      'ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ، لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ، لَهُ مَا فِي ٱلسَّمَاوَاتِ وَمَا فِي ٱلْأَرْضِ، مَنْ ذَا ٱلَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ، يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ، وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ، وَسِعَ كُرْسِيُّهُ ٱلسَّمَاوَاتِ وَٱلْأَرْضَ، وَلَا يَؤُودُهُ حِفْظُهُمَا، وَهُوَ ٱلْعَلِيُّ ٱلْعَظِيمُ',
    transliteration:
      'Allāhu lā ilāha illā huwa-l-ḥayyu-l-qayyūm, lā taʾkhudhuhu sinatun wa lā nawm, lahu mā fī-s-samāwāti wa mā fī-l-arḍ, man dhā-lladhī yashfaʿu ʿindahu illā bi-idhnih, yaʿlamu mā bayna aydīhim wa mā khalfahum, wa lā yuḥīṭūna bi-shayʾin min ʿilmihi illā bi-mā shāʾ, wasiʿa kursiyyuhu-s-samāwāti wa-l-arḍ, wa lā yaʾūduhu ḥifẓuhumā, wa huwa-l-ʿaliyyu-l-ʿaẓīm',
    translation:
      'Allah — there is no god but He, the Ever-Living, the Self-Sustaining. Neither slumber nor sleep overtakes Him. To Him belongs whatever is in the heavens and whatever is on earth. Who is it that can intercede with Him except by His permission? He knows what is before them and what is behind them, and they encompass nothing of His knowledge except what He wills. His Throne extends over the heavens and the earth, and their preservation tires Him not, and He is the Most High, the Most Great.',
    source: 'Quran 2:255 — narrated by al-Hakim and Ibn Hibban',
  },
  {
    id: 'morning_02_three_quls',
    category: 'morning',
    titleEn: 'Surah al-Ikhlas, al-Falaq, an-Nas',
    arabic:
      'قُلْ هُوَ ٱللَّهُ أَحَدٌ · قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ · قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    transliteration:
      'Qul huwa-llāhu aḥad · Qul aʿūdhu bi-rabbi-l-falaq · Qul aʿūdhu bi-rabbi-n-nās',
    translation:
      'Recite Surah al-Ikhlas, al-Falaq, and an-Nas, three times each.',
    source: 'Jami at-Tirmidhi',
    repeat: 3,
  },
  {
    id: 'morning_03_fitra_islam',
    category: 'morning',
    titleEn: 'On the natural disposition of Islam',
    arabic:
      'أَصْبَحْنَا عَلَىٰ فِطْرَةِ ٱلْإِسْلَامِ، وَكَلِمَةِ ٱلْإِخْلَاصِ، وَدِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَمِلَّةِ أَبِينَا إِبْرَاهِيمَ، حَنِيفًا مُسْلِمًا، وَمَا كَانَ مِنَ ٱلْمُشْرِكِينَ',
    transliteration:
      'Aṣbaḥnā ʿalā fiṭrati-l-Islām, wa kalimati-l-ikhlāṣ, wa dīni nabiyyinā Muḥammadin ﷺ, wa millati abīnā Ibrāhīma, ḥanīfan musliman, wa mā kāna mina-l-mushrikīn.',
    translation:
      'We have entered the morning on the natural way of Islam, the word of sincere devotion, the religion of our Prophet Muhammad ﷺ, and the way of our father Ibrāhīm — a man of pure faith and a Muslim, and he was not of those who associate partners with Allah.',
    source: 'Narrated by Ahmad',
  },
  {
    id: 'morning_04_radhitu',
    category: 'morning',
    titleEn: 'Pleased with Allah as Lord',
    arabic:
      'رَضِيتُ بِٱللَّهِ رَبًّا، وَبِٱلْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
    transliteration:
      'Raḍītu billāhi rabbā, wa bi-l-Islāmi dīnā, wa bi-Muḥammadin ﷺ nabiyyā',
    translation:
      'I am pleased with Allah as Lord, with Islam as my religion, and with Muhammad ﷺ as my Prophet.',
    source: 'Narrated by the authors of the Sunan',
  },
  {
    id: 'morning_05_ilm_nafi',
    category: 'morning',
    titleEn: 'Beneficial knowledge, good provision, accepted deeds',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا',
    transliteration:
      'Allāhumma innī asʾaluka ʿilman nāfiʿan, wa rizqan ṭayyiban, wa ʿamalan mutaqabbalan',
    translation:
      'O Allah, I ask You for beneficial knowledge, good provision, and accepted deeds.',
    source: 'Narrated by Ibn Mājah',
  },
  {
    id: 'morning_06_bika_asbahna',
    category: 'morning',
    titleEn: 'By You we enter the morning',
    arabic:
      'ٱللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ ٱلنُّشُورُ',
    transliteration:
      'Allāhumma bika aṣbaḥnā, wa bika amsaynā, wa bika naḥyā, wa bika namūt, wa ilayka-n-nushūr',
    translation:
      'O Allah, by You we enter the morning and by You we enter the evening, by You we live and by You we die, and to You is the resurrection.',
    source: 'Narrated by the authors of the Sunan except an-Nasāʾī',
  },
  {
    id: 'morning_07_la_ilaha_illa_allah',
    category: 'morning',
    titleEn: 'There is no god but Allah alone',
    arabic:
      'لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'There is no god but Allah alone, with no partner. To Him belongs the dominion and to Him belongs all praise, and He is over all things capable.',
    source: 'Narrated by al-Bazzār and aṭ-Ṭabarānī in al-Duʿāʾ',
  },
  {
    id: 'morning_08_ya_hayyu_ya_qayyum',
    category: 'morning',
    titleEn: 'O Ever-Living, O Sustainer',
    arabic:
      'يَا حَيُّ يَا قَيُّومُ، بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَىٰ نَفْسِي طَرْفَةَ عَيْنٍ أَبَدًا',
    transliteration:
      'Yā ḥayyu yā qayyūm, bi-raḥmatika astaghīth, aṣliḥ lī shaʾnī kullah, wa lā takilnī ilā nafsī ṭarfata ʿaynin abadā',
    translation:
      'O Ever-Living, O Self-Sustaining, by Your mercy I seek aid. Set right all my affairs, and do not entrust me to my own self for the blink of an eye.',
    source: 'Narrated by al-Bazzār',
  },
  {
    id: 'morning_09_sayyid_al_istighfar',
    category: 'morning',
    titleEn: 'Sayyid al-Istighfar (master supplication of forgiveness)',
    arabic:
      'ٱللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا ٱسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي، فَٱغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ ٱلذُّنُوبَ إِلَّا أَنْتَ',
    transliteration:
      'Allāhumma anta Rabbī lā ilāha illā anta, khalaqtanī wa anā ʿabduk, wa anā ʿalā ʿahdika wa waʿdika ma-staṭaʿt, aʿūdhu bika min sharri mā ṣanaʿt, abūʾu laka bi-niʿmatika ʿalayya, wa abūʾu bi-dhanbī, fa-ghfir lī, fa-innahu lā yaghfiru-dh-dhunūba illā ant',
    translation:
      'O Allah, You are my Lord — there is no god but You. You created me and I am Your servant. I uphold Your covenant and Your promise as best I can. I seek refuge in You from the evil of what I have done. I acknowledge Your favour upon me, and I acknowledge my sin — so forgive me, for none forgives sins except You.',
    source: 'Narrated by al-Bukhārī',
  },
  {
    id: 'morning_10_fatir_as_samawat',
    category: 'morning',
    titleEn: 'Originator of the heavens and the earth',
    arabic:
      'ٱللَّهُمَّ فَاطِرَ ٱلسَّمَاوَاتِ وَٱلْأَرْضِ، عَالِمَ ٱلْغَيْبِ وَٱلشَّهَادَةِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ ٱلشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَىٰ نَفْسِي سُوءًا أَوْ أَجُرَّهُ إِلَىٰ مُسْلِمٍ',
    transliteration:
      'Allāhumma fāṭira-s-samāwāti wa-l-arḍ, ʿālima-l-ghaybi wa-sh-shahādah, rabba kulli shayʾin wa malīkahu, ashhadu an lā ilāha illā ant, aʿūdhu bika min sharri nafsī, wa min sharri-sh-shayṭāni wa shirkih, wa an aqtarifa ʿalā nafsī sūʾan aw ajurrahu ilā muslim',
    translation:
      'O Allah, Originator of the heavens and the earth, Knower of the seen and unseen, Lord of every thing and its Sovereign — I bear witness that there is no god but You. I seek refuge in You from the evil of my own self and from the evil of Satan and his polytheism, and from committing wrong against myself or bringing it upon a Muslim.',
    source: 'Narrated by at-Tirmidhī',
  },
  {
    id: 'morning_11_asbahna_walmulku_lillah',
    category: 'morning',
    titleEn: 'We and the dominion have entered the morning for Allah',
    arabic:
      'أَصْبَحْنَا وَأَصْبَحَ ٱلْمُلْكُ لِلَّهِ، وَٱلْحَمْدُ لِلَّهِ، وَلَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ، أَسْأَلُكَ خَيْرَ مَا فِي هَٰذَا ٱلْيَوْمِ، وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ هَٰذَا ٱلْيَوْمِ، وَشَرِّ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنَ ٱلْكَسَلِ وَسُوءِ ٱلْكِبَرِ، وَأَعُوذُ بِكَ مِنْ عَذَابِ ٱلنَّارِ وَعَذَابِ ٱلْقَبْرِ',
    transliteration:
      'Aṣbaḥnā wa aṣbaḥa-l-mulku lillāh, wa-l-ḥamdu lillāh, wa lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, wa huwa ʿalā kulli shayʾin qadīr. Asʾaluka khayra mā fī hādhā-l-yawm, wa khayra mā baʿdah, wa aʿūdhu bika min sharri hādhā-l-yawm, wa sharri mā baʿdah, wa aʿūdhu bika mina-l-kasali wa sūʾi-l-kibar, wa aʿūdhu bika min ʿadhābi-n-nāri wa ʿadhābi-l-qabr',
    translation:
      'We have entered the morning, and to Allah belongs all dominion. Praise is for Allah. There is no god but Allah alone, with no partner. To Him belongs the dominion and to Him belongs all praise, and He is over all things capable. I ask You for the good of this day and the good of what follows it, and I seek refuge in You from the evil of this day and the evil of what follows it. I seek refuge in You from laziness and the evil of old age, and from the punishment of the Fire and the punishment of the grave.',
    source: 'Narrated by Muslim',
  },
  {
    id: 'morning_12_afw_wa_afiya',
    category: 'morning',
    titleEn: 'Pardon and well-being',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَسْأَلُكَ ٱلْعَفْوَ وَٱلْعَافِيَةَ فِي ٱلدُّنْيَا وَٱلْآخِرَةِ، ٱللَّهُمَّ إِنِّي أَسْأَلُكَ ٱلْعَفْوَ وَٱلْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، ٱللَّهُمَّ ٱسْتُرْ عَوْرَاتِي، وَآمِنْ رَوْعَاتِي، وَٱحْفَظْنِي مِنْ بَيْنِ يَدَيَّ، وَمِنْ خَلْفِي، وَعَنْ يَمِينِي، وَعَنْ شِمَالِي، وَمِنْ فَوْقِي، وَأَعُوذُ بِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي',
    transliteration:
      'Allāhumma innī asʾaluka-l-ʿafwa wa-l-ʿāfiyata fī-d-dunyā wa-l-ākhirah, Allāhumma innī asʾaluka-l-ʿafwa wa-l-ʿāfiyata fī dīnī wa dunyāya wa ahlī wa mālī, Allāhumma-stur ʿawrātī, wa āmin rawʿātī, wa-ḥfaẓnī min bayni yadayya, wa min khalfī, wa ʿan yamīnī, wa ʿan shimālī, wa min fawqī, wa aʿūdhu bika an ughtāla min taḥtī',
    translation:
      'O Allah, I ask You for pardon and well-being in this world and the next. O Allah, I ask You for pardon and well-being in my religion, my worldly affairs, my family, and my wealth. O Allah, conceal my faults, ease my fears, and protect me from before me, behind me, on my right, on my left, and from above me. I seek refuge in You from being snatched away from below me.',
    source: 'Narrated by Abū Dāwūd and Ibn Mājah',
  },
  {
    id: 'morning_13_bismillah_la_yadurr',
    category: 'morning',
    titleEn: 'In the name of Allah with whose name nothing harms',
    arabic:
      'بِسْمِ ٱللَّهِ ٱلَّذِي لَا يَضُرُّ مَعَ ٱسْمِهِ شَيْءٌ فِي ٱلْأَرْضِ وَلَا فِي ٱلسَّمَاءِ، وَهُوَ ٱلسَّمِيعُ ٱلْعَلِيمُ',
    transliteration:
      'Bismillāhi-lladhī lā yaḍurru maʿasmihi shayʾun fī-l-arḍi wa lā fī-s-samāʾ, wa huwa-s-samīʿu-l-ʿalīm',
    translation:
      'In the name of Allah, with whose name nothing on earth or in the heaven can cause harm — and He is the All-Hearing, the All-Knowing.',
    source: 'Narrated by the authors of the Sunan except an-Nasāʾī',
    repeat: 3,
  },
  {
    id: 'morning_14_subhan_allah_adada_khalqih',
    category: 'morning',
    titleEn: 'Glory be to Allah, by the number of His creation',
    arabic:
      'سُبْحَانَ ٱللَّهِ عَدَدَ خَلْقِهِ، سُبْحَانَ ٱللَّهِ رِضَا نَفْسِهِ، سُبْحَانَ ٱللَّهِ زِنَةَ عَرْشِهِ، سُبْحَانَ ٱللَّهِ مِدَادَ كَلِمَاتِهِ',
    transliteration:
      'Subḥāna-llāhi ʿadada khalqih, subḥāna-llāhi riḍā nafsih, subḥāna-llāhi zinata ʿarshih, subḥāna-llāhi midāda kalimātih',
    translation:
      'Glory be to Allah, equal to the number of His creation; Glory be to Allah, equal to His pleasure with Himself; Glory be to Allah, equal to the weight of His Throne; Glory be to Allah, equal to the ink of His words.',
    source: 'Narrated by Muslim',
    repeat: 3,
  },
  {
    id: 'morning_15_afini_fi_badani',
    category: 'morning',
    titleEn: 'Grant me well-being in body, hearing, and sight',
    arabic:
      'ٱللَّهُمَّ عَافِنِي فِي بَدَنِي، ٱللَّهُمَّ عَافِنِي فِي سَمْعِي، ٱللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَٰهَ إِلَّا أَنْتَ، ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ ٱلْكُفْرِ وَٱلْفَقْرِ، ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ ٱلْقَبْرِ، لَا إِلَٰهَ إِلَّا أَنْتَ',
    transliteration:
      'Allāhumma ʿāfinī fī badanī, Allāhumma ʿāfinī fī samʿī, Allāhumma ʿāfinī fī baṣarī, lā ilāha illā ant, Allāhumma innī aʿūdhu bika mina-l-kufri wa-l-faqr, Allāhumma innī aʿūdhu bika min ʿadhābi-l-qabr, lā ilāha illā ant',
    translation:
      'O Allah, grant me well-being in my body. O Allah, grant me well-being in my hearing. O Allah, grant me well-being in my sight. There is no god but You. O Allah, I seek refuge in You from disbelief and from poverty. O Allah, I seek refuge in You from the punishment of the grave. There is no god but You.',
    source: 'Narrated by Abū Dāwūd',
    repeat: 3,
  },
  {
    id: 'morning_16_hasbiy_allah',
    category: 'morning',
    titleEn: 'Allah suffices me',
    arabic:
      'حَسْبِيَ ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ ٱلْعَرْشِ ٱلْعَظِيمِ',
    transliteration:
      'Ḥasbiya-llāhu lā ilāha illā huwa ʿalayhi tawakkaltu wa huwa rabbu-l-ʿarshi-l-ʿaẓīm',
    translation:
      'Allah suffices me; there is no god but He. Upon Him I rely, and He is the Lord of the Mighty Throne.',
    source: 'Quran 9:129 — narrated by Abū Dāwūd',
    repeat: 7,
  },
  {
    id: 'morning_17_ushhiduka',
    category: 'morning',
    titleEn: 'I take You as witness this morning',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَصْبَحْتُ، أُشْهِدُكَ وَأُشْهِدُ حَمَلَةَ عَرْشِكَ وَمَلَائِكَتَكَ وَجَمِيعَ خَلْقِكَ أَنَّكَ أَنْتَ ٱللَّهُ، وَحْدَكَ لَا شَرِيكَ لَكَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ',
    transliteration:
      'Allāhumma innī aṣbaḥt, ushhiduka wa ushhidu ḥamalata ʿarshika wa malāʾikataka wa jamīʿa khalqika annaka anta-llāh, waḥdaka lā sharīka lak, wa anna Muḥammadan ʿabduka wa rasūluk',
    translation:
      "O Allah, I have entered the morning and I take You as witness, and I take Your throne-bearers, Your angels, and all of Your creation as witnesses, that You are Allah, alone with no partner, and that Muhammad is Your servant and Messenger.",
    source: 'Narrated by Abū Dāwūd and at-Tirmidhī',
    repeat: 4,
  },
  {
    id: 'morning_18_la_ilaha_yuhyi_yumit',
    category: 'morning',
    titleEn: 'No god but Allah — He gives life and causes death',
    arabic:
      'لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، يُحْيِي وَيُمِيتُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, yuḥyī wa yumīt, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'There is no god but Allah alone, with no partner. To Him belongs the dominion and to Him belongs all praise. He gives life and causes death, and He is over all things capable.',
    source: 'Narrated by Ibn Ḥibbān',
    repeat: 10,
  },
  {
    id: 'morning_19_subhan_allah_wa_bihamdihi',
    category: 'morning',
    titleEn: 'Glory be to Allah and praise be to Him',
    arabic:
      'سُبْحَانَ ٱللَّهِ وَبِحَمْدِهِ — أَوْ — سُبْحَانَ ٱللَّهِ ٱلْعَظِيمِ وَبِحَمْدِهِ',
    transliteration:
      'Subḥāna-llāhi wa bi-ḥamdih — or — Subḥāna-llāhi-l-ʿaẓīmi wa bi-ḥamdih',
    translation:
      'Glory be to Allah and praise be to Him — or — Glory be to Allah the Magnificent and praise be to Him. (One hundred times or more.)',
    source: 'Narrated by Muslim',
    repeat: 100,
  },
  {
    id: 'morning_20_astaghfirullah',
    category: 'morning',
    titleEn: 'I seek the forgiveness of Allah',
    arabic: 'أَسْتَغْفِرُ ٱللَّهَ',
    transliteration: 'Astaghfiru-llāh',
    translation: 'I seek the forgiveness of Allah. (One hundred times.)',
    source: 'Narrated by Ibn Abī Shaybah',
    repeat: 100,
  },
  {
    id: 'morning_21_subhan_alhamdu_takbir',
    category: 'morning',
    titleEn: 'Tasbih, Tahmid, Takbir, Tahlil',
    arabic:
      'سُبْحَانَ ٱللَّهِ، وَٱلْحَمْدُ لِلَّهِ، وَٱللَّهُ أَكْبَرُ، لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Subḥāna-llāh, wa-l-ḥamdu lillāh, wa-llāhu akbar, lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'Glory be to Allah, praise be to Allah, and Allah is the Greatest. There is no god but Allah alone, with no partner; to Him belongs the dominion and the praise, and He is over all things capable. (One hundred times or more.)',
    source: 'Narrated by at-Tirmidhī',
    repeat: 100,
  },

  // — Evening adhkar — order, repeat counts, and content match the
  //   uploaded أذكار المساء note exactly (recited between ʿAṣr and
  //   sunset; can be made up later if missed).
  {
    id: 'evening_01_ayat_kursi',
    category: 'evening',
    titleEn: 'Ayat al-Kursi',
    arabic:
      'ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ، لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ، لَهُ مَا فِي ٱلسَّمَاوَاتِ وَمَا فِي ٱلْأَرْضِ، مَنْ ذَا ٱلَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ، يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ، وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ، وَسِعَ كُرْسِيُّهُ ٱلسَّمَاوَاتِ وَٱلْأَرْضَ، وَلَا يَؤُودُهُ حِفْظُهُمَا، وَهُوَ ٱلْعَلِيُّ ٱلْعَظِيمُ',
    transliteration:
      'Allāhu lā ilāha illā huwa-l-ḥayyu-l-qayyūm, lā taʾkhudhuhu sinatun wa lā nawm, lahu mā fī-s-samāwāti wa mā fī-l-arḍ, man dhā-lladhī yashfaʿu ʿindahu illā bi-idhnih, yaʿlamu mā bayna aydīhim wa mā khalfahum, wa lā yuḥīṭūna bi-shayʾin min ʿilmihi illā bi-mā shāʾ, wasiʿa kursiyyuhu-s-samāwāti wa-l-arḍ, wa lā yaʾūduhu ḥifẓuhumā, wa huwa-l-ʿaliyyu-l-ʿaẓīm',
    translation:
      'Allah — there is no god but He, the Ever-Living, the Self-Sustaining. (See morning Ayat al-Kursi for full translation.)',
    source: 'Quran 2:255 — narrated by al-Ḥākim and Ibn Ḥibbān',
  },
  {
    id: 'evening_02_three_quls',
    category: 'evening',
    titleEn: 'Surah al-Ikhlas, al-Falaq, an-Nas',
    arabic:
      'قُلْ هُوَ ٱللَّهُ أَحَدٌ · قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ · قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    transliteration:
      'Qul huwa-llāhu aḥad · Qul aʿūdhu bi-rabbi-l-falaq · Qul aʿūdhu bi-rabbi-n-nās',
    translation:
      'Recite Surah al-Ikhlas, al-Falaq, and an-Nas, three times each.',
    source: 'Jami at-Tirmidhī',
    repeat: 3,
  },
  {
    id: 'evening_03_fitra_islam',
    category: 'evening',
    titleEn: 'On the natural disposition of Islam (evening)',
    arabic:
      'أَمْسَيْنَا عَلَىٰ فِطْرَةِ ٱلْإِسْلَامِ، وَكَلِمَةِ ٱلْإِخْلَاصِ، وَدِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَمِلَّةِ أَبِينَا إِبْرَاهِيمَ، حَنِيفًا مُسْلِمًا، وَمَا كَانَ مِنَ ٱلْمُشْرِكِينَ',
    transliteration:
      'Amsaynā ʿalā fiṭrati-l-Islām, wa kalimati-l-ikhlāṣ, wa dīni nabiyyinā Muḥammadin ﷺ, wa millati abīnā Ibrāhīma, ḥanīfan musliman, wa mā kāna mina-l-mushrikīn.',
    translation:
      'We have entered the evening on the natural way of Islam, the word of sincere devotion, the religion of our Prophet Muhammad ﷺ, and the way of our father Ibrāhīm — a man of pure faith and a Muslim, and he was not of those who associate partners with Allah.',
    source: 'Narrated by Aḥmad',
  },
  {
    id: 'evening_04_radhitu',
    category: 'evening',
    titleEn: 'Pleased with Allah as Lord',
    arabic:
      'رَضِيتُ بِٱللَّهِ رَبًّا، وَبِٱلْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
    transliteration:
      'Raḍītu billāhi rabbā, wa bi-l-Islāmi dīnā, wa bi-Muḥammadin ﷺ nabiyyā',
    translation:
      'I am pleased with Allah as Lord, with Islam as my religion, and with Muhammad ﷺ as my Prophet.',
    source: 'Narrated by the authors of the Sunan',
  },
  {
    id: 'evening_05_bika_amsayna',
    category: 'evening',
    titleEn: 'By You we enter the evening',
    arabic:
      'ٱللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ ٱلْمَصِيرُ',
    transliteration:
      'Allāhumma bika amsaynā, wa bika aṣbaḥnā, wa bika naḥyā, wa bika namūt, wa ilayka-l-maṣīr',
    translation:
      'O Allah, by You we enter the evening and by You we enter the morning, by You we live and by You we die, and to You is the final return.',
    source: 'Narrated by the authors of the Sunan except an-Nasāʾī',
  },
  {
    id: 'evening_06_la_ilaha_illa_allah',
    category: 'evening',
    titleEn: 'There is no god but Allah alone',
    arabic:
      'لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'There is no god but Allah alone, with no partner. To Him belongs the dominion and to Him belongs all praise, and He is over all things capable.',
    source: 'Narrated by al-Bazzār and aṭ-Ṭabarānī in al-Duʿāʾ',
  },
  {
    id: 'evening_07_ya_hayyu_ya_qayyum',
    category: 'evening',
    titleEn: 'O Ever-Living, O Sustainer',
    arabic:
      'يَا حَيُّ يَا قَيُّومُ، بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَىٰ نَفْسِي طَرْفَةَ عَيْنٍ أَبَدًا',
    transliteration:
      'Yā ḥayyu yā qayyūm, bi-raḥmatika astaghīth, aṣliḥ lī shaʾnī kullah, wa lā takilnī ilā nafsī ṭarfata ʿaynin abadā',
    translation:
      'O Ever-Living, O Self-Sustaining, by Your mercy I seek aid. Set right all my affairs, and do not entrust me to my own self for the blink of an eye.',
    source: 'Narrated by al-Bazzār',
  },
  {
    id: 'evening_08_sayyid_al_istighfar',
    category: 'evening',
    titleEn: 'Sayyid al-Istighfar (master supplication of forgiveness)',
    arabic:
      'ٱللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا ٱسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي، فَٱغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ ٱلذُّنُوبَ إِلَّا أَنْتَ',
    transliteration:
      'Allāhumma anta Rabbī lā ilāha illā anta, khalaqtanī wa anā ʿabduk, wa anā ʿalā ʿahdika wa waʿdika ma-staṭaʿt, aʿūdhu bika min sharri mā ṣanaʿt, abūʾu laka bi-niʿmatika ʿalayya, wa abūʾu bi-dhanbī, fa-ghfir lī, fa-innahu lā yaghfiru-dh-dhunūba illā ant',
    translation:
      'O Allah, You are my Lord — there is no god but You. You created me and I am Your servant. I uphold Your covenant and Your promise as best I can. I seek refuge in You from the evil of what I have done. I acknowledge Your favour upon me, and I acknowledge my sin — so forgive me, for none forgives sins except You.',
    source: 'Narrated by al-Bukhārī',
  },
  {
    id: 'evening_09_fatir_as_samawat',
    category: 'evening',
    titleEn: 'Originator of the heavens and the earth',
    arabic:
      'ٱللَّهُمَّ فَاطِرَ ٱلسَّمَاوَاتِ وَٱلْأَرْضِ، عَالِمَ ٱلْغَيْبِ وَٱلشَّهَادَةِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ ٱلشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَىٰ نَفْسِي سُوءًا أَوْ أَجُرَّهُ إِلَىٰ مُسْلِمٍ',
    transliteration:
      'Allāhumma fāṭira-s-samāwāti wa-l-arḍ, ʿālima-l-ghaybi wa-sh-shahādah, rabba kulli shayʾin wa malīkahu, ashhadu an lā ilāha illā ant, aʿūdhu bika min sharri nafsī, wa min sharri-sh-shayṭāni wa shirkih, wa an aqtarifa ʿalā nafsī sūʾan aw ajurrahu ilā muslim',
    translation:
      'O Allah, Originator of the heavens and the earth, Knower of the seen and unseen, Lord of every thing and its Sovereign — I bear witness that there is no god but You. I seek refuge in You from the evil of my own self and from the evil of Satan and his polytheism, and from committing wrong against myself or bringing it upon a Muslim.',
    source: 'Narrated by at-Tirmidhī',
  },
  {
    id: 'evening_10_amsayna_walmulku_lillah',
    category: 'evening',
    titleEn: 'We and the dominion have entered the evening for Allah',
    arabic:
      'أَمْسَيْنَا وَأَمْسَى ٱلْمُلْكُ لِلَّهِ، وَٱلْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، ٱللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ خَيْرِ مَا فِي هَٰذِهِ ٱللَّيْلَةِ، وَخَيْرِ مَا بَعْدَهَا، ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ شَرِّ هَٰذِهِ ٱللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ ٱلْكَسَلِ وَسُوءِ ٱلْكِبَرِ، وَأَعُوذُ بِكَ مِنْ عَذَابٍ فِي ٱلنَّارِ وَعَذَابٍ فِي ٱلْقَبْرِ',
    transliteration:
      'Amsaynā wa amsa-l-mulku lillāh, wa-l-ḥamdu lillāh, lā ilāha illa-llāhu waḥdahu lā sharīka lah. Allāhumma innī asʾaluka min khayri mā fī hādhihi-l-laylah, wa khayri mā baʿdahā. Allāhumma innī aʿūdhu bika min sharri hādhihi-l-laylah wa sharri mā baʿdahā. Allāhumma innī aʿūdhu bika mina-l-kasali wa sūʾi-l-kibar, wa aʿūdhu bika min ʿadhābin fī-n-nāri wa ʿadhābin fī-l-qabr',
    translation:
      'We have entered the evening, and to Allah belongs all dominion. Praise is for Allah. There is no god but Allah alone, with no partner. O Allah, I ask You for the good of this night and the good of what follows it. O Allah, I seek refuge in You from the evil of this night and the evil of what follows it. O Allah, I seek refuge in You from laziness and the evil of old age, and I seek refuge in You from punishment in the Fire and punishment in the grave.',
    source: 'Narrated by Muslim',
  },
  {
    id: 'evening_11_afw_wa_afiya',
    category: 'evening',
    titleEn: 'Pardon and well-being',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَسْأَلُكَ ٱلْعَفْوَ وَٱلْعَافِيَةَ فِي ٱلدُّنْيَا وَٱلْآخِرَةِ، ٱللَّهُمَّ إِنِّي أَسْأَلُكَ ٱلْعَفْوَ وَٱلْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، ٱللَّهُمَّ ٱسْتُرْ عَوْرَاتِي، وَآمِنْ رَوْعَاتِي، وَٱحْفَظْنِي مِنْ بَيْنِ يَدَيَّ، وَمِنْ خَلْفِي، وَعَنْ يَمِينِي، وَعَنْ شِمَالِي، وَمِنْ فَوْقِي، وَأَعُوذُ بِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي',
    transliteration:
      'Allāhumma innī asʾaluka-l-ʿafwa wa-l-ʿāfiyata fī-d-dunyā wa-l-ākhirah, Allāhumma innī asʾaluka-l-ʿafwa wa-l-ʿāfiyata fī dīnī wa dunyāya wa ahlī wa mālī, Allāhumma-stur ʿawrātī, wa āmin rawʿātī, wa-ḥfaẓnī min bayni yadayya, wa min khalfī, wa ʿan yamīnī, wa ʿan shimālī, wa min fawqī, wa aʿūdhu bika an ughtāla min taḥtī',
    translation:
      'O Allah, I ask You for pardon and well-being in this world and the next. O Allah, I ask You for pardon and well-being in my religion, my worldly affairs, my family, and my wealth. O Allah, conceal my faults, ease my fears, and protect me from before me, behind me, on my right, on my left, and from above me. I seek refuge in You from being snatched away from below me.',
    source: 'Narrated by Abū Dāwūd and Ibn Mājah',
  },
  {
    id: 'evening_12_bismillah_la_yadurr',
    category: 'evening',
    titleEn: 'In the name of Allah with whose name nothing harms',
    arabic:
      'بِسْمِ ٱللَّهِ ٱلَّذِي لَا يَضُرُّ مَعَ ٱسْمِهِ شَيْءٌ فِي ٱلْأَرْضِ وَلَا فِي ٱلسَّمَاءِ، وَهُوَ ٱلسَّمِيعُ ٱلْعَلِيمُ',
    transliteration:
      'Bismillāhi-lladhī lā yaḍurru maʿasmihi shayʾun fī-l-arḍi wa lā fī-s-samāʾ, wa huwa-s-samīʿu-l-ʿalīm',
    translation:
      'In the name of Allah, with whose name nothing on earth or in the heaven can cause harm — and He is the All-Hearing, the All-Knowing.',
    source: 'Narrated by the authors of the Sunan except an-Nasāʾī',
    repeat: 3,
  },
  {
    id: 'evening_13_taamat_protection',
    category: 'evening',
    titleEn: 'Refuge in the perfect words of Allah',
    arabic:
      'أَعُوذُ بِكَلِمَاتِ ٱللَّهِ ٱلتَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    transliteration:
      'Aʿūdhu bi-kalimāti-llāhi-t-tāmmāti min sharri mā khalaq',
    translation:
      'I seek refuge in the perfect words of Allah from the evil of what He has created.',
    source: 'Narrated by Muslim',
    repeat: 3,
  },
  {
    id: 'evening_14_afini_fi_badani',
    category: 'evening',
    titleEn: 'Grant me well-being in body, hearing, and sight',
    arabic:
      'ٱللَّهُمَّ عَافِنِي فِي بَدَنِي، ٱللَّهُمَّ عَافِنِي فِي سَمْعِي، ٱللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَٰهَ إِلَّا أَنْتَ، ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ ٱلْكُفْرِ وَٱلْفَقْرِ، ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ ٱلْقَبْرِ، لَا إِلَٰهَ إِلَّا أَنْتَ',
    transliteration:
      'Allāhumma ʿāfinī fī badanī, Allāhumma ʿāfinī fī samʿī, Allāhumma ʿāfinī fī baṣarī, lā ilāha illā ant, Allāhumma innī aʿūdhu bika mina-l-kufri wa-l-faqr, Allāhumma innī aʿūdhu bika min ʿadhābi-l-qabr, lā ilāha illā ant',
    translation:
      'O Allah, grant me well-being in my body. O Allah, grant me well-being in my hearing. O Allah, grant me well-being in my sight. There is no god but You. O Allah, I seek refuge in You from disbelief and from poverty. O Allah, I seek refuge in You from the punishment of the grave. There is no god but You.',
    source: 'Narrated by Abū Dāwūd',
    repeat: 3,
  },
  {
    id: 'evening_15_hasbiy_allah',
    category: 'evening',
    titleEn: 'Allah suffices me',
    arabic:
      'حَسْبِيَ ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ ٱلْعَرْشِ ٱلْعَظِيمِ',
    transliteration:
      'Ḥasbiya-llāhu lā ilāha illā huwa ʿalayhi tawakkaltu wa huwa rabbu-l-ʿarshi-l-ʿaẓīm',
    translation:
      'Allah suffices me; there is no god but He. Upon Him I rely, and He is the Lord of the Mighty Throne.',
    source: 'Quran 9:129 — narrated by Abū Dāwūd',
    repeat: 7,
  },
  {
    id: 'evening_16_ushhiduka',
    category: 'evening',
    titleEn: 'I take You as witness this evening',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَمْسَيْتُ، أُشْهِدُكَ وَأُشْهِدُ حَمَلَةَ عَرْشِكَ وَمَلَائِكَتَكَ وَجَمِيعَ خَلْقِكَ أَنَّكَ أَنْتَ ٱللَّهُ، وَحْدَكَ لَا شَرِيكَ لَكَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ',
    transliteration:
      'Allāhumma innī amsayt, ushhiduka wa ushhidu ḥamalata ʿarshika wa malāʾikataka wa jamīʿa khalqika annaka anta-llāh, waḥdaka lā sharīka lak, wa anna Muḥammadan ʿabduka wa rasūluk',
    translation:
      "O Allah, I have entered the evening and I take You as witness, and I take Your throne-bearers, Your angels, and all of Your creation as witnesses, that You are Allah, alone with no partner, and that Muhammad is Your servant and Messenger.",
    source: 'Narrated by Abū Dāwūd and at-Tirmidhī',
    repeat: 4,
  },
  {
    id: 'evening_17_la_ilaha_yuhyi_yumit',
    category: 'evening',
    titleEn: 'No god but Allah — He gives life and causes death',
    arabic:
      'لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، يُحْيِي وَيُمِيتُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, yuḥyī wa yumīt, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'There is no god but Allah alone, with no partner. To Him belongs the dominion and to Him belongs all praise. He gives life and causes death, and He is over all things capable.',
    source: 'Narrated by Ibn Ḥibbān',
    repeat: 10,
  },
  {
    id: 'evening_18_subhan_allah_wa_bihamdihi',
    category: 'evening',
    titleEn: 'Glory be to Allah and praise be to Him',
    arabic:
      'سُبْحَانَ ٱللَّهِ وَبِحَمْدِهِ — أَوْ — سُبْحَانَ ٱللَّهِ ٱلْعَظِيمِ وَبِحَمْدِهِ',
    transliteration:
      'Subḥāna-llāhi wa bi-ḥamdih — or — Subḥāna-llāhi-l-ʿaẓīmi wa bi-ḥamdih',
    translation:
      'Glory be to Allah and praise be to Him — or — Glory be to Allah the Magnificent and praise be to Him. (One hundred times or more.)',
    source: 'Narrated by Muslim',
    repeat: 100,
  },
  {
    id: 'evening_19_astaghfirullah',
    category: 'evening',
    titleEn: 'I seek the forgiveness of Allah',
    arabic: 'أَسْتَغْفِرُ ٱللَّهَ',
    transliteration: 'Astaghfiru-llāh',
    translation: 'I seek the forgiveness of Allah. (One hundred times.)',
    source: 'Narrated by Ibn Abī Shaybah',
    repeat: 100,
  },
  {
    id: 'evening_20_subhan_alhamdu_takbir',
    category: 'evening',
    titleEn: 'Tasbih, Tahmid, Takbir, Tahlil',
    arabic:
      'سُبْحَانَ ٱللَّهِ، وَٱلْحَمْدُ لِلَّهِ، وَٱللَّهُ أَكْبَرُ، لَا إِلَٰهَ إِلَّا ٱللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration:
      'Subḥāna-llāh, wa-l-ḥamdu lillāh, wa-llāhu akbar, lā ilāha illa-llāhu waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd, wa huwa ʿalā kulli shayʾin qadīr',
    translation:
      'Glory be to Allah, praise be to Allah, and Allah is the Greatest. There is no god but Allah alone, with no partner; to Him belongs the dominion and the praise, and He is over all things capable. (One hundred times or more.)',
    source: 'Narrated by at-Tirmidhī',
    repeat: 100,
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
  {
    id: 'afterPrayer_ayat_kursi',
    category: 'afterPrayer',
    titleEn: 'Ayat al-Kursi after every fard prayer',
    arabic:
      'ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ، لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ، لَهُ مَا فِي ٱلسَّمَاوَاتِ وَمَا فِي ٱلْأَرْضِ، مَنْ ذَا ٱلَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ، يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ، وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ، وَسِعَ كُرْسِيُّهُ ٱلسَّمَاوَاتِ وَٱلْأَرْضَ، وَلَا يَؤُودُهُ حِفْظُهُمَا، وَهُوَ ٱلْعَلِيُّ ٱلْعَظِيمُ',
    transliteration:
      'Allāhu lā ilāha illā huwa-l-ḥayyu-l-qayyūm, lā taʾkhudhuhu sinatun wa lā nawm…',
    translation:
      'Whoever recites Ayat al-Kursi after every prescribed prayer, nothing prevents him from entering Paradise except death.',
    source: 'Quran 2:255 — Sunan an-Nasāʾī al-Kubrā 9928',
  },
  {
    id: 'afterPrayer_three_quls',
    category: 'afterPrayer',
    titleEn: 'Surah al-Ikhlas, al-Falaq, an-Nas after every fard prayer',
    arabic:
      'قُلْ هُوَ ٱللَّهُ أَحَدٌ · قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ · قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    transliteration:
      'Qul huwa-llāhu aḥad · Qul aʿūdhu bi-rabbi-l-falaq · Qul aʿūdhu bi-rabbi-n-nās',
    translation:
      'Recite the three Quls after every prescribed prayer (three times after Fajr and Maghrib).',
    source: 'Sunan Abī Dāwūd 1523, Jāmiʿ at-Tirmidhī 2903',
    repeat: 1,
  },
  // — Food — Sunnah is to begin with bismillāh, eat with the right
  //   hand from what is in front of you, and praise Allah at the end
  //   with one of the wordings the Prophet ﷺ taught.
  {
    id: 'food_before',
    category: 'food',
    titleEn: 'Before eating — bismillāh',
    arabic: 'بِسْمِ ٱللَّهِ — أَوْ — بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    transliteration:
      'Bismillāh — or — Bismillāhi-r-raḥmāni-r-raḥīm',
    translation:
      'In the name of Allah — or — In the name of Allah, the Most Gracious, the Most Merciful. Eat with the right hand from what is closest to you.',
    source:
      'The Prophet ﷺ to ʿUmar ibn Abī Salamah: "Say bismillāh, eat with your right hand, and eat from what is closest to you" — Sahih al-Bukhari 5376, Sahih Muslim 2022.',
  },
  {
    id: 'food_after_min_ghayri_hawlin',
    category: 'food',
    titleEn: 'After eating — without might or power from me',
    arabic:
      'ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَطْعَمَنِي هَٰذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ',
    transliteration:
      'Al-ḥamdu lillāhi-lladhī aṭʿamanī hādhā wa razaqanīhi min ghayri ḥawlin minnī wa lā quwwah',
    translation:
      'All praise is for Allah who fed me this and provided it for me, without any might or power from myself.',
    source:
      'Whoever says this after eating, his past sins are forgiven — Sunan Abī Dāwūd 4023, Jāmiʿ at-Tirmidhī 3458.',
  },
  {
    id: 'food_after_atamana_wa_saqana',
    category: 'food',
    titleEn: 'After eating — fed and quenched and made us Muslims',
    arabic:
      'ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ',
    transliteration:
      'Al-ḥamdu lillāhi-lladhī aṭʿamanā wa saqānā wa jaʿalanā muslimīn',
    translation:
      'All praise is for Allah who has fed us and given us drink and made us Muslims.',
    source: 'Sunan Abī Dāwūd 3850, Jāmiʿ at-Tirmidhī 3457',
  },
  {
    id: 'food_after_atama_wa_saqa_makhraj',
    category: 'food',
    titleEn: 'After eating — fed, quenched, and made it palatable',
    arabic:
      'ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَطْعَمَ وَسَقَىٰ، وَسَوَّغَهُ، وَجَعَلَ لَهُ مَخْرَجًا',
    transliteration:
      'Al-ḥamdu lillāhi-lladhī aṭʿama wa saqā, wa sawwaghahu, wa jaʿala lahu makhrajan',
    translation:
      'All praise is for Allah who fed and gave drink, made it easy to swallow, and provided a way out for it.',
    source: 'Sunan Abī Dāwūd 3851',
  },
  {
    id: 'food_after_atamana_wa_kafana',
    category: 'food',
    titleEn: 'After eating — fed, quenched, sufficed, sheltered',
    arabic:
      'ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَطْعَمَنَا وَسَقَانَا وَكَفَانَا وَآوَانَا، فَكَمْ مِمَّنْ لَا كَافِيَ لَهُ وَلَا مُؤْوِيَ',
    transliteration:
      'Al-ḥamdu lillāhi-lladhī aṭʿamanā wa saqānā wa kafānā wa āwānā, fa-kam mimman lā kāfiya lahu wa lā muʾwī',
    translation:
      'All praise is for Allah who fed us, gave us drink, sufficed us, and gave us shelter — for how many have neither one to suffice them nor one to give them shelter.',
    source: 'Sahih Muslim 2715',
  },
  {
    id: 'food_after_kathiran_tayyiban',
    category: 'food',
    titleEn: 'After eating — much, good, blessed praise',
    arabic:
      'ٱلْحَمْدُ لِلَّهِ حَمْدًا كَثِيرًا طَيِّبًا مُبَارَكًا فِيهِ، غَيْرَ مَكْفِيٍّ وَلَا مَكْفُورٍ وَلَا مُوَدَّعٍ وَلَا مُسْتَغْنًى عَنْهُ رَبَّنَا',
    transliteration:
      'Al-ḥamdu lillāhi ḥamdan kathīran ṭayyiban mubārakan fīh, ghayra makfiyyin wa lā makfūrin wa lā muwaddaʿin wa lā mustaghnan ʿanhu rabbanā',
    translation:
      'All praise is for Allah — abundant, good, blessed praise — not insufficient, not denied, not bidden farewell to, never to be dispensed with, our Lord.',
    source: 'Sahih al-Bukhari 5458',
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
  // — Sleep — Mu'awwidhāt + the prophetic supplications said when one
  //   takes to one's bed. Order roughly follows Ibn al-Qayyim's
  //   compilation in Zād al-Maʿād plus the longer Bukhārī/Muslim
  //   narrations the user noted.
  {
    id: 'sleep_three_quls',
    category: 'sleep',
    titleEn: 'The Muʿawwidhāt — al-Ikhlas, al-Falaq, an-Nas',
    arabic:
      'قُلْ هُوَ ٱللَّهُ أَحَدٌ · قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ · قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ',
    transliteration:
      'Qul huwa-llāhu aḥad · Qul aʿūdhu bi-rabbi-l-falaq · Qul aʿūdhu bi-rabbi-n-nās',
    translation:
      'When the Prophet ﷺ went to bed he would blow into his hands while reciting the Muʿawwidhāt and Surah al-Ikhlas, then wipe over his face and as much of his body as his hands could reach.',
    source: 'Sahih al-Bukhari 5017, Sahih Muslim 2192',
    repeat: 3,
  },
  {
    id: 'sleep_ayat_kursi',
    category: 'sleep',
    titleEn: 'Ayat al-Kursi before sleeping',
    arabic:
      'ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ ٱلْحَيُّ ٱلْقَيُّومُ، لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ، لَهُ مَا فِي ٱلسَّمَاوَاتِ وَمَا فِي ٱلْأَرْضِ، مَنْ ذَا ٱلَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ، يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ، وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ، وَسِعَ كُرْسِيُّهُ ٱلسَّمَاوَاتِ وَٱلْأَرْضَ، وَلَا يَؤُودُهُ حِفْظُهُمَا، وَهُوَ ٱلْعَلِيُّ ٱلْعَظِيمُ',
    transliteration:
      'Allāhu lā ilāha illā huwa-l-ḥayyu-l-qayyūm…',
    translation:
      'Whoever recites Ayat al-Kursi at night will have a guardian from Allah and Satan will not approach him until morning.',
    source: 'Quran 2:255 — Sahih al-Bukhari 2311',
  },
  {
    id: 'sleep_aslamtu_wajhi',
    category: 'sleep',
    titleEn: 'I have submitted my face to You',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَسْلَمْتُ وَجْهِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ ٱلَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ ٱلَّذِي أَرْسَلْتَ',
    transliteration:
      'Allāhumma innī aslamtu wajhī ilayk, wa fawwaḍtu amrī ilayk, wa aljaʾtu ẓahrī ilayk, raghbatan wa rahbatan ilayk, lā maljaʾa wa lā manjā minka illā ilayk. Āmantu bi-kitābika-lladhī anzalt, wa bi-nabiyyika-lladhī arsalt.',
    translation:
      'Perform your wuḍūʾ as for prayer, lie on your right side, and say it. The Prophet ﷺ said: "And let these be the last words you speak — if you die that night, you die upon the fiṭra; and if you wake, you wake to good."',
    source: 'Sahih al-Bukhari 247, Sahih Muslim 2710',
  },
  {
    id: 'sleep_bismika_ahya',
    category: 'sleep',
    titleEn: 'In Your name, O Allah, I live and die',
    arabic: 'ٱللَّهُمَّ بِٱسْمِكَ أَحْيَا، وَبِٱسْمِكَ أَمُوتُ',
    transliteration: 'Allāhumma bi-smika aḥyā, wa bi-smika amūt',
    translation:
      'O Allah, in Your name I live and in Your name I die. (Said upon lying down to sleep.)',
    source: 'Sahih al-Bukhari 6324, Sahih Muslim 2711',
  },
  {
    id: 'sleep_alhamdu_ahyana',
    category: 'sleep',
    titleEn: 'On waking',
    arabic:
      'ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ ٱلنُّشُورُ',
    transliteration:
      'Al-ḥamdu lillāhi-lladhī aḥyānā baʿda mā amātanā wa ilayhi-n-nushūr',
    translation:
      'All praise is for Allah who gave us life after having taken it from us, and to Him is the resurrection.',
    source: 'Sahih al-Bukhari 6324',
  },
  {
    id: 'sleep_khalaqta_nafsi',
    category: 'sleep',
    titleEn: 'You created my soul — protect or forgive it',
    arabic:
      'ٱللَّهُمَّ خَلَقْتَ نَفْسِي وَأَنْتَ تَوَفَّاهَا، لَكَ مَمَاتُهَا وَمَحْيَاهَا، إِنْ أَحْيَيْتَهَا فَٱحْفَظْهَا، وَإِنْ أَمَتَّهَا فَٱغْفِرْ لَهَا. ٱللَّهُمَّ إِنِّي أَسْأَلُكَ ٱلْعَافِيَةَ',
    transliteration:
      'Allāhumma khalaqta nafsī wa anta tawaffāhā, laka mamātuhā wa maḥyāhā. In aḥyaytahā fa-ḥfaẓhā, wa in amattahā fa-ghfir lahā. Allāhumma innī asʾaluka-l-ʿāfiyah.',
    translation:
      'O Allah, You created my soul and You take it back. To You belongs its death and its life. If You keep it alive, protect it; if You take it, forgive it. O Allah, I ask You for well-being.',
    source: 'Sahih Muslim 2712',
  },
  {
    id: 'sleep_rabba_samawat',
    category: 'sleep',
    titleEn: 'Lord of the heavens, the earth, and the Mighty Throne',
    arabic:
      'ٱللَّهُمَّ رَبَّ ٱلسَّمَاوَاتِ وَرَبَّ ٱلْأَرْضِ وَرَبَّ ٱلْعَرْشِ ٱلْعَظِيمِ، رَبَّنَا وَرَبَّ كُلِّ شَيْءٍ، فَالِقَ ٱلْحَبِّ وَٱلنَّوَىٰ، وَمُنْزِلَ ٱلتَّوْرَاةِ وَٱلْإِنْجِيلِ وَٱلْفُرْقَانِ، أَعُوذُ بِكَ مِنْ شَرِّ كُلِّ شَيْءٍ أَنْتَ آخِذٌ بِنَاصِيَتِهِ. ٱللَّهُمَّ أَنْتَ ٱلْأَوَّلُ فَلَيْسَ قَبْلَكَ شَيْءٌ، وَأَنْتَ ٱلْآخِرُ فَلَيْسَ بَعْدَكَ شَيْءٌ، وَأَنْتَ ٱلظَّاهِرُ فَلَيْسَ فَوْقَكَ شَيْءٌ، وَأَنْتَ ٱلْبَاطِنُ فَلَيْسَ دُونَكَ شَيْءٌ، ٱقْضِ عَنَّا ٱلدَّيْنَ، وَأَغْنِنَا مِنَ ٱلْفَقْرِ',
    transliteration:
      'Allāhumma rabba-s-samāwāti wa rabba-l-arḍi wa rabba-l-ʿarshi-l-ʿaẓīm, rabbanā wa rabba kulli shayʾ, fāliqa-l-ḥabbi wa-n-nawā, wa munzila-t-tawrāti wa-l-injīli wa-l-furqān, aʿūdhu bika min sharri kulli shayʾin anta ākhidhun bi-nāṣiyatih. Allāhumma anta-l-awwalu fa-laysa qablaka shayʾ, wa anta-l-ākhiru fa-laysa baʿdaka shayʾ, wa anta-ẓ-ẓāhiru fa-laysa fawqaka shayʾ, wa anta-l-bāṭinu fa-laysa dūnaka shayʾ. Iqḍi ʿannā-d-dayna wa aghninā mina-l-faqr.',
    translation:
      'O Allah, Lord of the heavens and the earth and the Mighty Throne, our Lord and Lord of all things… settle our debts and free us from poverty.',
    source: 'Sahih Muslim 2713',
  },
  {
    id: 'sleep_dust_off_bed',
    category: 'sleep',
    titleEn: 'Dust off the bed and lie on the right side',
    arabic:
      'سُبْحَانَكَ ٱللَّهُمَّ رَبِّي بِكَ وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، إِنْ أَمْسَكْتَ نَفْسِي فَٱغْفِرْ لَهَا، وَإِنْ أَرْسَلْتَهَا فَٱحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ ٱلصَّالِحِينَ',
    transliteration:
      'Subḥānaka-llāhumma rabbī bika waḍaʿtu janbī, wa bika arfaʿuh. In amsakta nafsī fa-ghfir lahā, wa in arsaltahā fa-ḥfaẓhā bi-mā taḥfaẓu bihi ʿibādaka-ṣ-ṣāliḥīn.',
    translation:
      'Dust off the bed with the inside of your izār, mention Allah\'s name, lie on your right side, then say: Glory be to You, O Allah my Lord — by You I lay down my side and by You I raise it. If You take my soul, forgive it; if You release it, guard it as You guard Your righteous servants.',
    source: 'Sahih Muslim 2714',
  },
  {
    id: 'sleep_takbir_tasbih_tahmid',
    category: 'sleep',
    titleEn: 'Takbīr 34, Tasbīḥ 33, Taḥmīd 33 (better than a servant)',
    arabic:
      'ٱللَّهُ أَكْبَرُ (×٣٤) — سُبْحَانَ ٱللَّهِ (×٣٣) — ٱلْحَمْدُ لِلَّهِ (×٣٣)',
    transliteration:
      'Allāhu akbar (×34), Subḥāna-llāh (×33), al-ḥamdu lillāh (×33)',
    translation:
      'The Prophet ﷺ taught Fāṭimah and ʿAlī this is better for them than a servant: take takbīr 34 times, tasbīḥ 33 times, and taḥmīd 33 times before sleep.',
    source: 'Sahih al-Bukhari 3705, Sahih Muslim 2727',
    repeat: 33,
  },
  {
    id: 'sleep_taamat_protection',
    category: 'sleep',
    titleEn: 'The perfect words of Allah from every harm',
    arabic:
      'أَعُوذُ بِكَلِمَاتِ ٱللَّهِ ٱلتَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    transliteration:
      'Aʿūdhu bi-kalimāti-llāhi-t-tāmmāti min sharri mā khalaq',
    translation:
      'I seek refuge in the perfect words of Allah from the evil of what He has created. Whoever stops at a place and says this, nothing will harm him until he leaves.',
    source: 'Sahih Muslim 2708',
    repeat: 3,
  },
  {
    id: 'sleep_taamat_for_children',
    category: 'sleep',
    titleEn: 'Refuge for children — every devil and harmful creature',
    arabic:
      'أَعُوذُ بِكَلِمَاتِ ٱللَّهِ ٱلتَّامَّةِ، مِنْ كُلِّ شَيْطَانٍ وَهَامَّةٍ، وَمِنْ كُلِّ عَيْنٍ لَامَّةٍ',
    transliteration:
      'Aʿūdhu bi-kalimāti-llāhi-t-tāmmah, min kulli shayṭānin wa hāmmah, wa min kulli ʿaynin lāmmah',
    translation:
      'I seek refuge in the perfect words of Allah from every devil, every harmful creature, and every evil eye. The Prophet ﷺ used to recite this over al-Ḥasan and al-Ḥusayn.',
    source: 'Sahih al-Bukhari 3371',
  },
  {
    id: 'sleep_taamat_long',
    category: 'sleep',
    titleEn: "Refuge by Allah's perfect words — long form",
    arabic:
      'أَعُوذُ بِكَلِمَاتِ ٱللَّهِ ٱلتَّامَّاتِ ٱلَّتِي لَا يُجَاوِزُهُنَّ بَرٌّ وَلَا فَاجِرٌ، مِنْ شَرِّ مَا خَلَقَ وَذَرَأَ وَبَرَأَ، وَمِنْ شَرِّ مَا يَنْزِلُ مِنَ ٱلسَّمَاءِ، وَمِنْ شَرِّ مَا يَعْرُجُ فِيهَا، وَمِنْ شَرِّ مَا ذَرَأَ فِي ٱلْأَرْضِ، وَمِنْ شَرِّ مَا يَخْرُجُ مِنْهَا، وَمِنْ شَرِّ فِتَنِ ٱللَّيْلِ وَٱلنَّهَارِ، وَمِنْ شَرِّ كُلِّ طَارِقٍ إِلَّا طَارِقًا يَطْرُقُ بِخَيْرٍ، يَا رَحْمَٰنُ',
    transliteration:
      "Aʿūdhu bi-kalimāti-llāhi-t-tāmmāti-llatī lā yujāwizuhunna barrun wa lā fājir, min sharri mā khalaqa wa dharaʾa wa baraʾ, wa min sharri mā yanzilu mina-s-samāʾ, wa min sharri mā yaʿruju fīhā, wa min sharri mā dharaʾa fī-l-arḍ, wa min sharri mā yakhruju minhā, wa min sharri fitani-l-layli wa-n-nahār, wa min sharri kulli ṭāriqin illā ṭāriqan yaṭruqu bi-khayrin, yā raḥmān.",
    translation:
      "I seek refuge in Allah's perfect words, which neither the righteous nor the wicked can transgress, from every evil He has created, brought into being, and originated; from every evil that descends from the sky and ascends into it, and every evil sown in the earth and emerging from it; from the trials of night and day, and from every visitor at night except one who comes with good — O Most Merciful.",
    source: 'Musnad Aḥmad 3:419',
  },
  {
    id: 'sleep_nightmare',
    category: 'sleep',
    titleEn: 'On waking startled or from a nightmare',
    arabic:
      'أَعُوذُ بِكَلِمَاتِ ٱللَّهِ ٱلتَّامَّاتِ مِنْ غَضَبِهِ وَعِقَابِهِ وَشَرِّ عِبَادِهِ، وَمِنْ هَمَزَاتِ ٱلشَّيَاطِينِ وَأَنْ يَحْضُرُونِ',
    transliteration:
      'Aʿūdhu bi-kalimāti-llāhi-t-tāmmāti min ghaḍabihi wa ʿiqābihi wa sharri ʿibādih, wa min hamazāti-sh-shayāṭīni wa an yaḥḍurūn',
    translation:
      "I seek refuge in Allah's perfect words from His anger, from His punishment, from the evil of His servants, and from the whisperings of devils and their presence. (Said when startled in sleep — it will not harm you.)",
    source: 'Jāmiʿ at-Tirmidhī 3528, Sunan Abī Dāwūd 3893',
  },
  {
    id: 'sleep_wajhik_alkarim',
    category: 'sleep',
    titleEn: 'By Your Noble Face and Your perfect words',
    arabic:
      'ٱللَّهُمَّ إِنِّي أَعُوذُ بِوَجْهِكَ ٱلْكَرِيمِ، وَكَلِمَاتِكَ ٱلتَّامَّةِ، مِنْ شَرِّ مَا أَنْتَ آخِذٌ بِنَاصِيَتِهِ. ٱللَّهُمَّ أَنْتَ تَكْشِفُ ٱلْمَغْرَمَ وَٱلْمَأْثَمَ. ٱللَّهُمَّ لَا يُهْزَمُ جُنْدُكَ، وَلَا يُخْلَفُ وَعْدُكَ، وَلَا يَنْفَعُ ذَا ٱلْجَدِّ مِنْكَ ٱلْجَدُّ، سُبْحَانَكَ وَبِحَمْدِكَ',
    transliteration:
      'Allāhumma innī aʿūdhu bi-wajhika-l-karīm, wa kalimātika-t-tāmmah, min sharri mā anta ākhidhun bi-nāṣiyatih. Allāhumma anta takshifu-l-maghrama wa-l-maʾtham. Allāhumma lā yuhzamu junduk, wa lā yukhlafu waʿduk, wa lā yanfaʿu dhā-l-jaddi minka-l-jadd, subḥānaka wa bi-ḥamdik.',
    translation:
      'O Allah, I seek refuge by Your Noble Face and Your perfect words from the evil of every creature whose forelock You hold. O Allah, You relieve debt and sin… nothing avails the rich against You, glory and praise be to You.',
    source: 'Sunan Abī Dāwūd 5052',
  },
  {
    id: 'sleep_anta_rabbi',
    category: 'sleep',
    titleEn: 'You are my Lord — no calamity will reach me',
    arabic:
      'ٱللَّهُمَّ أَنْتَ رَبِّي، لَا إِلَٰهَ إِلَّا أَنْتَ، عَلَيْكَ تَوَكَّلْتُ وَأَنْتَ رَبُّ ٱلْعَرْشِ ٱلْعَظِيمِ. لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّهِ ٱلْعَظِيمِ. مَا شَاءَ ٱللَّهُ كَانَ، وَمَا لَمْ يَشَأْ لَمْ يَكُنْ. أَعْلَمُ أَنَّ ٱللَّهَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ، وَأَنَّ ٱللَّهَ قَدْ أَحَاطَ بِكُلِّ شَيْءٍ عِلْمًا. ٱللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ كُلِّ دَابَّةٍ أَنْتَ آخِذٌ بِنَاصِيَتِهَا، إِنَّ رَبِّي عَلَىٰ صِرَاطٍ مُسْتَقِيمٍ',
    transliteration:
      'Allāhumma anta rabbī, lā ilāha illā ant, ʿalayka tawakkaltu wa anta rabbu-l-ʿarshi-l-ʿaẓīm…',
    translation:
      'Whoever says these words by night or by day, no harm will reach him; whoever says them in the morning will not be afflicted by calamity until evening, and whoever says them in the evening will not be afflicted until morning.',
    source: 'aṭ-Ṭabarānī from Abū al-Dardāʾ',
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
      'ٱللَّهُمَّ رَبَّ هَٰذِهِ ٱلدَّعْوَةِ ٱلتَّامَّةِ وَٱلصَّلَاةِ ٱلْقَائِمَةِ، آتِ مُحَمَّدًا ٱلْوَسِيلَةَ وَٱلْفَضِيلَةَ، وَٱبْعَثْهُ مَقَامًا مَحْمُودًا ٱلَّذِي وَعَدْتَهُ',
    transliteration:
      'Allāhumma rabba hādhihi-d-daʿwati-t-tāmmati wa-ṣ-ṣalāti-l-qāʾimah, āti Muḥammadan-il-wasīlata wa-l-faḍīlah, wa-bʿathhu maqāman maḥmūdan-illadhī waʿadtah',
    translation:
      'O Allah, Lord of this perfect call and the prayer about to be established, grant Muhammad al-Wasīlah (the highest station) and excellence, and raise him to the praiseworthy station that You have promised him.',
    source: 'Sahih al-Bukhari 614 — whoever says it after the adhan is granted the Prophet\'s ﷺ intercession on the Day of Resurrection.',
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
  // (Morning + evening adhkar live at the top of the file in their
  //  prescribed order — see the head of DUAS for the full lists.)
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
    id: 'weather_during_rain',
    category: 'weather',
    titleEn: 'When rain begins to fall',
    arabic: 'ٱللَّهُمَّ صَيِّبًا نَافِعًا',
    transliteration: 'Allāhumma ṣayyiban nāfiʿā',
    translation: 'O Allah, may it be a beneficial rain cloud.',
    source: 'Sahih al-Bukhari 1032',
  },
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
