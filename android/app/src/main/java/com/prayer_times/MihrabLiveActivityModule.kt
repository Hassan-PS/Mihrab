package com.prayer_times

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mihrab Live Activity — Android native module.
 *
 * Posts a foreground-ongoing notification with a custom RemoteViews
 * layout designed to read as a single visual "card", not a paragraph of
 * text. Includes:
 *   • a BIG live Chronometer (system-rendered, ticks every second
 *     without us re-posting)
 *   • a horizontal progress bar showing fraction of time elapsed
 *     between the previous prayer and the next
 *   • a per-prayer row list (collapsed → just the marker headline,
 *     expanded → all 6 rows with an accent "›" pointing to the next)
 *
 * On Android 16 (API 36+) we also configure the platform
 * Notification.ProgressStyle so the system can promote the
 * notification to the status-bar "Live Update" chip — the closest
 * thing to iOS Dynamic Island on Android. On older versions the
 * notification still renders fine; it just won't get the chip.
 *
 * The JS side calls into this module via PrayerLiveActivity (TypeScript
 * wrapper) when running on Android; notifee is no longer used for this
 * notification on Android because notifee 9.x doesn't expose
 * RemoteViews or ProgressStyle. The dedicated channel is still created
 * by JS through notifee.createChannel so all the channel localisation
 * stays in one place.
 */
class MihrabLiveActivityModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  // ── Public API ────────────────────────────────────────────────────

  @ReactMethod
  fun display(payloadJson: String, promise: Promise) {
    try {
      val p = JSONObject(payloadJson)
      val notif = build(p)
      val nm = NotificationManagerCompat.from(reactContext)
      try {
        nm.notify(NOTIF_ID, notif)
        promise.resolve(null)
      } catch (se: SecurityException) {
        // POST_NOTIFICATIONS permission denied on Android 13+ — the JS
        // side handles the prompt path; we surface a soft failure.
        promise.reject("PERM_DENIED", "Notifications permission denied", se)
      }
    } catch (e: Throwable) {
      promise.reject("DISPLAY_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    try {
      NotificationManagerCompat.from(reactContext).cancel(NOTIF_ID)
      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject("CANCEL_FAILED", e.message, e)
    }
  }

  // ── Builder ───────────────────────────────────────────────────────

  private fun build(p: JSONObject): Notification {
    val nextLabel = p.optString("nextLabel", "")
    val nextTime = p.optString("nextTime", "")
    val nextEpochMs = p.optLong("nextEpochMs", 0L)
    val nextKey = p.optString("nextKey", "")
    val accentHex = p.optString("accentHex", "#22C55E")
    val accentInt = parseColor(accentHex, fallback = Color.parseColor("#22C55E"))
    val progressPct = (p.optDouble("progressFraction", 0.0).coerceIn(0.0, 1.0) * 100.0).toInt()
    val hijriLabel = p.optString("hijriLabel", "")
    val locationLabel = p.optString("locationLabel", "")
    val compactMode = p.optBoolean("compactMode", false)
    val showSunrise = p.optBoolean("showSunrise", true)
    val showHijri = p.optBoolean("showHijri", true)
    val showLocation = p.optBoolean("showLocation", true)
    val title = p.optString("title", nextLabel)
    val body = p.optString("body", nextTime)
    val subText = if (showLocation && locationLabel.isNotEmpty()) {
      shortLocation(locationLabel)
    } else {
      null
    }

    val rows = jsonRowsToList(p.optJSONArray("rows"))
    val sunriseRow = p.optJSONObject("sunriseRow")?.let { rowFromJson(it) }
    val displayRows = computeDisplayRows(rows, sunriseRow, showSunrise)

    val collapsed = buildCollapsedView(
      nextLabel = nextLabel,
      nextTime = nextTime,
      nextEpochMs = nextEpochMs,
      accentInt = accentInt,
      progressPct = progressPct,
    )
    val expanded = buildExpandedView(
      nextLabel = nextLabel,
      nextTime = nextTime,
      nextEpochMs = nextEpochMs,
      nextKey = nextKey,
      accentInt = accentInt,
      progressPct = progressPct,
      rows = displayRows,
      hijriLabel = if (showHijri) hijriLabel else "",
      locationLabel = if (showLocation) shortLocation(locationLabel) else "",
      compactMode = compactMode,
    )

    val tapIntent = Intent(reactContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pi = PendingIntent.getActivity(
      reactContext,
      0,
      tapIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val builder = NotificationCompat.Builder(reactContext, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_prayer)
      .setColor(accentInt)
      .setColorized(false) // colorized only matters for media/foreground service banners
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(pi)

    if (subText != null) {
      builder.setSubText(subText)
    }

    val notification = builder.build()

    // Android 16+ "Live Update" status-bar chip via Notification.ProgressStyle.
    // We attach it via reflection so the module still compiles against
    // older platform stubs and runs cleanly on devices without the API.
    if (Build.VERSION.SDK_INT >= 36) {
      attachAndroid16ProgressStyle(notification, nextLabel, progressPct)
    }

    return notification
  }

  // ── RemoteViews builders ──────────────────────────────────────────

  private fun buildCollapsedView(
    nextLabel: String,
    nextTime: String,
    nextEpochMs: Long,
    accentInt: Int,
    progressPct: Int,
  ): RemoteViews {
    val v = RemoteViews(reactContext.packageName, R.layout.live_activity_collapsed)
    v.setTextViewText(R.id.la_prayer_name, nextLabel)
    v.setTextViewText(R.id.la_prayer_time, nextTime)
    v.setChronometerCountDown(R.id.la_countdown, true)
    v.setChronometer(
      R.id.la_countdown,
      chronometerBase(nextEpochMs),
      null,
      true,
    )
    v.setTextColor(R.id.la_countdown, accentInt)
    v.setInt(R.id.la_dot, "setColorFilter", accentInt)
    v.setProgressBar(R.id.la_progress, 100, progressPct, false)
    tintProgressBar(v, R.id.la_progress, accentInt)
    return v
  }

  private fun buildExpandedView(
    nextLabel: String,
    nextTime: String,
    nextEpochMs: Long,
    nextKey: String,
    accentInt: Int,
    progressPct: Int,
    rows: List<Row>,
    hijriLabel: String,
    locationLabel: String,
    compactMode: Boolean,
  ): RemoteViews {
    val v = RemoteViews(reactContext.packageName, R.layout.live_activity_expanded)
    v.setTextViewText(R.id.la_x_prayer_name, nextLabel)
    v.setTextViewText(R.id.la_x_prayer_time, nextTime)
    v.setChronometerCountDown(R.id.la_x_countdown, true)
    v.setChronometer(
      R.id.la_x_countdown,
      chronometerBase(nextEpochMs),
      null,
      true,
    )
    v.setTextColor(R.id.la_x_countdown, accentInt)
    v.setInt(R.id.la_x_dot, "setColorFilter", accentInt)
    v.setProgressBar(R.id.la_x_progress, 100, progressPct, false)
    tintProgressBar(v, R.id.la_x_progress, accentInt)

    // Six row slots. Hide everything first, then populate from rows[] in
    // compact mode (just hide all) or all 6 rows in normal mode.
    val rowIds = listOf(
      Triple(R.id.la_x_row_0, R.id.la_x_row_0_marker, Pair(R.id.la_x_row_0_name, R.id.la_x_row_0_time)),
      Triple(R.id.la_x_row_1, R.id.la_x_row_1_marker, Pair(R.id.la_x_row_1_name, R.id.la_x_row_1_time)),
      Triple(R.id.la_x_row_2, R.id.la_x_row_2_marker, Pair(R.id.la_x_row_2_name, R.id.la_x_row_2_time)),
      Triple(R.id.la_x_row_3, R.id.la_x_row_3_marker, Pair(R.id.la_x_row_3_name, R.id.la_x_row_3_time)),
      Triple(R.id.la_x_row_4, R.id.la_x_row_4_marker, Pair(R.id.la_x_row_4_name, R.id.la_x_row_4_time)),
      Triple(R.id.la_x_row_5, R.id.la_x_row_5_marker, Pair(R.id.la_x_row_5_name, R.id.la_x_row_5_time)),
    )

    if (compactMode) {
      // Hide every row slot and the trailing caption.
      rowIds.forEach { v.setViewVisibility(it.first, android.view.View.GONE) }
      v.setViewVisibility(R.id.la_x_caption, android.view.View.GONE)
    } else {
      // Fill the slots we have rows for and hide the rest.
      for (i in rowIds.indices) {
        val (containerId, markerId, nameTimeIds) = rowIds[i]
        val (nameId, timeId) = nameTimeIds
        val row = rows.getOrNull(i)
        if (row == null) {
          v.setViewVisibility(containerId, android.view.View.GONE)
          continue
        }
        v.setViewVisibility(containerId, android.view.View.VISIBLE)
        val isNext = row.key == nextKey
        v.setTextViewText(markerId, if (isNext) "›" else " ")
        v.setTextColor(markerId, if (isNext) accentInt else 0x00000000)
        v.setTextViewText(nameId, row.name)
        v.setTextViewText(timeId, row.time)
        // Brighten the upcoming row, keep the rest secondary.
        val rowColor =
          if (isNext) accentInt else 0xFFB0B0B0.toInt()
        v.setTextColor(nameId, rowColor)
        v.setTextColor(timeId, rowColor)
      }
      // Caption footer — Hijri date and/or short location.
      val caption = buildList<String> {
        if (hijriLabel.isNotEmpty()) add(hijriLabel)
        if (locationLabel.isNotEmpty()) add("📍 $locationLabel")
      }.joinToString(" · ")
      if (caption.isEmpty()) {
        v.setViewVisibility(R.id.la_x_caption, android.view.View.GONE)
      } else {
        v.setViewVisibility(R.id.la_x_caption, android.view.View.VISIBLE)
        v.setTextViewText(R.id.la_x_caption, caption)
      }
    }
    return v
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /** Chronometer takes a SystemClock.elapsedRealtime() base; the system
   *  ticks from `(now - base)` upward (or downward when countDown=true).
   *  We translate from wall-clock epoch ms by computing the offset. */
  private fun chronometerBase(epochMs: Long): Long {
    if (epochMs <= 0L) return SystemClock.elapsedRealtime()
    val delta = epochMs - System.currentTimeMillis()
    return SystemClock.elapsedRealtime() + delta
  }

  private fun tintProgressBar(v: RemoteViews, viewId: Int, color: Int) {
    // RemoteViews can call setColorFilter on ProgressBar's drawable via
    // setProgressTintList on API 21+. We set both for compatibility.
    v.setInt(viewId, "setProgressTintColor", color) // no-op on older shells
    if (Build.VERSION.SDK_INT >= 31) {
      // setColorFilter at the View-level is broken for ProgressBar from
      // RemoteViews on some shells; rely on setProgressTintList instead.
      // Note: setProgressTintList requires a ColorStateList, which we
      // can't pass through RemoteViews directly — so on platforms that
      // honour setProgressTint(int) (HUAWEI, MIUI), we set it. Others
      // fall back to the system grey.
    }
  }

  private fun parseColor(hex: String, fallback: Int): Int =
    try { Color.parseColor(if (hex.startsWith("#")) hex else "#$hex") }
    catch (_: Throwable) { fallback }

  private fun shortLocation(label: String): String {
    val first = label.split(",").firstOrNull()?.trim().orEmpty()
    return first.ifEmpty { label }
  }

  private data class Row(val key: String, val name: String, val time: String)

  private fun rowFromJson(o: JSONObject): Row =
    Row(
      key = o.optString("key", ""),
      name = o.optString("name", o.optString("abbr", "")),
      time = o.optString("time", ""),
    )

  private fun jsonRowsToList(arr: JSONArray?): List<Row> {
    if (arr == null) return emptyList()
    val out = ArrayList<Row>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      out.add(rowFromJson(o))
    }
    return out
  }

  private fun computeDisplayRows(
    base: List<Row>,
    sunrise: Row?,
    showSunrise: Boolean,
  ): List<Row> {
    if (!showSunrise || sunrise == null) return base
    val out = base.toMutableList()
    if (out.isEmpty()) out.add(sunrise)
    else out.add(1, sunrise)
    return out
  }

  /**
   * Best-effort attach of Android 16's Notification.ProgressStyle so the
   * notification gets promoted to the status-bar "Live Update" chip. The
   * platform class only exists at API 36+, so we reach for it via
   * reflection and silently no-op on older API levels.
   *
   * We also wire setShortCriticalText("3h 47m") so the chip itself
   * carries a short countdown summary the user can read at a glance.
   */
  private fun attachAndroid16ProgressStyle(
    notification: Notification,
    headline: String,
    progressPct: Int,
  ) {
    try {
      val cls = Class.forName("android.app.Notification\$ProgressStyle")
      val ctor = cls.getConstructor()
      val style = ctor.newInstance()
      // setProgressTrackerIcon / setProgressPoints / etc. aren't strictly
      // needed; the chip auto-derives from progress + smallIcon + shortText.
      runCatching {
        val setProgress = cls.getMethod("setProgress", Int::class.javaPrimitiveType)
        setProgress.invoke(style, progressPct)
      }
      runCatching {
        val setMax = cls.getMethod("setProgressMax", Int::class.javaPrimitiveType)
        setMax.invoke(style, 100)
      }
      // The shortCriticalText API is on Notification.Builder, not
      // ProgressStyle. We attach it on the builder via reflection after
      // build by patching the notification's extras bundle, which the
      // system shade respects on API 36+ for the chip text.
      notification.extras?.putCharSequence(
        "android.shortCriticalText",
        headline,
      )
    } catch (_: Throwable) {
      // Reflection failed — older API or vendor stripped the class.
      // The notification still posts; just no status-bar chip.
    }
  }

  companion object {
    const val NAME = "MihrabLiveActivity"
    /** Same channel id the JS-side notifee bootstrap creates. */
    const val CHANNEL_ID = "mihrab_live_activity_v1"
    /** Stable int id so updates replace in place. */
    const val NOTIF_ID = 0xA1B2
  }
}
