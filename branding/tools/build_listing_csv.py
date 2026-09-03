# -*- coding: utf-8 -*-
"""Build the Play Console listing-translation CSV for Mihrab.

Play Console's "Import translations with AI" takes a structured CSV (or a
Google Sheet) and pre-populates one store listing per language from it. This
writes that file for all 13 languages the app itself ships, and refuses to
write anything that would be rejected: Play caps the app name at 30
characters, the short description at 80 and the full description at 4000,
and the importer rejects the file rather than truncating.

    python3 branding/tools/build_listing_csv.py

The English descriptions are the same copy as fastlane/metadata/android/en-US,
which is what F-Droid reads; keep the two in step when either changes. The
name is the one exception: Play carries the "Mihrab: ..." subtitle for search,
F-Droid keeps the bare brand.
"""
import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATA = {}

DATA["en-US"] = dict(
    language="English (United States)",
    app_name="Mihrab: The Muslim Companion",
    short_description="Prayer times, adhan reminders, Quran reader and widgets. No trackers.",
    full_description="""Mihrab keeps the five daily prayers close at hand: a calm home screen with the next prayer and a live countdown, optional adhan reminders, a full-month planner, and home-screen widgets.

Key features:
- Prayer times for today, the week ahead, and a full-month overview — shareable as an image or a PDF
- Optional notifications for the five daily prayers, with seventeen adhan recordings or one of your own, pre-prayer reminders, and snooze
- Pinned prayer countdown (Live Activity) on the lock screen and in the notification shade, in three designs
- Home-screen widgets: prayer times in three sizes, today's log, Hijri date, streak, tasbih and reading
- Qibla compass with signal strength and a cross-check against the sun
- Quran reader: the Madinah mushaf drawn from the official page fonts, in four riwayat (Hafs, Warsh, Qalun, Shu'bah), with 13 translations and classical tafsir, 42 reciters, word-level highlighting, memorisation tools, bookmarks, and khatmah plans
- Duas (Hisn al-Muslim), tasbih counter, fasting tracker, prayer journal with a practice graph and streaks, and nearby mosques
- Hijri calendar with Ramadan, Eid and Jumu'ah treatments
- Sync between your own devices with no account and no server: sealed files in a folder you already keep in sync
- Backup and restore to a file you keep
- GPS location, place search, saved places, or manual coordinates; per-prayer minute offsets
- Several prayer-time sources — including the published national tables for Sweden and Morocco — or fully on-device calculation
- 13 languages, including Arabic and Urdu with right-to-left layout
- Light, dark, pure-black and system themes, your choice of accent, and Material You

Privacy and network use:
- No analytics, no trackers, no advertising, no account
- Prayer times can be calculated entirely on your device once a location is set
- Optional online features, used only when you choose them: prayer-time providers (AlAdhan, PrayTimes.dev, or the prepared national tables for Sweden and Morocco), place search via OpenStreetMap Nominatim, and downloading the Quran pages, translations, tafsir and recitation audio
- Sync never passes through a server of ours, and what it writes is unreadable to anything but the devices you paired
- Your coordinates are stored only on your device

The app is open source under AGPL-3.0-or-later.""",
)

DATA["sv-SE"] = dict(
    language="Swedish",
    app_name="Mihrab: Bönetider",
    short_description="Bönetider, adhan-påminnelser, Koranläsare och widgetar. Inga spårare.",
    full_description="""Mihrab håller de fem dagliga bönerna nära till hands: en lugn startskärm med nästa bön och en nedräkning i realtid, valfria adhan-påminnelser, en månadsöversikt och widgetar på hemskärmen.

Viktiga funktioner:
- Bönetider för i dag, veckan framåt och en hel månad — kan delas som bild eller PDF
- Valfria aviseringar för de fem dagliga bönerna, med sjutton adhan-inspelningar eller en egen, påminnelser före bön och snooze
- Fäst nedräkning till bönen (Live Activity) på låsskärmen och i aviseringspanelen, i tre utföranden
- Widgetar på hemskärmen: bönetider i tre storlekar, dagens logg, hijridatum, svit, tasbih och läsning
- Qiblakompass med signalstyrka och en kontroll mot solen
- Koranläsare: Madinah-mushafen ritad med de officiella sidtypsnitten, i fyra riwayat (Hafs, Warsh, Qalun, Shu'bah), med 13 översättningar och klassisk tafsir, 42 recitatörer, ordmarkering, memoreringsverktyg, bokmärken och khatmah-planer
- Duaer (Hisn al-Muslim), tasbihräknare, fasteregister, bönedagbok med praktikgraf och sviter, samt moskéer i närheten
- Hijrikalender med Ramadan, Eid och jumu'ah
- Synk mellan dina egna enheter utan konto och utan server: förseglade filer i en mapp du redan synkar
- Säkerhetskopiering och återställning till en fil du behåller
- GPS-position, platssökning, sparade platser eller manuella koordinater; minutjustering per bön
- Flera källor för bönetider — bland annat de publicerade nationella tabellerna för Sverige och Marocko — eller helt lokal beräkning
- 13 språk, inklusive arabiska och urdu med höger-till-vänster-layout
- Ljusa, mörka, helsvarta och systemteman, valfri accentfärg och Material You

Integritet och nätverk:
- Ingen analys, inga spårare, ingen reklam, inget konto
- Bönetider kan beräknas helt på din enhet när en plats är angiven
- Valfria onlinefunktioner, som bara används när du väljer dem: leverantörer av bönetider (AlAdhan, PrayTimes.dev eller de förberedda nationella tabellerna för Sverige och Marocko), platssökning via OpenStreetMap Nominatim och nedladdning av Koranens sidor, översättningar, tafsir och recitationsljud
- Synk passerar aldrig någon server hos oss, och det som skrivs är oläsbart för allt utom de enheter du parat ihop
- Dina koordinater lagras bara på din enhet

Appen är öppen källkod under AGPL-3.0-or-later.""",
)

