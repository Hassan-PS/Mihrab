/**
 * A month of prayer times as the Moroccan Ministry of Habous publishes them.
 *
 * Source: habous.gov.ma/prieres/index.php?ville=1 (الرباط / Rabat), the
 * month of Rabi' al-Awwal 1448 — 14 August to 12 September 2026. Saved from
 * the page and transcribed verbatim; the ministry's own columns are
 * الصبح / الشروق / الظهر / العصر / المغرب / العشاء, in that order, and it
 * publishes no Imsak (the app derives that from Fajr).
 *
 * Why a whole month rather than a day: two readings could not tell a
 * published MARGIN apart from our city coordinates being slightly off.
 * Thirty can. Dhuhr lands on the ministry's minute all thirty days, which
 * pins the longitude, and the sunrise and Maghrib offsets then hold steady
 * across the month — so they are the ministry's conventions and not our
 * error. That is what justifies the offsets in `localAdhan.ts`.
 *
 * Rows are [gregorianDayOfMonth, Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha].
 * The day number ROLLS OVER — 14…31 August, then 1…12 September — because a
 * Hijri month does not align to a Gregorian one. Anything parsing this, or
 * the page it came from, has to handle that.
 */
export type HabousRow = readonly [number, string, string, string, string, string, string];

export const HABOUS_RABAT_RABI_AWWAL_1448: readonly HabousRow[] = [
  [14, '05:10', '06:45', '13:37', '17:14', '20:19', '21:41'],
  [15, '05:11', '06:46', '13:37', '17:14', '20:18', '21:40'],
  [16, '05:12', '06:47', '13:37', '17:13', '20:17', '21:38'],
  [17, '05:13', '06:47', '13:36', '17:13', '20:16', '21:37'],
  [18, '05:15', '06:48', '13:36', '17:12', '20:15', '21:35'],
  [19, '05:16', '06:49', '13:36', '17:12', '20:14', '21:34'],
  [20, '05:17', '06:50', '13:36', '17:11', '20:12', '21:33'],
  [21, '05:18', '06:50', '13:36', '17:11', '20:11', '21:31'],
  [22, '05:19', '06:51', '13:35', '17:10', '20:10', '21:30'],
  [23, '05:20', '06:52', '13:35', '17:10', '20:09', '21:28'],
  [24, '05:21', '06:52', '13:35', '17:09', '20:08', '21:27'],
  [25, '05:22', '06:53', '13:34', '17:09', '20:06', '21:25'],
  [26, '05:23', '06:54', '13:34', '17:08', '20:05', '21:24'],
  [27, '05:24', '06:54', '13:34', '17:08', '20:04', '21:22'],
  [28, '05:25', '06:55', '13:34', '17:07', '20:02', '21:21'],
  [29, '05:25', '06:56', '13:33', '17:06', '20:01', '21:19'],
  [30, '05:26', '06:57', '13:33', '17:06', '20:00', '21:18'],
  [31, '05:27', '06:57', '13:33', '17:05', '19:59', '21:16'],
  [1, '05:28', '06:58', '13:32', '17:04', '19:57', '21:15'],
  [2, '05:29', '06:59', '13:32', '17:04', '19:56', '21:13'],
  [3, '05:30', '06:59', '13:32', '17:03', '19:55', '21:12'],
  [4, '05:31', '07:00', '13:31', '17:02', '19:53', '21:10'],
  [5, '05:32', '07:01', '13:31', '17:02', '19:52', '21:09'],
  [6, '05:33', '07:01', '13:31', '17:01', '19:50', '21:07'],
  [7, '05:34', '07:02', '13:30', '17:00', '19:49', '21:05'],
  [8, '05:35', '07:03', '13:30', '16:59', '19:48', '21:04'],
  [9, '05:35', '07:04', '13:30', '16:58', '19:46', '21:02'],
  [10, '05:36', '07:04', '13:29', '16:58', '19:45', '21:01'],
  [11, '05:37', '07:05', '13:29', '16:57', '19:44', '20:59'],
  [12, '05:38', '07:06', '13:29', '16:56', '19:42', '20:58'],
];

/** Rabat, as the app would see it from a phone in the city. */
export const RABAT = { latitude: 34.0209, longitude: -6.8416, timeZone: 'Africa/Casablanca' };
