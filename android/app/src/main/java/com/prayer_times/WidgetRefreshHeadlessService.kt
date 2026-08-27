package com.prayer_times

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS "WidgetRefresh" task when the refresh glyph on a home-screen
 * widget is tapped: one sync round, then a rebuild of the widget payload.
 *
 * The provider redraws the card from the stored payload immediately, so the
 * tap feels instant; this is the part that goes and finds out whether there
 * is anything new to draw. It is also the only way to sync without opening
 * the app, and a widget is exactly what people look at instead of opening
 * the app.
 *
 * The task name MUST match AppRegistry.registerHeadlessTask('WidgetRefresh')
 * in index.js.
 *
 * 60 s rather than the 30 s the adhan toggle uses: a round reads every peer's
 * file through the Storage Access Framework, and a remote provider —
 * Nextcloud, Drive — answers over the network at its own pace.
 *
 * `allowedInForeground = true` because the widget is on the home screen, and
 * the home screen is somewhere people go with the app still alive behind it.
 */
class WidgetRefreshHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      "WidgetRefresh",
      Arguments.fromBundle(extras),
      60_000, // timeout (ms)
      true,   // allowedInForeground
    )
  }
}