DATA["de-DE"] = dict(
    language="German",
    app_name="Mihrab: Gebetszeiten",
    short_description="Gebetszeiten, Adhan-Erinnerungen, Koran-Reader und Widgets. Keine Tracker.",
    full_description="""Mihrab hält die fünf täglichen Gebete griffbereit: ein ruhiger Startbildschirm mit dem nächsten Gebet und einem laufenden Countdown, optionale Adhan-Erinnerungen, eine Monatsübersicht und Widgets für den Homescreen.

Hauptfunktionen:
- Gebetszeiten für heute, die kommende Woche und einen ganzen Monat — teilbar als Bild oder PDF
- Optionale Benachrichtigungen für die fünf täglichen Gebete, mit siebzehn Adhan-Aufnahmen oder einer eigenen, Erinnerungen vor dem Gebet und Schlummerfunktion
- Angehefteter Gebets-Countdown (Live Activity) auf dem Sperrbildschirm und in der Benachrichtigungsleiste, in drei Designs
- Homescreen-Widgets: Gebetszeiten in drei Größen, Tagesprotokoll, Hidschri-Datum, Serie, Tasbih und Lesefortschritt
- Qibla-Kompass mit Signalstärke und Gegenprobe anhand des Sonnenstands
- Koran-Reader: der Medina-Mushaf aus den offiziellen Seitenschriften, in vier Riwayat (Hafs, Warsch, Qalun, Schuʿba), mit 13 Übersetzungen und klassischem Tafsir, 42 Rezitatoren, wortgenauer Hervorhebung, Auswendiglern-Werkzeugen, Lesezeichen und Khatma-Plänen
- Duas (Hisn al-Muslim), Tasbih-Zähler, Fastentracker, Gebetstagebuch mit Praxisdiagramm und Serien sowie Moscheen in der Nähe
- Hidschri-Kalender mit Ramadan, Eid und Dschumuʿa
- Synchronisierung zwischen deinen eigenen Geräten ohne Konto und ohne Server: versiegelte Dateien in einem Ordner, den du ohnehin synchronisierst
- Sicherung und Wiederherstellung in eine Datei, die dir gehört
- GPS-Standort, Ortssuche, gespeicherte Orte oder manuelle Koordinaten; Minutenkorrektur pro Gebet
- Mehrere Quellen für Gebetszeiten — darunter die veröffentlichten nationalen Tabellen für Schweden und Marokko — oder vollständige Berechnung auf dem Gerät
- 13 Sprachen, darunter Arabisch und Urdu mit Rechts-nach-links-Layout
- Helle, dunkle, tiefschwarze und Systemdesigns, freie Akzentfarbe und Material You

Datenschutz und Netzwerknutzung:
- Keine Analyse, keine Tracker, keine Werbung, kein Konto
- Gebetszeiten können vollständig auf deinem Gerät berechnet werden, sobald ein Ort gesetzt ist
- Optionale Onlinefunktionen, nur wenn du sie wählst: Anbieter von Gebetszeiten (AlAdhan, PrayTimes.dev oder die vorbereiteten nationalen Tabellen für Schweden und Marokko), Ortssuche über OpenStreetMap Nominatim und das Herunterladen von Koranseiten, Übersetzungen, Tafsir und Rezitations-Audio
- Die Synchronisierung läuft nie über einen Server von uns, und was sie schreibt, ist für alles außer den von dir gekoppelten Geräten unlesbar
- Deine Koordinaten werden nur auf deinem Gerät gespeichert

Die App ist Open Source unter AGPL-3.0-or-later.""",
)

DATA["fr-FR"] = dict(
    language="French",
    app_name="Mihrab : heures de prière",
    short_description="Heures de prière, adhan, lecteur du Coran et widgets. Aucun traceur.",
    full_description="""Mihrab garde les cinq prières quotidiennes à portée de main : un écran d'accueil paisible avec la prochaine prière et un compte à rebours en direct, des rappels d'adhan facultatifs, un planning mensuel complet et des widgets d'écran d'accueil.

Fonctions principales :
- Heures de prière pour aujourd'hui, la semaine à venir et un mois entier — partageables en image ou en PDF
- Notifications facultatives pour les cinq prières, avec dix-sept enregistrements d'adhan ou le vôtre, rappels avant la prière et report
- Compte à rebours épinglé (Live Activity) sur l'écran de verrouillage et dans le volet des notifications, en trois présentations
- Widgets d'écran d'accueil : heures de prière en trois tailles, journal du jour, date hégirienne, série, tasbih et lecture
- Boussole Qibla avec force du signal et vérification croisée par la position du soleil
- Lecteur du Coran : le mushaf de Médine tracé avec les polices de page officielles, en quatre riwayat (Hafs, Warsh, Qalun, Chuʿba), avec 13 traductions et le tafsir classique, 42 récitateurs, surlignage mot à mot, outils de mémorisation, favoris et plans de khatma
- Douas (Hisn al-Muslim), compteur de tasbih, suivi du jeûne, journal de prière avec graphique de pratique et séries, et mosquées à proximité
- Calendrier hégirien avec Ramadan, Aïd et Joumouʿa
- Synchronisation entre vos propres appareils, sans compte et sans serveur : des fichiers scellés dans un dossier que vous synchronisez déjà
- Sauvegarde et restauration vers un fichier qui reste chez vous
- Position GPS, recherche de lieu, lieux enregistrés ou coordonnées manuelles ; décalage en minutes par prière
- Plusieurs sources d'heures de prière — dont les tables nationales publiées pour la Suède et le Maroc — ou un calcul entièrement sur l'appareil
- 13 langues, dont l'arabe et l'ourdou en mise en page de droite à gauche
- Thèmes clair, sombre, noir intégral et système, couleur d'accent au choix, et Material You

Confidentialité et usage du réseau :
- Aucune analyse, aucun traceur, aucune publicité, aucun compte
- Les heures de prière peuvent être calculées entièrement sur votre appareil une fois un lieu défini
- Fonctions en ligne facultatives, utilisées seulement si vous les choisissez : fournisseurs d'heures de prière (AlAdhan, PrayTimes.dev ou les tables nationales préparées pour la Suède et le Maroc), recherche de lieu via OpenStreetMap Nominatim, et téléchargement des pages du Coran, des traductions, du tafsir et de l'audio des récitations
- La synchronisation ne passe jamais par un de nos serveurs, et ce qu'elle écrit est illisible pour tout autre que les appareils que vous avez appairés
- Vos coordonnées ne sont stockées que sur votre appareil

L'application est en open source sous licence AGPL-3.0-or-later.""",
)

