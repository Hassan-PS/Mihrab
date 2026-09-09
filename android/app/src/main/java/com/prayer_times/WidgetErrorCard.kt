package com.prayer_times

import android.content.Context
import android.graphics.Color
import android.util.Log
import android.view.View
import android.widget.RemoteViews

/**
 * A THROW IN A WIDGET RENDER BECOMES A MIHRAB CARD, NEVER THE LAUNCHER'S.
 *
 * When a provider's `onUpdate` throws, the launcher shows its own generic
 * "Can't load widget" — no class name, no log line from us, and (as #31
 * proved) no way to learn from a phone nobody here owns what went wrong.
 * The Next-prayer and Sky cards already catch their own render and put the
 * exception's class name on the card; this is the same guard for every
 * other provider, so the whole family degrades the same way.
 *
 * `render` is the provider's real drawing. If it throws, the card is a
 * plain Mihrab card — the user's background, the standard inset — with the
 * placeholder line reading "Couldn't load widget (SomeException)" in the
 * error red. The class name is enough to diagnose from a screenshot; the
 * message stays out of the card (it can carry payload content, and a
 * widget on a lock screen is not the place for it) and goes to the log.
 *
 * Only exceptions are caught. An Error (OutOfMemory, a stack overflow) is
 * not a rendering fault and should surface as one.
 */
object WidgetErrorCard {
  private const val ERROR_RED = "#F87171"

  fun guard(base: Context, layoutId: Int, what: String, render: () -> RemoteViews): RemoteViews =
    try {
      render()
    } catch (e: Exception) {
      Log.e(PrayerWidgetProvider.WIDGET_LOG_TAG, "$what widget render failed", e)
      errorCard(base, layoutId, e)
    }

  /**
   * The card shown when [render] failed. Built from as little as possible —
   * a localized context, the layout, the user's card colour — and each of
   * those steps is itself allowed to fail without taking the card with it,
   * because this runs precisely when something in the app's state is off.
   */
  fun errorCard(base: Context, layoutId: Int, e: Exception): RemoteViews {
    val context = try { PrayerWidgetProvider.localized(base) } catch (_: Exception) { base }
    val views = RemoteViews(context.packageName, layoutId)
    try {
      WidgetCard.paint(views, PrayerWidgetProvider.resolvedColors(context).first)
    } catch (_: Exception) {
      // The default card drawable stays; the message is what matters here.
    }
    val label = try { context.getString(R.string.widget_error) } catch (_: Exception) { "Couldn't load widget" }
    views.setViewVisibility(R.id.widget_content, View.GONE)
    views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
    views.setTextViewText(R.id.widget_placeholder, "$label (${e.javaClass.simpleName})")
    views.setTextColor(R.id.widget_placeholder, Color.parseColor(ERROR_RED))
    return views
  }
}
