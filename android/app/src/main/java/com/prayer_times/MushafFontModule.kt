package com.prayer_times

import android.graphics.Typeface
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.views.text.ReactFontManager
import java.io.File

/**
 * Runtime registration of the QPC v2 per-page mushaf fonts — v2.8.0.
 *
 * The mushaf is drawn as text, not as page images: each page has its own
 * font in which one glyph is one word. There are 604 of them and they are
 * downloaded, not bundled, so they cannot be declared at build time the way
 * `assets/fonts` are. Android can load a typeface from any file, and
 * `ReactFontManager` lets us publish it under a `fontFamily` name that a
 * React `<Text>` can then ask for.
 *
 * Family names are *slots* ("MushafSlot0"…), not page numbers: RN caches
 * typefaces by family name forever, so addressing 604 distinct families would
 * pin every visited page's font in memory. JS owns a small LRU of slots and
 * re-registers one when it recycles it; overwriting a slot drops the previous
 * Typeface, and the platform frees the native font once it is unreferenced.
 */
class MushafFontModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MushafFont"

  /**
   * Publish the font at [path] under the family name [family], replacing
   * whatever that family held before. Resolves with the family name so JS can
   * use the result directly.
   */
  @ReactMethod
  fun registerFont(family: String, path: String, promise: Promise) {
    try {
      val file = File(path)
      if (!file.exists() || file.length() == 0L) {
        throw IllegalArgumentException("font missing: $path")
      }
      val typeface = Typeface.createFromFile(file)
        ?: throw IllegalStateException("createFromFile returned null: $path")
      // Register the same typeface for every style so a stray fontWeight or
      // italic on an ancestor cannot knock the page into a synthetic bold.
      val manager = ReactFontManager.getInstance()
      manager.setTypeface(family, Typeface.NORMAL, typeface)
      manager.setTypeface(family, Typeface.BOLD, typeface)
      manager.setTypeface(family, Typeface.ITALIC, typeface)
      manager.setTypeface(family, Typeface.BOLD_ITALIC, typeface)
      promise.resolve(family)
    } catch (e: Exception) {
      promise.reject("font_register_failed", e.message, e)
    }
  }

  /** True when the platform can parse the file — used to detect a bad download. */
  @ReactMethod
  fun isValidFont(path: String, promise: Promise) {
    try {
      val file = File(path)
      val ok = file.exists() && file.length() > 0 && Typeface.createFromFile(file) != null
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }
}