DATA["es-ES"] = dict(
    language="Spanish",
    app_name="Mihrab: Horarios de oración",
    short_description="Horarios de oración, adhan, lector del Corán y widgets. Sin rastreadores.",
    full_description="""Mihrab mantiene las cinco oraciones diarias al alcance de la mano: una pantalla de inicio tranquila con la próxima oración y una cuenta atrás en vivo, recordatorios de adhan opcionales, una vista de mes completo y widgets para la pantalla de inicio.

Funciones principales:
- Horarios de oración de hoy, de la semana y de todo el mes — se comparten como imagen o PDF
- Notificaciones opcionales para las cinco oraciones, con diecisiete grabaciones de adhan o la tuya propia, avisos previos y posposición
- Cuenta atrás fijada (Live Activity) en la pantalla de bloqueo y en el panel de notificaciones, en tres diseños
- Widgets de pantalla de inicio: horarios en tres tamaños, registro del día, fecha hiyrí, racha, tasbih y lectura
- Brújula de la qibla con intensidad de señal y comprobación cruzada con el sol
- Lector del Corán: el mushaf de Medina trazado con las tipografías oficiales de página, en cuatro riwayat (Hafs, Warsh, Qalun, Shuʿba), con 13 traducciones y tafsir clásico, 42 recitadores, resaltado palabra por palabra, herramientas de memorización, marcadores y planes de jatma
- Duas (Hisn al-Muslim), contador de tasbih, seguimiento del ayuno, diario de oración con gráfico de práctica y rachas, y mezquitas cercanas
- Calendario hiyrí con Ramadán, Eid y yumua
- Sincronización entre tus propios dispositivos sin cuenta y sin servidor: archivos sellados en una carpeta que ya sincronizas
- Copia de seguridad y restauración en un archivo que guardas tú
- Ubicación GPS, búsqueda de lugares, lugares guardados o coordenadas manuales; ajuste en minutos por oración
- Varias fuentes de horarios — incluidas las tablas nacionales publicadas de Suecia y Marruecos — o cálculo totalmente en el dispositivo
- 13 idiomas, incluidos el árabe y el urdu con diseño de derecha a izquierda
- Temas claro, oscuro, negro puro y del sistema, color de acento a tu gusto y Material You

Privacidad y uso de la red:
- Sin analíticas, sin rastreadores, sin publicidad, sin cuenta
- Los horarios pueden calcularse por completo en tu dispositivo una vez fijada la ubicación
- Funciones en línea opcionales, usadas solo si las eliges: proveedores de horarios (AlAdhan, PrayTimes.dev o las tablas nacionales preparadas de Suecia y Marruecos), búsqueda de lugares mediante OpenStreetMap Nominatim y descarga de las páginas del Corán, traducciones, tafsir y audio de recitación
- La sincronización nunca pasa por un servidor nuestro, y lo que escribe es ilegible para todo salvo los dispositivos que emparejaste
- Tus coordenadas se guardan solo en tu dispositivo

La aplicación es de código abierto bajo AGPL-3.0-or-later.""",
)

DATA["tr-TR"] = dict(
    language="Turkish",
    app_name="Mihrab: Namaz Vakitleri",
    short_description="Namaz vakitleri, ezan hatırlatıcıları, Kur'an ve widget'lar. İzleyici yok.",
    full_description="""Mihrab beş vakit namazı elinizin altında tutar: sıradaki namazı ve canlı geri sayımı gösteren sakin bir ana ekran, isteğe bağlı ezan hatırlatıcıları, tam aylık plan ve ana ekran widget'ları.

Öne çıkan özellikler:
- Bugünün, önümüzdeki haftanın ve tam bir ayın namaz vakitleri — görsel veya PDF olarak paylaşılabilir
- Beş vakit için isteğe bağlı bildirimler; on yedi ezan kaydı ya da kendi kaydınız, namaz öncesi hatırlatma ve erteleme
- Kilit ekranında ve bildirim panelinde sabitlenen namaz geri sayımı (Live Activity), üç tasarımda
- Ana ekran widget'ları: üç boyutta namaz vakitleri, günün kaydı, hicri tarih, seri, tesbih ve okuma
- Sinyal gücü gösteren ve güneşe göre çapraz doğrulama yapan kıble pusulası
- Kur'an okuyucu: resmî sayfa yazı tipleriyle çizilen Medine mushafı, dört rivayette (Hafs, Verş, Kalûn, Şu'be), 13 meal ve klasik tefsir, 42 kâri, kelime kelime vurgulama, ezber araçları, yer imleri ve hatim planları
- Dualar (Hisnü'l-Müslim), tesbih sayacı, oruç takibi, pratik grafiği ve serileriyle namaz günlüğü ve yakındaki camiler
- Ramazan, bayram ve cuma vurgulu hicri takvim
- Kendi cihazlarınız arasında hesapsız ve sunucusuz eşitleme: zaten eşitlediğiniz bir klasördeki mühürlü dosyalar
- Sizde kalan bir dosyaya yedekleme ve geri yükleme
- GPS konumu, yer arama, kayıtlı yerler veya elle koordinat; namaz başına dakika düzeltmesi
- Birden çok namaz vakti kaynağı — İsveç ve Fas için yayımlanan ulusal tablolar dahil — ya da tamamen cihaz üzerinde hesaplama
- Sağdan sola yerleşimli Arapça ve Urduca dahil 13 dil
- Açık, koyu, tam siyah ve sistem temaları, dilediğiniz vurgu rengi ve Material You

Gizlilik ve ağ kullanımı:
- Analiz yok, izleyici yok, reklam yok, hesap yok
- Konum belirlendikten sonra namaz vakitleri tamamen cihazınızda hesaplanabilir
- Yalnızca siz seçtiğinizde kullanılan isteğe bağlı çevrimiçi özellikler: namaz vakti sağlayıcıları (AlAdhan, PrayTimes.dev veya İsveç ve Fas için hazırlanan ulusal tablolar), OpenStreetMap Nominatim ile yer arama ve Kur'an sayfaları, mealler, tefsir ve tilavet seslerinin indirilmesi
- Eşitleme hiçbir zaman bizim sunucumuzdan geçmez ve yazdıkları, eşlediğiniz cihazlar dışında hiçbir şey tarafından okunamaz
- Koordinatlarınız yalnızca cihazınızda saklanır

Uygulama AGPL-3.0-or-later lisansıyla açık kaynaktır.""",
)

