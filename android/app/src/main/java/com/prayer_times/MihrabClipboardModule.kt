package com.prayer_times

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Copy and paste, for the pairing code.
 *
 * WHY NOT `Clipboard` FROM REACT NATIVE. It is still there in 0.83 and it
 * still works, behind a deprecation warning that says it will be removed. A
 * headline feature resting on an API whose own runtime warns it is leaving
 * is a fault waiting for an upgrade to trigger, and the fix would have to be
 * written then instead of now.
 *
 * WHY NOT `@react-native-clipboard/clipboard`. It is the recommended
 * replacement and it is fine — but it is native code in node_modules, which
 * means another `scanignore` line in the F-Droid recipe, which lives in
 * `fdroiddata` and needs its own merge request and review. The whole pairing
 * design was arranged to avoid that for the first release. Forty lines of
 * app source needs none of it.
 *
 * NOT MARKED SENSITIVE. Android 13 will hide the preview of a clip flagged
 * with `EXTRA_IS_SENSITIVE`, which is right for a password and wrong here:
 * the pairing code IS the device's public key, it sits on screen
 * permanently, and someone copying it usually wants to see that they copied
 * the right one.
 */
class MihrabClipboardModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private fun manager(): ClipboardManager? =
    reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager

  /**
   * Put `text` on the clipboard, and say whether the system will announce it.
   *
   * Android 13 and up shows its own "Copied" confirmation, so an app that
   * also shows one gives the user two. Rather than have the JS side guess at
   * the API level, the answer travels back with the result.
   */
  @ReactMethod
  fun setString(text: String, promise: Promise) {
    val clipboard = manager()
    if (clipboard == null) {
      promise.reject("unavailable", "no clipboard service")
      return
    }
    try {
      val clip = ClipData.newPlainText(LABEL, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        clip.description.extras = PersistableBundle().apply {
          putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, false)
        }
      }
      clipboard.setPrimaryClip(clip)
      promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU)
    } catch (t: Throwable) {
      promise.reject("failed", "could not write to the clipboard", t)
    }
  }

  /**
   * What is on the clipboard, or an empty string.
   *
   * Empty rather than an error when there is nothing readable: from Android
   * 10 the clipboard is only readable by the focused app, and a paste button
   * pressed a moment too early should do nothing rather than raise.
   */
  @ReactMethod
  fun getString(promise: Promise) {
    val clipboard = manager()
    if (clipboard == null) {
      promise.reject("unavailable", "no clipboard service")
      return
    }
    try {
      val clip = clipboard.primaryClip
      if (clip == null || clip.itemCount == 0) {
        promise.resolve("")
        return
      }
      promise.resolve(clip.getItemAt(0).coerceToText(reactApplicationContext).toString())
    } catch (t: Throwable) {
      promise.reject("failed", "could not read the clipboard", t)
    }
  }

  companion object {
    const val NAME = "MihrabClipboard"

    /** Shown by some launchers in the clipboard history. */
    private const val LABEL = "Mihrab pairing code"
  }
}
