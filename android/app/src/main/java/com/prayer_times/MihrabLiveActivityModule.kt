package com.prayer_times

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mihrab Live Activity — JS bridge for the Android Live Activity.
 *
 * Architecture (v2.1.0-beta.8+):
 *
 *   JS toggles ON  →  MihrabLiveActivityModule.display(payload)
 *                  →  ContextCompat.startForegroundService(payload)
 *                  →  MihrabLiveActivityService takes over: it owns
 *                     the notification AND a per-minute ticker that
 *                     re-posts with a freshly-computed progress value.
 *
 *   JS toggles OFF →  MihrabLiveActivityModule.cancel()
 *                  →  context.stopService(...)
 *                  →  service.onDestroy() cancels its ticker and the
 *                     notification.
 *
 * The notification builder lives in the companion object so the
 * service can build the notification on its own ticker, without going
 * back through the React module instance.
 *
 * Why foreground service: a plain `notify()` notification (a) lands in
 * the "Silent" section on most ROMs, (b) never auto-updates so the
 * progress bar stays frozen until JS reposts, and (c) is not eligible
 * for Android 16's status-bar Live Update chip. Foreground service
 * notifications fix all three.
 */
class MihrabLiveActivityModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  // ── Public API ────────────────────────────────────────────────────

  @ReactMethod
  fun display(payloadJson: String, promise: Promise) {
    try {
      val p = JSONObject(payloadJson)
      Log.i(
        NAME,
        "display: nextLabel=${p.optString("nextLabel")} epochMs=${p.optLong("nextEpochMs")} prevEpochMs=${p.optLong("prevEpochMs")}"
      )
      // Make sure the channel exists before the FGS posts. JS also
      // creates it via notifee on app boot, but on first install the
      // FGS may try to post before notifee has run.
      ensureChannelExists(reactContext)
      val intent = Intent(reactContext, MihrabLiveActivityService::class.java).apply {
        putExtra(MihrabLiveActivityService.EXTRA_PAYLOAD, payloadJson)
      }
      try {
        ContextCompat.startForegroundService(reactContext, intent)
        Log.i(NAME, "display: foreground service started")
        promise.resolve(null)
      } catch (se: SecurityException) {
        Log.w(NAME, "display: foreground service start denied", se)
        promise.reject("PERM_DENIED", "Foreground service start denied", se)
      } catch (ise: IllegalStateException) {
        // Android 12+ throws when starting a foreground service from
        // the background outside an allowlisted path. Fall back to a
        // plain notify() so the user still sees something — progress
        // bar won't tick in this fallback path, but at least the
        // notification appears.
        Log.w(NAME, "display: FGS blocked from background; falling back to notify()", ise)
        runCatching {
          val notif = buildNotificationFromPayload(reactContext, p)
          NotificationManagerCompat.from(reactContext).notify(NOTIF_ID, notif)
        }
        promise.resolve(null)
      }
    } catch (e: Throwable) {
      Log.e(NAME, "display: failed", e)
      promise.reject("DISPLAY_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    try {
      val intent = Intent(reactContext, MihrabLiveActivityService::class.java)
      reactContext.stopService(intent)
      // Also cancel in case the service was never started (background
      // FGS-start was blocked and we fell back to notify()).
      runCatching {
        NotificationManagerCompat.from(reactContext).cancel(NOTIF_ID)
      }
      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject("CANCEL_FAILED", e.message, e)
    }
  }

  // ── Companion: notification building (static so the service can
  //    rebuild on each tick without going through the JS bridge) ────

  companion object {
    const val NAME = "MihrabLiveActivity"
    // v2 — bumped in beta.8 to IMPORTANCE_DEFAULT (sound/vibration off
    // explicitly) so the notification renders in the main shade section
    // instead of "Silent". Must match the id JS creates in liveActivity.ts.
    const val CHANNEL_ID = "mihrab_live_activity_v2"
    const val NOTIF_ID = 0xA1B2

    /** Ensure the channel exists with the right importance before any
     *  startForeground call. The JS side also creates it via notifee on
     *  app boot, but the FGS may post before that — we need this as a
     *  safety net to avoid CannotPostForegroundServiceNotificationException. */
    @JvmStatic
    fun ensureChannelExists(ctx: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = ctx.getSystemService(android.app.NotificationManager::class.java)
        ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val ch = android.app.NotificationChannel(
        CHANNEL_ID,
        "Prayer countdown",
        android.app.NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Pinned countdown to the next prayer."
        setSound(null, null) // silent — passive countdown only
        enableVibration(false)
        setShowBadge(false)
      }
      nm.createNotificationChannel(ch)
    }

    @Volatile private var loggedBuilderMethods = false

    /** Top-level entry point — used by both the JS bridge (as a
     *  fallback when foreground-service start is denied) and by the
     *  MihrabLiveActivityService on its periodic ticker. */
    @JvmStatic
    fun buildNotificationFromPayload(ctx: Context, p: JSONObject): Notification {
      val nextLabel = p.optString("nextLabel", "")
      val nextTime = p.optString("nextTime", "")
      val nextEpochMs = p.optLong("nextEpochMs", 0L)
      val prevEpochMs = p.optLong("prevEpochMs", 0L)
      val nextKey = p.optString("nextKey", "")
      val accentInt = parseColor(
        p.optString("accentHex", "#22C55E"),
        Color.parseColor("#22C55E"),
      )
      val progressPct = computeProgressPercent(prevEpochMs, nextEpochMs)
      val compactMode = p.optBoolean("compactMode", false)
      val title = p.optString("title", nextLabel)
      val body = p.optString("body", nextTime)
      val rows = jsonRowsToList(p.optJSONArray("rows"))
      val sunriseRow = p.optJSONObject("sunriseRow")?.let { rowFromJson(it) }
      val displayRows = computeDisplayRows(rows, sunriseRow)

      val tap = Intent(ctx, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val pi = PendingIntent.getActivity(
        ctx, 0, tap,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

      return if (Build.VERSION.SDK_INT >= 36) {
        buildAndroid16(
          ctx, nextEpochMs, nextKey, accentInt,
          progressPct, compactMode, displayRows, title, body, pi,
        )
      } else {
        buildLegacy(
          ctx, nextEpochMs, nextKey, accentInt,
          progressPct, compactMode, displayRows, title, body, pi,
        )
      }
    }

    // ── Android 16+ path ────────────────────────────────────────────

    @SuppressLint("NewApi")
    private fun buildAndroid16(
      ctx: Context,
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
        val shortText = formatRemainingShort(nextEpochMs - System.currentTimeMillis())

        val inbox = Notification.InboxStyle().setBigContentTitle(title)
        if (!compactMode) {
          val maxNameLen = rows.maxOfOrNull { it.name.length } ?: 0
          for (row in rows) {
            val isNext = row.key == nextKey
            val marker = if (isNext) "›" else " "
            val padded = row.name.padEnd(maxNameLen, ' ')
            inbox.addLine("$marker  $padded   ${row.time}")
          }
        }

        val builder = Notification.Builder(ctx, CHANNEL_ID)
          .setSmallIcon(R.drawable.ic_stat_prayer)
          .setColor(accentInt)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setLocalOnly(false)
          .setCategory(Notification.CATEGORY_PROGRESS)
          .setVisibility(Notification.VISIBILITY_PUBLIC)
          .setContentTitle(title)
          .setContentText(body)
          .setContentIntent(contentIntent)
          .setWhen(nextEpochMs)
          .setShowWhen(true)
          .setUsesChronometer(true)
          .setChronometerCountDown(true)
          .setProgress(100, progressPct, false)
          .setStyle(inbox)
          .addAction(
            Notification.Action.Builder(
              android.graphics.drawable.Icon.createWithResource(
                ctx, R.drawable.ic_stat_prayer
              ),
              "Open",
              contentIntent,
            ).build(),
          )

        tryAttachShortCriticalText(builder, shortText)
        tryRequestPromotedOngoing(builder)

        if (!loggedBuilderMethods) {
          loggedBuilderMethods = true
          val all = Notification.Builder::class.java.methods
            .map { "${it.name}(${it.parameterTypes.joinToString { p -> p.simpleName }})" }
            .sorted()
          Log.i(NAME, "Notification.Builder methods (${all.size}): ${all.joinToString("; ")}")
        }

        return builder.build()
      } catch (t: Throwable) {
        Log.w(NAME, "Android 16 path failed, falling back to legacy", t)
        return buildLegacy(
          ctx, nextEpochMs, nextKey, accentInt,
          progressPct, compactMode, rows, title, body, contentIntent,
        )
      }
    }

    // ── Pre-Android 16 path ─────────────────────────────────────────

    private fun buildLegacy(
      ctx: Context,
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
      val inboxStyle = NotificationCompat.InboxStyle().setBigContentTitle(title)
      if (!compactMode) {
        for (row in rows) {
          val marker = if (row.key == nextKey) "›" else " "
          inboxStyle.addLine("$marker  ${row.name}  ${row.time}")
        }
      }
      val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_prayer)
        .setColor(accentInt)
        .setColorized(false)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        // localOnly is false on the FGS path so the notification can
        // be promoted (some shells block localOnly notifications from
        // appearing in the main "Notifications" section).
        .setLocalOnly(false)
        // CATEGORY_PROGRESS so the system understands this is an
        // ongoing journey/timed activity rather than a quiet status.
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        // PRIORITY_DEFAULT (not LOW) so the notification renders in the
        // main "Notifications" section, not "Silent".
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setContentTitle(title)
        .setContentText(body)
        .setContentIntent(contentIntent)
        .setStyle(inboxStyle)
        .setWhen(nextEpochMs)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setProgress(100, progressPct, false)
        .addAction(
          NotificationCompat.Action.Builder(
            R.drawable.ic_stat_prayer,
            "Open",
            contentIntent,
          ).build(),
        )
      return builder.build()
    }

    // ── Reflection helpers for Android 16 chip APIs ─────────────────

    /** Set the short critical text on the notification — drives the
     *  status-bar Live Update chip on Android 16+. Probed via runtime
     *  method enumeration; takes String on AOSP, may differ on OEMs. */
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
          builder.extras.putCharSequence("android.shortCriticalText", text)
          return
        }
      }
      builder.extras.putCharSequence("android.shortCriticalText", text)
      Log.i(NAME, "ShortCriticalText set via extras fallback: $text")
    }

    /** Ask the system to promote this notification to the status-bar
     *  chip. Available since Android 16. */
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

    // ── Small helpers ───────────────────────────────────────────────

    /** Current progress between `prev` and `next` epochs as a 0..100
     *  integer. The bar advances every time we call this — the service
     *  re-calls it every minute so the bar actually animates. */
    private fun computeProgressPercent(prevEpochMs: Long, nextEpochMs: Long): Int {
      if (nextEpochMs <= 0L || prevEpochMs <= 0L) return 0
      val span = nextEpochMs - prevEpochMs
      if (span <= 0L) return 0
      val done = System.currentTimeMillis() - prevEpochMs
      val pct = ((done.toDouble() / span.toDouble()) * 100.0)
      return pct.coerceIn(0.0, 100.0).toInt()
    }

    /** Short human duration for the status-bar chip — at most ~7 chars. */
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

    data class Row(val key: String, val name: String, val time: String)

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

    /** Splice sunrise at slot 1 (between Fajr and Dhuhr). Sunrise is
     *  always shown — no toggle. */
    private fun computeDisplayRows(base: List<Row>, sunrise: Row?): List<Row> {
      if (sunrise == null) return base
      val out = base.toMutableList()
      if (out.isEmpty()) out.add(sunrise) else out.add(1, sunrise)
      return out
    }
  }
}