DATA["id"] = dict(
    language="Indonesian",
    app_name="Mihrab: Waktu Salat",
    short_description="Waktu salat, pengingat azan, pembaca Al-Qur'an, dan widget. Tanpa pelacak.",
    full_description="""Mihrab menjaga lima salat harian tetap dekat: layar utama yang tenang dengan salat berikutnya dan hitung mundur langsung, pengingat azan opsional, tampilan satu bulan penuh, dan widget layar utama.

Fitur utama:
- Waktu salat untuk hari ini, sepekan ke depan, dan satu bulan penuh — dapat dibagikan sebagai gambar atau PDF
- Notifikasi opsional untuk lima salat, dengan tujuh belas rekaman azan atau rekaman Anda sendiri, pengingat sebelum salat, dan tunda
- Hitung mundur salat yang disematkan (Live Activity) di layar kunci dan panel notifikasi, dalam tiga desain
- Widget layar utama: waktu salat dalam tiga ukuran, catatan hari ini, tanggal Hijriah, rentetan, tasbih, dan bacaan
- Kompas kiblat dengan kekuatan sinyal dan pemeriksaan silang terhadap matahari
- Pembaca Al-Qur'an: mushaf Madinah yang digambar dari font halaman resmi, dalam empat riwayat (Hafs, Warsy, Qalun, Syu'bah), dengan 13 terjemahan dan tafsir klasik, 42 qari, penyorotan per kata, alat hafalan, penanda, dan rencana khatam
- Doa (Hisnul Muslim), penghitung tasbih, pelacak puasa, jurnal salat dengan grafik dan rentetan, serta masjid terdekat
- Kalender Hijriah dengan penanda Ramadan, Idulfitri/Iduladha, dan Jumat
- Sinkronisasi antar-perangkat Anda sendiri tanpa akun dan tanpa server: berkas tersegel di folder yang sudah Anda sinkronkan
- Cadangkan dan pulihkan ke berkas milik Anda
- Lokasi GPS, pencarian tempat, tempat tersimpan, atau koordinat manual; koreksi menit per salat
- Beberapa sumber waktu salat — termasuk tabel nasional resmi Swedia dan Maroko — atau perhitungan sepenuhnya di perangkat
- 13 bahasa, termasuk Arab dan Urdu dengan tata letak kanan ke kiri
- Tema terang, gelap, hitam pekat, dan sistem, warna aksen pilihan Anda, dan Material You

Privasi dan penggunaan jaringan:
- Tanpa analitik, tanpa pelacak, tanpa iklan, tanpa akun
- Waktu salat dapat dihitung sepenuhnya di perangkat Anda setelah lokasi diatur
- Fitur daring opsional, dipakai hanya jika Anda memilihnya: penyedia waktu salat (AlAdhan, PrayTimes.dev, atau tabel nasional Swedia dan Maroko), pencarian tempat lewat OpenStreetMap Nominatim, dan pengunduhan halaman Al-Qur'an, terjemahan, tafsir, serta audio tilawah
- Sinkronisasi tidak pernah melewati server kami, dan isinya tidak terbaca oleh apa pun selain perangkat yang Anda pasangkan
- Koordinat Anda hanya disimpan di perangkat Anda

Aplikasi ini sumber terbuka dengan lisensi AGPL-3.0-or-later.""",
)

