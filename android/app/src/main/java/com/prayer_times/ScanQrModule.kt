package com.prayer_times

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Opens the scanner and hands back what it read.
 *
 * The labels are passed in rather than lived in strings.xml, because the
 * app ships in thirteen languages and the one place that knows which is
 * running is the JS side.
 *
 * Every outcome is named. "Nothing was scanned" covers three different
 * situations — the user backed out, they refused the camera, or the device
 * has none — and each needs something different said to them.
 */
class ScanQrModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pending: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  /** Whether there is a camera to point at anything. */
  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(
      reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY),
    )
  }

  /**
   * Resolves `{text}` on a scan, `{cancelled: true}` when the user backs
   * out, and rejects only when the camera itself is unavailable or refused.
   */
  @ReactMethod
  fun scan(hint: String, cancel: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "there is no activity to show the scanner over")
      return
    }
    if (pending != null) {
      promise.reject("busy", "the scanner is already open")
      return
    }
    pending = promise
    val intent = Intent(activity, ScanQrActivity::class.java).apply {
      putExtra(ScanQrActivity.EXTRA_HINT, hint)
      putExtra(ScanQrActivity.EXTRA_CANCEL, cancel)
    }
    try {
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (t: Throwable) {
      pending = null
      promise.reject("unavailable", "could not open the scanner", t)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_CODE) return
    val promise = pending ?: return
    pending = null

    when (resultCode) {
      Activity.RESULT_OK -> {
        val text = data?.getStringExtra(ScanQrActivity.EXTRA_RESULT)
        if (text.isNullOrEmpty()) {
          promise.resolve(cancelled())
        } else {
          val out = Arguments.createMap()
          out.putString("text", text)
          promise.resolve(out)
        }
      }
      ScanQrActivity.RESULT_NO_CAMERA ->
        promise.reject("no_camera", "this device has no usable camera")
      Activity.RESULT_FIRST_USER ->
        promise.reject("denied", "the camera permission was refused")
      else -> promise.resolve(cancelled())
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun cancelled() = Arguments.createMap().apply {
    putBoolean("cancelled", true)
  }

  companion object {
    const val NAME = "ScanQr"
    private const val REQUEST_CODE = 0x5148
  }
}
