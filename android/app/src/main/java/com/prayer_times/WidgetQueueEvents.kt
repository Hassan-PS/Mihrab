package com.prayer_times

import android.content.Context
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Tell the JS side that a widget queue changed, so the drain has a trigger
 * that a widget tap actually produces.
 *
 * WHY. The queue drains on app mount and on `AppState` going `active`, and
 * a widget tap is neither: the tap is a PendingIntent to a receiver, and a
 * receiver firing does not change anything about the app's lifecycle. The
 * queue then waits for the next foreground transition, and entries older
 * than a fortnight are discarded on the reasoning that an undrained queue
 * means an unopened app.
 *
 * On macOS that reasoning is simply false and it cost a user their taps —
 * Notification Center opens over an app that stays active, so the drain can
 * go a whole session without firing (2026-08-29, fixed there with a Darwin
 * notification). Android is protected by circumstance rather than by
 * design: you are usually on the home screen when you tap a widget, so the
 * app is not resumed and returning to it fires `active`. Split-screen, a
 * tablet, or any launcher shown beside a running app breaks that, and the
 * hole is the same one.
 *
 * SAME PROCESS, so no IPC. The receiver already runs in the app's process,
 * which is the whole reason this file is six lines of work rather than the
 * Darwin-notification round trip the extension needs on iOS.
 *
 * EVERY FAILURE IS SILENT AND EXPECTED. There is usually no React context
 * at all: the widget works with the app closed, which is the point of it,
 * and a tap then simply queues for the next launch — the behaviour that was
 * always correct. This only closes the case where the runtime IS alive and
 * nothing was telling it.
 */
object WidgetQueueEvents {
  const val EVENT = "MihrabWidgetQueueChanged"

  fun postChanged(context: Context) {
    val app = context.applicationContext as? ReactApplication ?: return
    // `reactHost` is itself nullable on this React Native version — a widget
    // tap can arrive before the host exists at all, which is the ordinary
    // case for a cold process woken only by the broadcast.
    val reactContext = app.reactHost?.currentReactContext ?: return
    if (!reactContext.hasActiveReactInstance()) return
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT, null)
    } catch (_: Throwable) {
      // The instance can be torn down between the check above and this call,
      // and a widget tap is not a place to crash the app over a redraw hint.
    }
  }
}