DATA["ru-RU"] = dict(
    language="Russian",
    app_name="Mihrab: время намаза",
    short_description="Время намаза, азан, чтение Корана и виджеты. Без трекеров.",
    full_description="""Mihrab держит пять ежедневных молитв под рукой: спокойный главный экран со следующим намазом и живым обратным отсчётом, необязательные напоминания азаном, обзор на месяц вперёд и виджеты на домашнем экране.

Основные возможности:
- Время намаза на сегодня, на неделю вперёд и на целый месяц — можно поделиться картинкой или PDF
- Необязательные уведомления о пяти намазах: семнадцать записей азана или ваша собственная, напоминания заранее и отсрочка
- Закреплённый отсчёт до намаза (Live Activity) на экране блокировки и в шторке уведомлений, в трёх оформлениях
- Виджеты: время намаза в трёх размерах, журнал дня, дата по хиджре, серия, тасбих и чтение
- Компас киблы с индикатором уверенности и сверкой по солнцу
- Чтение Корана: мединский мусхаф, набранный официальными постраничными шрифтами, в четырёх риваятах (Хафс, Варш, Калун, Шуба), 13 переводов и классический тафсир, 42 чтеца, подсветка по словам, инструменты заучивания, закладки и планы хатма
- Дуа (Хисн аль-Муслим), счётчик тасбиха, учёт поста, дневник намаза с графиком практики и сериями, ближайшие мечети
- Календарь по хиджре с Рамаданом, Ид и джумой
- Синхронизация между вашими устройствами без аккаунта и без сервера: запечатанные файлы в папке, которую вы и так синхронизируете
- Резервная копия и восстановление в файл, который остаётся у вас
- GPS, поиск места, сохранённые места или ручные координаты; поминутная поправка для каждого намаза
- Несколько источников времени намаза — включая опубликованные национальные таблицы Швеции и Марокко — или полностью локальный расчёт
- 13 языков, включая арабский и урду с версткой справа налево
- Светлая, тёмная, полностью чёрная и системная темы, свой акцентный цвет и Material You

Конфиденциальность и сеть:
- Никакой аналитики, трекеров, рекламы и аккаунтов
- После указания места время намаза может рассчитываться целиком на вашем устройстве
- Необязательные онлайн-функции, только по вашему выбору: поставщики времени намаза (AlAdhan, PrayTimes.dev или подготовленные национальные таблицы Швеции и Марокко), поиск места через OpenStreetMap Nominatim и загрузка страниц Корана, переводов, тафсира и аудиозаписей чтения
- Синхронизация никогда не проходит через наш сервер, а записанное нечитаемо ни для чего, кроме связанных вами устройств
- Ваши координаты хранятся только на вашем устройстве

Приложение с открытым исходным кодом под AGPL-3.0-or-later.""",
)

DATA["zh-CN"] = dict(
    language="Chinese (Simplified)",
    app_name="Mihrab：穆斯林礼拜时间",
    short_description="礼拜时间、宣礼提醒、古兰经阅读与小组件。无追踪器。",
    full_description="""Mihrab 让五番拜功随手可及：主屏平静地显示下一次礼拜与实时倒计时，可选的宣礼（阿赞）提醒、整月时间表，以及桌面小组件。

主要功能：
- 今日、未来一周与整月的礼拜时间——可分享为图片或 PDF
- 五番拜的可选通知，内置十七段宣礼录音或使用你自己的录音，拜前提醒与稍后提醒
- 锁屏与通知栏上的常驻礼拜倒计时（实时活动），三种样式
- 桌面小组件：三种尺寸的礼拜时间、今日记录、希吉来日期、连续天数、赞念与诵读
- 朝向（吉卜拉）指南针，显示信号强度并可用太阳方位交叉核对
- 古兰经阅读：以官方分页字体呈现的麦地那穆斯哈夫，四种传述（哈夫斯、瓦尔什、格伦、舒尔白），13 种译文与经典泰福西尔，42 位诵读者，逐词高亮，背诵工具、书签与通读（海推姆）计划
- 都阿宜（《穆斯林的堡垒》）、赞念计数器、封斋记录、带练习图表与连续天数的礼拜日志，以及附近的清真寺
- 希吉来历，标注斋月、开斋节/宰牲节与主麻
- 在你自己的设备之间同步，无需账号、不经服务器：放在你本就同步的文件夹里的封存文件
- 备份与恢复到你自己保管的文件
- GPS 定位、地点搜索、已保存地点或手动坐标；每番拜的分钟微调
- 多种礼拜时间来源——含瑞典与摩洛哥公布的官方时间表——或完全在本机计算
- 13 种语言，含从右至左排版的阿拉伯语与乌尔都语
- 浅色、深色、纯黑与跟随系统主题，可自选强调色，并支持 Material You

隐私与网络使用：
- 无分析、无追踪器、无广告、无账号
- 设定地点后，礼拜时间可完全在你的设备上计算
- 可选的联网功能，仅在你选择时使用：礼拜时间来源（AlAdhan、PrayTimes.dev，或瑞典与摩洛哥的官方时间表）、通过 OpenStreetMap Nominatim 搜索地点，以及下载古兰经页面、译文、泰福西尔与诵读音频
- 同步从不经过我们的服务器，写入的内容除你配对的设备外无法读取
- 你的坐标只保存在你的设备上

本应用以 AGPL-3.0-or-later 开源。""",
)

