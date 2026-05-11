package com.prayer_times

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

/**
 * Mihrab Live Activity — JS bridge for the Android Live Activity.
 *
 * Architecture (v2.3.0+, single-notification):
 *
 *   JS toggles ON  →  MihrabLiveActivityModule.display(payload)
 *                  →  ContextCompat.startForegroundService(payload)
 *                  →  MihrabLiveActivityService takes over:
 *                       startForeground(NOTIF_ID, buildNotificationFromPayload())
 *                       — the rich notification IS the FGS notification.
 *                         One notification keeps the process alive AND
 *                         shows the prayer countdown. No hidden placeholder.
 *
 *   JS toggles OFF →  MihrabLiveActivityModule.cancel()
 *                  →  context.stopService(...)
 *                  →  service.onDestroy() cancels the ticker and the notification.
 *
 * Note: the single-notification approach means FLAG_FOREGROUND_SERVICE is
 *   added to NOTIF_ID by NMS, which prevents FLAG_PROMOTED_ONGOING and
 *   therefore the Android 16 status-bar chip. The cleaner single-notification
 *   UX (no "silent" placeholder visible in settings) is the correct trade-off.
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
      ensureFgsChannelExists(reactContext)
      // Persist before starting the service so the restart receiver can
      // revive the Live Activity after an app update or device reboot.
      savePayload(reactContext, payloadJson)
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
      // Clear persisted payload so the restart receiver doesn't revive
      // the Live Activity after an update / reboot when the user has
      // explicitly turned it off.
      clearPayload(reactContext)
      val intent = Intent(reactContext, MihrabLiveActivityService::class.java)
      reactContext.stopService(intent)
      // Also cancel both notifications in case the service was never
      // started (background FGS-start was blocked and we fell back to
      // notify()) or the service already exited.
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

    // SharedPreferences key/name used to persist the last payload across
    // process death (app update, device boot). The restart receiver reads
    // these to revive the Live Activity without requiring the app to open.
    const val PREFS_NAME = "mihrab_live_activity"
    const val PREF_KEY_PAYLOAD = "last_payload"
    const val PREF_KEY_ENABLED = "enabled"

    fun savePayload(context: android.content.Context, payloadJson: String) {
      context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        .edit()
        .putString(PREF_KEY_PAYLOAD, payloadJson)
        .putBoolean(PREF_KEY_ENABLED, true)
        .apply()
    }

    fun clearPayload(context: android.content.Context) {
      context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        .edit()
        .remove(PREF_KEY_PAYLOAD)
        .putBoolean(PREF_KEY_ENABLED, false)
        .apply()
    }

    fun loadPayload(context: android.content.Context): String? {
      val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
      if (!prefs.getBoolean(PREF_KEY_ENABLED, false)) return null
      return prefs.getString(PREF_KEY_PAYLOAD, null)
    }
    // v3 — bumped in beta.9 to IMPORTANCE_HIGH (sound + vibration off
    // explicitly) so the Android 16 status-bar chip can promote us.
    // Channel importance must match what JS creates in liveActivity.ts.
    const val CHANNEL_ID = "mihrab_live_activity_v3"
    const val NOTIF_ID = 0xA1B2

    // Foreground-service placeholder notification (beta.10+ dual-notification
    // architecture). This notification is posted via startForeground() to
    // keep the process alive; it uses a separate low-importance channel so
    // it stays silent and out of the way. The rich chip notification
    // (NOTIF_ID) is posted via regular notify() on this same channel.
    const val FGS_NOTIF_ID = 0xA1B3
    // v2 — IMPORTANCE_NONE so the placeholder never appears in the shade.
    const val FGS_CHANNEL_ID = "mihrab_fgs_v2"

    /** Ensure the channel exists with the right importance before any
     *  startForeground call. */
    @JvmStatic
    fun ensureChannelExists(ctx: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = ctx.getSystemService(android.app.NotificationManager::class.java)
        ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val ch = android.app.NotificationChannel(
        CHANNEL_ID,
        ctx.getString(R.string.live_activity_channel_name),
        android.app.NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = ctx.getString(R.string.live_activity_channel_desc)
        setSound(null, null) // silent — passive countdown only
        enableVibration(false)
        setShowBadge(false)
        // No heads-up popup — silently slots into the shade.
        // setBypassDnd intentionally NOT called so the chip respects DnD.
      }
      nm.createNotificationChannel(ch)
    }

    /** Ensure the hidden FGS placeholder channel exists.
     *  IMPORTANCE_NONE suppresses the placeholder completely from the
     *  notification shade. The rich chip notification on CHANNEL_ID
     *  (IMPORTANCE_HIGH) is the only user-visible notification. */
    @JvmStatic
    fun ensureFgsChannelExists(ctx: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = ctx.getSystemService(android.app.NotificationManager::class.java)
        ?: return
      if (nm.getNotificationChannel(FGS_CHANNEL_ID) != null) return
      val ch = android.app.NotificationChannel(
        FGS_CHANNEL_ID,
        ctx.getString(R.string.live_activity_fgs_channel_name),
        android.app.NotificationManager.IMPORTANCE_NONE,
      ).apply {
        description = ctx.getString(R.string.live_activity_fgs_channel_desc)
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
      nm.createNotificationChannel(ch)
    }

    /** Build the minimal FGS placeholder notification. Posted via
     *  startForeground() to satisfy Android's FGS requirement and keep
     *  the process alive. The IMPORTANCE_NONE channel suppresses it from
     *  the notification shade on Android 8+.
     *  @param fgsText Localised "Prayer countdown active" string passed
     *    from JS so it respects the app's language setting. Falls back to
     *    the Android string resource (device locale) if absent. */
    @JvmStatic
    fun buildFgsNotification(ctx: Context, fgsText: String? = null): Notification {
      val tap = Intent(ctx, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val pi = PendingIntent.getActivity(
        ctx, 1, tap,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      val text = if (!fgsText.isNullOrEmpty()) fgsText
                 else ctx.getString(R.string.live_activity_countdown_active)
      return NotificationCompat.Builder(ctx, FGS_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_prayer)
        .setContentTitle(ctx.getString(R.string.app_name))
        .setContentText(text)
        .setContentIntent(pi)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setVisibility(NotificationCompat.VISIBILITY_SECRET)
        .build()
    }

    /**
     * Render a single-line text progress bar with the percentage on the
     * same line: "████████████░░░░░░░░  52%"
     *
     * Uses Unicode FULL BLOCK (U+2588) for filled and LIGHT SHADE (U+2591)
     * for empty. 20 cells wide — readable at notification text size on any
     * screen density. Works on every Android shell including GrapheneOS
     * because it is plain text in setContentText, not a RemoteView.
     */
    /**
     * Format a millisecond delta as "1h 23m" or "45m".
     * Used in the notification subText alongside the percentage so the
     * countdown and percentage are in the same right-anchored row.
     */
    private fun formatRemaining(deltaMs: Long): String {
      val totalSec = (deltaMs / 1000).coerceAtLeast(0)
      val h = totalSec / 3600
      val m = (totalSec % 3600) / 60
      return if (h > 0) "${h}h ${m}m" else "${m}m"
    }

    /** Top-level entry point — used by both the JS bridge (as a
     *  fallback when foreground-service start is denied) and by the
     *  MihrabLiveActivityService on its periodic ticker.
     *  Returns a Pair of (richNotification, fgsText) so callers can
     *  rebuild the FGS placeholder with the same localized string. */
    @JvmStatic
    fun buildNotificationFromPayload(ctx: Context, p: JSONObject): Notification {
      val nextLabel = p.optString("nextLabel", "")
      val nextEpochMs = p.optLong("nextEpochMs", 0L)
      val prevEpochMs = p.optLong("prevEpochMs", 0L)
      val accentInt = parseColor(
        p.optString("accentHex", "#22C55E"),
        Color.parseColor("#22C55E"),
      )
      val progressPct = computeProgressPercent(prevEpochMs, nextEpochMs)
      // JS sends title as the combined "Asr · 17:08" string; falls back to
      // just the label if the title field is absent.
      val title = p.optString("title", nextLabel)

      val tap = Intent(ctx, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val pi = PendingIntent.getActivity(
        ctx, 0, tap,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

      return if (Build.VERSION.SDK_INT >= 36) {
        // Android 16+ path: standard template only — no custom RemoteViews.
        // setCustomContentView changes the notification template type and
        // breaks FLAG_PROMOTED_ONGOING (the status-bar chip). The chip is
        // the primary feature on Android 16 so we protect it here; the
        // same-line layout is available on pre-36 via the legacy path.
        buildAndroid16(ctx, nextEpochMs, accentInt, progressPct, title, pi)
      } else {
        // Pre-36 path: use the custom RemoteViews layout (prayer title left,
        // countdown|pct right on the same line). No chip on these versions.
        val contentView = buildContentView(ctx, title, nextEpochMs, progressPct)
        buildLegacy(ctx, nextEpochMs, accentInt, progressPct, title, pi, contentView)
      }
    }

    /** Extract the localised FGS placeholder text from a payload JSON.
     *  Called by MihrabLiveActivityService so the FGS notification text
     *  matches the app's selected language (set by JS via i18n). */
    @JvmStatic
    fun fgsTextFromPayload(p: JSONObject): String? =
      p.optString("fgsText", "").takeIf { it.isNotEmpty() }

    // ── Custom RemoteViews content layout ───────────────────────────

    /**
     * Build the custom notification content view:
     *
     *   [Asr · 17:08          ↓ 1h 23m  |  52%]
     *   [████████████░░░░░░░░░░░░░░░░░░░░░░░░░]
     *
     * Prayer title is left-weighted (layout_weight=1); countdown+percentage
     * is right-pinned. Used with DecoratedCustomViewStyle so the standard
     * header chrome (app icon, app name) is still rendered by the system.
     *
     * Returns null on any error so callers fall back to the standard template.
     * On hardened shells that strip custom RemoteViews (GrapheneOS, some MIUI
     * builds), the standard setContentTitle/setContentText fields are shown.
     */
    private fun buildContentView(
      ctx: Context,
      title: String,
      nextEpochMs: Long,
      progressPct: Int,
    ): RemoteViews? = try {
      val rv = RemoteViews(ctx.packageName, R.layout.notification_live_activity)
      rv.setTextViewText(R.id.la_prayer_title, title)
      rv.setTextViewText(
        R.id.la_countdown_pct,
        "↓ ${formatRemaining(nextEpochMs - System.currentTimeMillis())}  |  $progressPct%",
      )
      rv.setProgressBar(R.id.la_progress, 100, progressPct, false)
      rv
    } catch (t: Throwable) {
      Log.w(NAME, "buildContentView failed, using standard template", t)
      null
    }

    // ── Android 16+ path ────────────────────────────────────────────

    @SuppressLint("NewApi")
    private fun buildAndroid16(
      ctx: Context,
      nextEpochMs: Long,
      accentInt: Int,
      progressPct: Int,
      title: String,
      contentIntent: PendingIntent,
    ): Notification {
      try {
        val shortText = formatRemainingShort(nextEpochMs - System.currentTimeMillis())
        val countdown = "↓ ${formatRemaining(nextEpochMs - System.currentTimeMillis())}  |  $progressPct%"

        // Standard template only — no setCustomContentView.
        // Custom views change the notification template type and break
        // FLAG_PROMOTED_ONGOING (the status-bar chip). The chip is the
        // primary Android 16 feature so we use the standard template here;
        // the same-line RemoteViews layout is reserved for pre-36 (buildLegacy).
        val builder = Notification.Builder(ctx, CHANNEL_ID)
          .setSmallIcon(R.drawable.ic_stat_prayer)
          .setColor(accentInt)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setLocalOnly(false)
          .setCategory(Notification.CATEGORY_NAVIGATION)
          .setVisibility(Notification.VISIBILITY_PUBLIC)
          .setContentTitle(title)     // "Asr · 17:08"
          .setContentText(countdown)  // "↓ 1h 23m  |  52%"
          .setShowWhen(false)
          .setContentIntent(contentIntent)
          .setProgress(100, progressPct, false)

        tryAttachShortCriticalText(builder, shortText)
        tryRequestPromotedOngoing(builder)

        return builder.build()
      } catch (t: Throwable) {
        Log.w(NAME, "Android 16 path failed, falling back to legacy", t)
        return buildLegacy(ctx, nextEpochMs, accentInt, progressPct, title, contentIntent, null)
      }
    }

    // ── Pre-Android 16 path ─────────────────────────────────────────

    private fun buildLegacy(
      ctx: Context,
      nextEpochMs: Long,
      accentInt: Int,
      progressPct: Int,
      title: String,
      contentIntent: PendingIntent,
      contentView: RemoteViews?,
    ): Notification {
      val countdown = "↓ ${formatRemaining(nextEpochMs - System.currentTimeMillis())}  |  $progressPct%"
      val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_prayer)
        .setColor(accentInt)
        .setColorized(false)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setLocalOnly(false)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        // Standard fields — accessibility text + fallback for hardened shells.
        .setContentTitle(title)
        .setContentText(countdown)
        .setContentIntent(contentIntent)
        .setShowWhen(false)

      if (contentView != null) {
        // Custom layout handles the progress bar — don't call setProgress()
        // or a second bar appears below the custom content view.
        builder.setCustomContentView(contentView)
        builder.setStyle(NotificationCompat.DecoratedCustomViewStyle())
      } else {
        builder.setProgress(100, progressPct, false)
      }

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
  }
}
