package com.prayer_times

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * High-quality mushaf page downscaler — v2.7.28.
 *
 * The 2600×4206 page PNGs are far larger than any phone renders them.
 * A single-step GPU bilinear downscale (what the platform does when an
 * ImageView shows a big bitmap small) skips source pixels below ~0.5×
 * and leaves thin Arabic strokes ragged. This module produces a cached
 * copy at the EXACT rendered pixel size using iterative halving
 * (each 0.5× bilinear step is a clean 2×2 average — equivalent to a
 * box filter) followed by one final ≥0.5× bilinear step. The reader
 * then displays a bitmap 1:1 with the screen — no runtime scaling at
 * all, which is where the perceived pixelation came from.
 */
class MushafPageScalerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MushafPageScaler"

  companion object {
    // Single worker: page scaling is bursty (current page + neighbors);
    // serializing keeps peak memory to one full-size bitmap (~42 MB).
    private val executor = Executors.newSingleThreadExecutor()
  }

  @ReactMethod
  fun scaleToWidth(
    srcPath: String,
    destPath: String,
    targetWidth: Int,
    promise: Promise,
  ) {
    executor.execute {
      try {
        if (targetWidth <= 0) throw IllegalArgumentException("bad targetWidth")
        var bmp = BitmapFactory.decodeFile(srcPath)
          ?: throw IllegalStateException("decode failed: $srcPath")
        // Iterative halving while still ≥ 2× the target — each step is a
        // clean 2×2 average, no pixel skipping.
        while (bmp.width >= targetWidth * 2) {
          val half = Bitmap.createScaledBitmap(bmp, bmp.width / 2, bmp.height / 2, true)
          if (half !== bmp) bmp.recycle()
          bmp = half
        }
        if (bmp.width != targetWidth) {
          val h = Math.max(1, Math.round(bmp.height.toFloat() * targetWidth / bmp.width))
          val exact = Bitmap.createScaledBitmap(bmp, targetWidth, h, true)
          if (exact !== bmp) bmp.recycle()
          bmp = exact
        }
        val dest = File(destPath)
        dest.parentFile?.mkdirs()
        val tmp = File("$destPath.part")
        FileOutputStream(tmp).use { out ->
          bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        }
        bmp.recycle()
        if (dest.exists()) dest.delete()
        if (!tmp.renameTo(dest)) throw IllegalStateException("rename failed")
        promise.resolve(destPath)
      } catch (e: Exception) {
        promise.reject("scale_failed", e.message, e)
      }
    }
  }
}