DATA["ar"] = dict(
    language="Arabic",
    app_name="محراب: أوقات الصلاة",
    short_description="أوقات الصلاة وتنبيهات الأذان ومصحف وأدوات للشاشة. بلا متتبِّعات.",
    full_description="""يُبقي محراب الصلوات الخمس في متناول يدك: شاشة رئيسية هادئة تعرض الصلاة القادمة وعدًّا تنازليًّا حيًّا، وتنبيهات أذان اختيارية، وجدولًا لشهر كامل، وأدوات للشاشة الرئيسية.

أبرز المزايا:
- أوقات الصلاة لليوم وللأسبوع القادم ولشهر كامل — يمكن مشاركتها صورةً أو ملف PDF
- إشعارات اختيارية للصلوات الخمس، مع سبعة عشر تسجيلًا للأذان أو تسجيلك الخاص، وتنبيه قبل الصلاة وتأجيل
- عدّ تنازلي مثبَّت للصلاة (Live Activity) على شاشة القفل وفي لوحة الإشعارات، بثلاثة تصاميم
- أدوات الشاشة الرئيسية: أوقات الصلاة بثلاثة أحجام، وسجل اليوم، والتاريخ الهجري، والمواظبة، والتسبيح، والورد
- بوصلة القبلة مع قوة الإشارة ومقارنة تحقُّق بموضع الشمس
- قارئ القرآن: مصحف المدينة بخطوط الصفحات الرسمية، بأربع روايات (حفص، ورش، قالون، شعبة)، مع 13 ترجمة والتفسير الكلاسيكي، و42 قارئًا، وتظليل على مستوى الكلمة، وأدوات للحفظ، وعلامات مرجعية، وخطط ختمة
- الأدعية (حصن المسلم)، وعدّاد التسبيح، ومتابعة الصيام، ودفتر الصلاة برسم بياني للمواظبة والسلاسل، والمساجد القريبة
- تقويم هجري مع رمضان والعيد والجمعة
- مزامنة بين أجهزتك أنت، بلا حساب وبلا خادم: ملفات مختومة في مجلد تزامنه أصلًا
- نسخ احتياطي واستعادة إلى ملف تحتفظ به
- تحديد الموقع عبر GPS، أو البحث عن مكان، أو أماكن محفوظة، أو إحداثيات يدوية؛ مع تعديل بالدقائق لكل صلاة
- مصادر متعددة لأوقات الصلاة — منها الجداول الوطنية المنشورة للسويد والمغرب — أو حساب كامل على الجهاز
- 13 لغة، منها العربية والأردية بتخطيط من اليمين إلى اليسار
- سمات فاتحة وداكنة وسوداء تمامًا وسمة النظام، ولون تمييز تختاره، ودعم Material You

الخصوصية واستخدام الشبكة:
- بلا تحليلات، وبلا متتبِّعات، وبلا إعلانات، وبلا حساب
- يمكن حساب أوقات الصلاة كليًّا على جهازك بمجرد ضبط الموقع
- مزايا اتصال اختيارية لا تُستخدم إلا باختيارك: مزوّدو أوقات الصلاة (AlAdhan أو PrayTimes.dev أو الجداول الوطنية المهيَّأة للسويد والمغرب)، والبحث عن الأماكن عبر OpenStreetMap Nominatim، وتنزيل صفحات المصحف والترجمات والتفسير وتلاوات القرّاء
- المزامنة لا تمرّ أبدًا عبر خادم لنا، وما تكتبه غير قابل للقراءة إلا على الأجهزة التي أقرنتها
- إحداثياتك تُحفظ على جهازك وحده

التطبيق مفتوح المصدر برخصة AGPL-3.0-or-later.""",
)

DATA["ur"] = dict(
    language="Urdu",
    app_name="محراب: اوقاتِ نماز",
    short_description="اوقاتِ نماز، اذان کی یاد دہانی، قرآن اور ویجٹس۔ کوئی ٹریکر نہیں۔",
    full_description="""محراب پانچوں نمازوں کو آپ کے قریب رکھتا ہے: ایک پُرسکون ہوم اسکرین جس پر اگلی نماز اور چلتی ہوئی گنتی، اختیاری اذان یاد دہانیاں، پورے مہینے کا نقشہ، اور ہوم اسکرین ویجٹس۔

نمایاں خصوصیات:
- آج، آنے والے ہفتے اور پورے مہینے کے اوقاتِ نماز — تصویر یا PDF کے طور پر شیئر کیجیے
- پانچوں نمازوں کے لیے اختیاری اطلاعات، سترہ اذانوں کی ریکارڈنگ یا آپ کی اپنی، نماز سے پہلے یاد دہانی اور اسنوز
- لاک اسکرین اور نوٹیفکیشن شیڈ پر پن کی گئی نماز کی گنتی (Live Activity)، تین ڈیزائنوں میں
- ہوم اسکرین ویجٹس: تین سائز میں اوقات، آج کا ریکارڈ، ہجری تاریخ، تسلسل، تسبیح اور تلاوت
- قبلہ کمپاس، سگنل کی قوت کے ساتھ اور سورج سے جانچ کی سہولت
- قرآن ریڈر: سرکاری صفحاتی فونٹس سے بنا مصحفِ مدینہ، چار روایات میں (حفص، ورش، قالون، شعبہ)، 13 تراجم اور کلاسیکی تفسیر، 42 قاری، لفظ بہ لفظ نشان دہی، حفظ کے اوزار، بُک مارکس اور ختم قرآن کے منصوبے
- دعائیں (حصن المسلم)، تسبیح کاؤنٹر، روزوں کا ریکارڈ، مشق کے گراف اور تسلسل کے ساتھ نماز کا جریدہ، اور قریبی مساجد
- ہجری کیلنڈر، رمضان، عید اور جمعہ کی نشان دہی کے ساتھ
- اپنے ہی آلات کے درمیان مطابقت — بغیر اکاؤنٹ اور بغیر سرور: اُس فولڈر میں مہربند فائلیں جسے آپ پہلے ہی سِنک کرتے ہیں
- بیک اپ اور بحالی ایک ایسی فائل میں جو آپ کے پاس رہے
- GPS مقام، جگہ کی تلاش، محفوظ مقامات یا دستی کوآرڈینیٹس؛ ہر نماز کے لیے منٹوں کی تصحیح
- اوقاتِ نماز کے کئی ذرائع — بشمول سویڈن اور مراکش کے شائع شدہ سرکاری جدول — یا مکمل طور پر آلے پر حساب
- 13 زبانیں، بشمول عربی اور اردو دائیں سے بائیں ترتیب کے ساتھ
- روشن، تاریک، خالص سیاہ اور سسٹم تھیمز، اپنی پسند کا ایکسنٹ رنگ، اور Material You

رازداری اور نیٹ ورک کا استعمال:
- کوئی اینالیٹکس نہیں، کوئی ٹریکر نہیں، کوئی اشتہار نہیں، کوئی اکاؤنٹ نہیں
- مقام مقرر ہو جانے کے بعد اوقات مکمل طور پر آپ کے آلے پر شمار ہو سکتے ہیں
- اختیاری آن لائن سہولتیں، صرف آپ کے انتخاب پر: اوقات فراہم کرنے والے (AlAdhan، PrayTimes.dev، یا سویڈن اور مراکش کے تیار کردہ سرکاری جدول)، OpenStreetMap Nominatim کے ذریعے جگہ کی تلاش، اور قرآن کے صفحات، تراجم، تفسیر اور تلاوت کے آڈیو کی ڈاؤن لوڈنگ
- مطابقت کبھی ہمارے کسی سرور سے نہیں گزرتی، اور جو کچھ لکھا جاتا ہے وہ آپ کے جوڑے ہوئے آلات کے سوا کسی کے لیے قابلِ مطالعہ نہیں
- آپ کے کوآرڈینیٹس صرف آپ کے آلے پر محفوظ ہوتے ہیں

ایپ AGPL-3.0-or-later کے تحت اوپن سورس ہے۔""",
)

