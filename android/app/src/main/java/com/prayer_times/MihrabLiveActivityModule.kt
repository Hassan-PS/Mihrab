package com.prayer_times

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.SystemClock
import android.util.Log
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
 * Posts an ongoing notification that gives the user a live countdown
 * to the next prayer.
 *
 * On Android 16+ (API 36): uses the platform Notification.ProgressStyle
 * + Builder.setShortCriticalText() so the system promotes the
 * notification to the status-bar "Live Update" chip — the small pill
 * next to the clock that shows the countdown text without the user
 * having to open the notification shade. This is the closest Android
 * equivalent to iOS's Dynamic Island.
 *
 * On older Android: falls back to NotificationCompat.InboxStyle +
 * setProgress + setUsesChronometer. The progress bar and prayer-list
 * rendering are universal; only the status-bar chip needs API 36.
 *
 * Sunrise is always included in the list (no toggle). Hijri date and
 * location were removed from the surface in beta.5 — they belong on
 * the home screen, not in a glanceable pinned notification.
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
      Log.i(NAME, "display: nextLabel=${p.optString("nextLabel")} epochMs=${p.optLong("nextEpochMs")} progress=${p.optDouble("progressFraction")}")
      try {
        nm.notify(NOTIF_ID, notif)
        Log.i(NAME, "display: posted id=$NOTIF_ID channel=$CHANNEL_ID api=${Build.VERSION.SDK_INT}")
        promise.resolve(null)
      } catch (se: SecurityException) {
        Log.w(NAME, "display: POST_NOTIFICATIONS permission denied", se)
        promise.reject("PERM_DENIED", "Notifications permission denied", se)
      }
    } catch (e: Throwable) {
      Log.e(NAME, "display: failed", e)
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

  // ── Builder dispatch ──────────────────────────────────────────────

  private fun build(p: JSONObject): Notification {
    val ctx = reactContext
    val nextLabel = p.optString("nextLabel", "")
    val nextTime = p.optString("nextTime", "")
    val nextEpochMs = p.optLong("nextEpochMs", 0L)
    val nextKey = p.optString("nextKey", "")
    val accentInt = parseColor(p.optString("accentHex", "#22C55E"), Color.parseColor("#22C55E"))
    val progressPct = (p.optDouble("progressFraction", 0.0).coerceIn(0.0, 1.0) * 100.0).toInt()
    val compactMode = p.optBoolean("compactMode", false)
    val title = p.optString("title", nextLabel)
    val body = p.optString("body", nextTime)

    val rows = jsonRowsToList(p.optJSONArray("rows"))
    val sunriseRow = p.optJSONObject("sunriseRow")?.let { rowFromJson(it) }
    // Sunrise is always included now (permanent, not toggleable).
    val displayRows = computeDisplayRows(rows, sunriseRow)

    val tap = Intent(ctx, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pi = PendingIntent.getActivity(
      ctx,
      0,
      tap,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    return if (Build.VERSION.SDK_INT >= 36) {
      buildAndroid16(
        nextLabel = nextLabel,
        nextTime = nextTime,
        nextEpochMs = nextEpochMs,
        nextKey = nextKey,
        accentInt = accentInt,
        progressPct = progressPct,
        compactMode = compactMode,
        rows = displayRows,
        title = title,
        body = body,
        contentIntent = pi,
      )
    } else {
      buildLegacy(
        nextLabel = nextLabel,
        nextTime = nextTime,
        nextEpochMs = nextEpochMs,
        nextKey = nextKey,
        accentInt = accentInt,
        progressPct = progressPct,
        compactMode = compactMode,
        rows = displayRows,
        title = title,
        body = body,
        contentIntent = pi,
      )
    }
  }

  // ── Android 16+ path (status-bar Live Update chip) ───────────────

  /**
   * Build via platform Notification.Builder with Notification.ProgressStyle
   * and setShortCriticalText so the OS promotes the notification to the
   * status-bar Live Update chip on Android 16+.
   *
   * The platform Builder is used directly (not NotificationCompat) because
   * the API 36 chip features aren't in the AndroidX wrapper yet. We try
   * the typed calls first; if any of the new methods are missing on a
   * given build, we fall through to the legacy path so the notification
   * still posts.
   */
  @SuppressLint("NewApi")
  private fun buildAndroid16(
    nextLabel: String,
    nextTime: String,
    nextEpochMs: Long,
    nextKey: String,
    accentInt: Int,
    progressPct: Int,
    compactMode: Boolean,
    rows: List<Row>,
    title: String,
    body: String,
    contentIntent: PendingIntent,
  ): Notification {
    try {
      // Short text for the status-bar chip — kept under 12 chars so it
      // fits the small pill next to the clock. Format: "3h 21m" / "47m".
      val shortText = formatRemainingShort(nextEpochMs - System.currentTimeMillis())

      val builder = Notification.Builder(reactContext, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_prayer)
        .setColor(accentInt)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        // localOnly intentionally false here — Android 16's Live Update
        // chip is gated against localOnly notifications on some shells.
        .setLocalOnly(false)
        // PROGRESS is the eligible category for the status-bar Live
        // Update chip on Android 16. STATUS is reserved for system
        // status (battery, network, etc.) and isn't promoted.
        .setCategory(Notification.CATEGORY_PROGRESS)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentTitle(title)
        .setContentText(body)
        .setContentIntent(contentIntent)
        .setWhen(nextEpochMs)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)

      // ProgressStyle — the new style class on Android 16. Reflection
      // for instantiation in case the build classes diverge from the
      // stable SDK; if reflection fails we fall back to setProgress
      // below.
      val progressStyleAttached = tryAttachProgressStyle(builder, progressPct)

      // Short critical text — drives the status-bar chip on Android 16.
      // Method may be called setShortCriticalText OR live behind a
      // different name on certain OEM forks; we try both.
      tryAttachShortCriticalText(builder, shortText)

      // ASK the system to promote this to an ongoing chip. New in API 36;
      // the method name varies between SDK rev/preview builds, so we
      // probe by signature.
      tryRequestPromotedOngoing(builder)
      // Also log every Builder method on first call so we have a complete
      // map of the API surface this device exposes — invaluable when an
      // OEM strips or renames methods.
      if (!loggedBuilderMethods) {
        loggedBuilderMethods = true
        val all = Notification.Builder::class.java.methods
          .map { "${it.name}(${it.parameterTypes.joinToString { p -> p.simpleName }})" }
          .sorted()
        Log.i(NAME, "Notification.Builder methods (${all.size}): ${all.joinToString("; ")}")
      }

      // Inbox-style line list as a secondary expansion fallback. Newer
      // shells render the ProgressStyle expansion, but if the chip
      // doesn't kick in we still get a useful row list when the user
      // pulls the shade down.
      if (!progressStyleAttached) {
        val inbox = Notification.InboxStyle().setBigContentTitle(title)
        if (!compactMode) {
          for (row in rows) {
            val marker = if (row.key == nextKey) "›" else " "
            inbox.addLine("$marker  ${row.name}  ${row.time}")
          }
        }
        builder.setStyle(inbox)
        builder.setProgress(100, progressPct, false)
      } else {
        // ProgressStyle handles the body; we still attach the prayer
        // list via extras so the system can render it where it makes
        // sense.
        if (!compactMode) {
          val lines = rows.map { r ->
            val marker = if (r.key == nextKey) "›" else " "
            "$marker  ${r.name}  ${r.time}"
          }
          // android.textLines is the platform extras key InboxStyle
          // writes to. Setting it directly lets the system pick up the
          // list even when the primary style is ProgressStyle.
          val extras = builder.extras
          extras.putCharSequenceArray(
            "android.textLines",
            lines.map { it as CharSequence }.toTypedArray(),
          )
          extras.putCharSequence("android.title.big", title)
        }
      }

      return builder.build()
    } catch (t: Throwable) {
      Log.w(NAME, "Android 16 path failed, falling back to legacy", t)
      return buildLegacy(
        nextLabel = nextLabel,
        nextTime = nextTime,
        nextEpochMs = nextEpochMs,
        nextKey = nextKey,
        accentInt = accentInt,
        progressPct = progressPct,
        compactMode = compactMode,
        rows = rows,
        title = title,
        body = body,
        contentIntent = contentIntent,
      )
    }
  }

  /** Reflectively instantiate Notification.ProgressStyle and attach it
   *  to the builder. Returns true on success. */
  private fun tryAttachProgressStyle(
    builder: Notification.Builder,
    progressPct: Int,
  ): Boolean {
    return try {
      val styleClass = Class.forName("android.app.Notification\$ProgressStyle")
      val ctor = styleClass.getConstructor()
      val style = ctor.newInstance()
      runCatching {
        val setProgress = styleClass.getMethod("setProgress", Int::class.javaPrimitiveType)
        setProgress.invoke(style, progressPct)
      }
      runCatching {
        val setStyledByProgress =
          styleClass.getMethod("setStyledByProgress", Boolean::class.javaPrimitiveType)
        setStyledByProgress.invoke(style, true)
      }
      // builder.setStyle(Style) — Style is the abstract parent
      val styleParent = Class.forName("android.app.Notification\$Style")
      val setStyle = Notification.Builder::class.java.getMethod("setStyle", styleParent)
      setStyle.invoke(builder, style)
      Log.i(NAME, "ProgressStyle attached, progress=$progressPct")
      true
    } catch (t: Throwable) {
      Log.w(NAME, "ProgressStyle reflection failed", t)
      false
    }
  }

  /** Set the short critical text on the notification — drives the
   *  status-bar Live Update chip on Android 16+. We enumerate the
   *  Builder's setters that look like a critical-text/short-text API
   *  and call the first one that matches. As a last resort we write
   *  the dumpsys-observed extras keys directly. */
  private fun tryAttachShortCriticalText(
    builder: Notification.Builder,
    text: String,
  ) {
    if (text.isEmpty()) return
    val cls = Notification.Builder::class.java
    val candidateNames = setOf(
      "setShortCriticalText",
      "setShortText",
      "setStatusBarShortText",
      "setOngoingActivityShortText",
    )
    // Enumerate every public method, find one with a single CharSequence
    // arg whose name matches.
    for (m in cls.methods) {
      if (m.name !in candidateNames) continue
      val pts = m.parameterTypes
      if (pts.size != 1) continue
      if (!pts[0].isAssignableFrom(CharSequence::class.java) &&
          pts[0] != CharSequence::class.java &&
          pts[0] != String::class.java) continue
      val ok = runCatching { m.invoke(builder, text as CharSequence) }.isSuccess
      if (ok) {
        Log.i(NAME, "ShortCriticalText attached via ${m.name}: $text")
        // Also write the extras key so older Pixel builds that don't
        // mirror the setter still pick it up.
        builder.extras.putCharSequence("android.shortCriticalText", text)
        return
      }
    }
    // Log all setters so we can find the actual API name next iteration.
    val setters = cls.methods
      .filter { it.name.startsWith("set") && it.parameterTypes.size == 1 }
      .map { it.name }
      .sorted()
    Log.w(NAME, "No setShortCriticalText found. Available 1-arg setters: $setters")
    builder.extras.putCharSequence("android.shortCriticalText", text)
    Log.i(NAME, "ShortCriticalText set via extras fallback: $text")
  }

  // ── Pre-Android 16 path ───────────────────────────────────────────

  private fun buildLegacy(
    nextLabel: String,
    nextTime: String,
    nextEpochMs: Long,
    nextKey: String,
    accentInt: Int,
    progressPct: Int,
    compactMode: Boolean,
    rows: List<Row>,
    title: String,
    body: String,
    contentIntent: PendingIntent,
  ): Notification {
    val inboxStyle = NotificationCompat.InboxStyle()
      .setBigContentTitle(title)
    if (!compactMode) {
      for (row in rows) {
        val marker = if (row.key == nextKey) "›" else " "
        inboxStyle.addLine("$marker  ${row.name}  ${row.time}")
      }
    }

    val builder = NotificationCompat.Builder(reactContext, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_prayer)
      .setColor(accentInt)
      .setColorized(false)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setLocalOnly(true)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(contentIntent)
      .setStyle(inboxStyle)
      .setWhen(nextEpochMs)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setProgress(100, progressPct, false)

    return builder.build()
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /** Short human duration for the status-bar chip — at most 12 chars
   *  ("3h 21m" / "47m" / "Now"). */
  private fun formatRemainingShort(ms: Long): String {
    if (ms <= 0L) return "Now"
    val totalMin = (ms / 60_000L).toInt()
    if (totalMin < 1) return "<1m"
    val h = totalMin / 60
    val m = totalMin % 60
    return if (h <= 0) "${m}m" else "${h}h ${m}m"
  }

  private fun parseColor(hex: String, fallback: Int): Int =
    try { Color.parseColor(if (hex.startsWith("#")) hex else "#$hex") }
    catch (_: Throwable) { fallback }

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

  /** Insert Sunrise at slot 1 (between Fajr and Dhuhr). Sunrise is
   *  always shown now — no toggle. */
  private fun computeDisplayRows(base: List<Row>, sunrise: Row?): List<Row> {
    if (sunrise == null) return base
    val out = base.toMutableList()
    if (out.isEmpty()) out.add(sunrise)
    else out.add(1, sunrise)
    return out
  }

  /** Try every plausible "promote to chip" setter the API surface may
   *  expose. Calls the first one that accepts a single boolean. */
  private fun tryRequestPromotedOngoing(builder: Notification.Builder) {
    val candidates = setOf(
      "setRequestPromotedOngoing",
      "setOngoingPromoted",
      "requestPromotedOngoing",
      "setPromotedOngoing",
    )
    for (m in Notification.Builder::class.java.methods) {
      if (m.name !in candidates) continue
      val pts = m.parameterTypes
      if (pts.size != 1) continue
      if (pts[0] != Boolean::class.javaPrimitiveType &&
          pts[0] != java.lang.Boolean::class.java) continue
      val ok = runCatching { m.invoke(builder, true) }.isSuccess
      if (ok) {
        Log.i(NAME, "Requested promoted ongoing via ${m.name}")
        return
      }
    }
    Log.w(NAME, "No promoted-ongoing API found on this build")
  }

  companion object {
    const val NAME = "MihrabLiveActivity"
    const val CHANNEL_ID = "mihrab_live_activity_v1"
    const val NOTIF_ID = 0xA1B2
    @Volatile private var loggedBuilderMethods = false
  }
}
