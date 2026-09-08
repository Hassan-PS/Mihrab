package com.prayer_times

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Where the camera is.
 *
 * The safe-area insets say how TALL the cutout band is and nothing about
 * where in it the camera sits. The fullscreen muṣḥaf draws its surah name
 * across that band, beside the camera — which is right for a centred
 * punch-hole and wrong for the phones that put it in a corner: the name
 * went straight under the lens. Reported by Hassan against a Pixel with
 * the camera at the left.
 *
 * So this answers the one question the insets cannot: the bounding
 * rectangles of the cutout, in dp, relative to the window — the
 * decor view's `rootWindowInsets.displayCutout`, which is what the
 * platform itself lays views out around. Empty on a phone with no cutout
 * and below API 28, where there is no API for it.
 */
class DisplayCutoutModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun getCutout(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(empty())
      return
    }
    UiThreadUtil.runOnUiThread {
      try {
        val result = Arguments.createMap()
        val rects = Arguments.createArray()
        val density = activity.resources.displayMetrics.density
        val cutout =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            activity.window.decorView.rootWindowInsets?.displayCutout
          } else {
            null
          }
        if (cutout != null) {
          for (r in cutout.boundingRects) {
            val m = Arguments.createMap()
            m.putDouble("x", r.left / density.toDouble())
            m.putDouble("y", r.top / density.toDouble())
            m.putDouble("width", r.width() / density.toDouble())
            m.putDouble("height", r.height() / density.toDouble())
            rects.pushMap(m)
          }
          result.putDouble("top", cutout.safeInsetTop / density.toDouble())
          result.putDouble("left", cutout.safeInsetLeft / density.toDouble())
          result.putDouble("right", cutout.safeInsetRight / density.toDouble())
          result.putDouble("bottom", cutout.safeInsetBottom / density.toDouble())
        } else {
          result.putDouble("top", 0.0)
          result.putDouble("left", 0.0)
          result.putDouble("right", 0.0)
          result.putDouble("bottom", 0.0)
        }
        result.putArray("rects", rects)
        // The window's width in dp, so a caller can place the rects on it
        // without a second measurement that may be from another frame.
        result.putDouble(
          "windowWidth",
          activity.window.decorView.width / density.toDouble(),
        )
        promise.resolve(result)
      } catch (e: Exception) {
        promise.resolve(empty())
      }
    }
  }

  private fun empty() =
    Arguments.createMap().apply {
      putDouble("top", 0.0)
      putDouble("left", 0.0)
      putDouble("right", 0.0)
      putDouble("bottom", 0.0)
      putArray("rects", Arguments.createArray())
      putDouble("windowWidth", 0.0)
    }

  companion object {
    const val NAME = "DisplayCutout"
  }
}