DATA["hi-IN"] = dict(
    language="Hindi",
    app_name="मिहराब: नमाज़ का समय",
    short_description="नमाज़ का समय, अज़ान रिमाइंडर, क़ुरआन रीडर और विजेट। कोई ट्रैकर नहीं।",
    full_description="""मिहराब पाँचों वक़्त की नमाज़ को हाथ के पास रखता है: एक शांत होम स्क्रीन जिस पर अगली नमाज़ और चलती हुई उलटी गिनती, वैकल्पिक अज़ान रिमाइंडर, पूरे महीने का नक़्शा, और होम-स्क्रीन विजेट।

मुख्य विशेषताएँ:
- आज, आने वाले हफ़्ते और पूरे महीने के नमाज़ के समय — तस्वीर या PDF के रूप में साझा करें
- पाँचों नमाज़ों के लिए वैकल्पिक सूचनाएँ, सत्रह अज़ान रिकॉर्डिंग या आपकी अपनी, नमाज़ से पहले याद दिलाना और स्नूज़
- लॉक स्क्रीन और नोटिफिकेशन शेड पर पिन की गई उलटी गिनती (Live Activity), तीन डिज़ाइनों में
- होम-स्क्रीन विजेट: तीन आकारों में नमाज़ का समय, आज का रिकॉर्ड, हिजरी तारीख़, निरंतरता, तस्बीह और तिलावत
- क़िबला कम्पास, सिग्नल की मज़बूती और सूरज से मिलान की सुविधा के साथ
- क़ुरआन रीडर: आधिकारिक पृष्ठ फ़ॉन्ट से बना मदीना मुसहफ़, चार रिवायतों में (हफ़्स, वर्श, क़ालून, शुअ्बा), 13 अनुवाद और शास्त्रीय तफ़सीर, 42 क़ारी, शब्द-दर-शब्द हाइलाइट, हिफ़्ज़ के उपकरण, बुकमार्क और ख़त्म-ए-क़ुरआन योजनाएँ
- दुआएँ (हिस्नुल मुस्लिम), तस्बीह काउंटर, रोज़े का रिकॉर्ड, अभ्यास ग्राफ़ और निरंतरता वाली नमाज़ डायरी, और पास की मस्जिदें
- हिजरी कैलेंडर, रमज़ान, ईद और जुमा के साथ
- अपने ही उपकरणों के बीच सिंक — बिना खाते और बिना सर्वर के: उसी फ़ोल्डर में सीलबंद फ़ाइलें जिसे आप पहले से सिंक करते हैं
- बैकअप और पुनर्स्थापन एक ऐसी फ़ाइल में जो आपके पास रहे
- GPS स्थान, जगह की खोज, सहेजी गई जगहें या मैनुअल निर्देशांक; हर नमाज़ के लिए मिनटों का समायोजन
- नमाज़ के समय के कई स्रोत — स्वीडन और मोरक्को की प्रकाशित राष्ट्रीय तालिकाओं सहित — या पूरी तरह डिवाइस पर गणना
- 13 भाषाएँ, जिनमें दाएँ-से-बाएँ लेआउट वाली अरबी और उर्दू शामिल हैं
- हल्की, गहरी, पूर्ण-काली और सिस्टम थीम, अपनी पसंद का एक्सेंट रंग, और Material You

निजता और नेटवर्क का उपयोग:
- कोई एनालिटिक्स नहीं, कोई ट्रैकर नहीं, कोई विज्ञापन नहीं, कोई खाता नहीं
- स्थान तय होने के बाद नमाज़ का समय पूरी तरह आपके डिवाइस पर निकाला जा सकता है
- वैकल्पिक ऑनलाइन सुविधाएँ, केवल आपके चुनने पर: समय प्रदाता (AlAdhan, PrayTimes.dev, या स्वीडन और मोरक्को की तैयार राष्ट्रीय तालिकाएँ), OpenStreetMap Nominatim से जगह की खोज, और क़ुरआन के पृष्ठ, अनुवाद, तफ़सीर तथा तिलावत ऑडियो का डाउनलोड
- सिंक कभी हमारे किसी सर्वर से नहीं गुज़रता, और जो लिखा जाता है वह आपके जोड़े गए उपकरणों के अलावा किसी के लिए पढ़ने योग्य नहीं
- आपके निर्देशांक केवल आपके डिवाइस पर रखे जाते हैं

ऐप AGPL-3.0-or-later के तहत ओपन सोर्स है।""",
)

DATA["bn-BD"] = dict(
    language="Bengali",
    app_name="মিহরাব: নামাজের সময়",
    short_description="নামাজের সময়, আজানের রিমাইন্ডার, কুরআন ও উইজেট। কোনো ট্র্যাকার নেই।",
    full_description="""মিহরাব পাঁচ ওয়াক্ত নামাজকে হাতের কাছে রাখে: পরবর্তী নামাজ ও চলমান কাউন্টডাউনসহ একটি শান্ত হোম স্ক্রিন, ঐচ্ছিক আজানের রিমাইন্ডার, পুরো মাসের সময়সূচি এবং হোম-স্ক্রিন উইজেট।

প্রধান বৈশিষ্ট্য:
- আজ, আগামী সপ্তাহ ও পুরো মাসের নামাজের সময় — ছবি বা PDF হিসেবে শেয়ার করা যায়
- পাঁচ ওয়াক্তের জন্য ঐচ্ছিক বিজ্ঞপ্তি, সতেরোটি আজানের রেকর্ডিং বা আপনার নিজের, নামাজের আগে রিমাইন্ডার ও স্নুজ
- লক স্ক্রিন ও নোটিফিকেশন শেডে পিন করা কাউন্টডাউন (Live Activity), তিনটি ডিজাইনে
- হোম-স্ক্রিন উইজেট: তিন মাপে নামাজের সময়, আজকের হিসাব, হিজরি তারিখ, ধারাবাহিকতা, তাসবিহ ও তিলাওয়াত
- কিবলা কম্পাস, সিগন্যালের শক্তিসহ এবং সূর্যের অবস্থান দিয়ে যাচাইয়ের সুযোগ
- কুরআন রিডার: সরকারি পৃষ্ঠা-ফন্টে আঁকা মদিনা মুসহাফ, চার রেওয়ায়েতে (হাফস, ওয়ারশ, কালুন, শুবা), ১৩টি অনুবাদ ও ধ্রুপদি তাফসির, ৪২ জন ক্বারি, শব্দভিত্তিক হাইলাইট, হিফজের সরঞ্জাম, বুকমার্ক ও খতম পরিকল্পনা
- দোয়া (হিসনুল মুসলিম), তাসবিহ কাউন্টার, রোজার হিসাব, অনুশীলন গ্রাফ ও ধারাবাহিকতাসহ নামাজের জার্নাল, এবং কাছের মসজিদ
- হিজরি ক্যালেন্ডার, রমজান, ঈদ ও জুমার চিহ্নসহ
- নিজের ডিভাইসগুলোর মধ্যে সিঙ্ক — অ্যাকাউন্ট ছাড়া, সার্ভার ছাড়া: আপনি যে ফোল্ডার এমনিতেই সিঙ্ক করেন সেখানে সিলমোহরকৃত ফাইল
- ব্যাকআপ ও পুনরুদ্ধার এমন একটি ফাইলে যা আপনার কাছেই থাকে
- GPS অবস্থান, জায়গা খোঁজা, সংরক্ষিত জায়গা বা হাতে দেওয়া স্থানাঙ্ক; প্রতি ওয়াক্তে মিনিটের সমন্বয়
- নামাজের সময়ের একাধিক উৎস — সুইডেন ও মরক্কোর প্রকাশিত জাতীয় তালিকাসহ — অথবা সম্পূর্ণ ডিভাইসেই হিসাব
- ১৩টি ভাষা, ডান-থেকে-বাম বিন্যাসের আরবি ও উর্দুসহ
- হালকা, গাঢ়, নিকষ কালো ও সিস্টেম থিম, পছন্দমতো অ্যাকসেন্ট রং, এবং Material You

গোপনীয়তা ও নেটওয়ার্ক ব্যবহার:
- কোনো অ্যানালিটিক্স নেই, ট্র্যাকার নেই, বিজ্ঞাপন নেই, অ্যাকাউন্ট নেই
- অবস্থান ঠিক করা হলে নামাজের সময় সম্পূর্ণ আপনার ডিভাইসেই হিসাব করা যায়
- ঐচ্ছিক অনলাইন সুবিধা, কেবল আপনি বেছে নিলে: সময়ের সরবরাহকারী (AlAdhan, PrayTimes.dev, বা সুইডেন ও মরক্কোর প্রস্তুত জাতীয় তালিকা), OpenStreetMap Nominatim দিয়ে জায়গা খোঁজা, এবং কুরআনের পৃষ্ঠা, অনুবাদ, তাফসির ও তিলাওয়াতের অডিও ডাউনলোড
- সিঙ্ক কখনো আমাদের কোনো সার্ভার দিয়ে যায় না, আর যা লেখা হয় তা আপনার জোড়া লাগানো ডিভাইস ছাড়া কারও পক্ষে পড়া সম্ভব নয়
- আপনার স্থানাঙ্ক কেবল আপনার ডিভাইসেই রাখা হয়

অ্যাপটি AGPL-3.0-or-later লাইসেন্সে ওপেন সোর্স।""",
)

# Play's own caps. The importer rejects the file rather than truncating.
LIMITS = {"app_name": 30, "short_description": 80, "full_description": 4000}
ORDER = ["en-US", "ar", "bn-BD", "de-DE", "es-ES", "fr-FR", "hi-IN",
         "id", "ru-RU", "sv-SE", "tr-TR", "ur", "zh-CN"]

missing = [c for c in ORDER if c not in DATA] + [c for c in DATA if c not in ORDER]
if missing:
    sys.exit("locale mismatch: %s" % missing)

bad = []
for code in ORDER:
    row = DATA[code]
    for field, cap in LIMITS.items():
        n = len(row[field])
        if n > cap:
            bad.append("%s %s is %d chars, cap is %d" % (code, field, n, cap))
        if not row[field].strip():
            bad.append("%s %s is empty" % (code, field))

out = os.path.join(ROOT, "branding/store/mihrab-play-store-listing.csv")
with open(out, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    w.writerow(["Language code", "Language", "App name",
                "Short description", "Full description"])
    for code in ORDER:
        r = DATA[code]
        w.writerow([code, r["language"], r["app_name"],
                    r["short_description"], r["full_description"]])

print("%-7s %-22s %-5s %-5s %s" % ("code", "language", "name", "short", "full"))
for code in ORDER:
    r = DATA[code]
    print("%-7s %-22s %5d %5d %6d" % (
        code, r["language"], len(r["app_name"]),
        len(r["short_description"]), len(r["full_description"])))
print()
if bad:
    print("PROBLEMS:")
    for b in bad:
        print("  - " + b)
    sys.exit(1)
print("wrote %s  (%d languages, all within Play's limits)" % (out, len(ORDER)))
