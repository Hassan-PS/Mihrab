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
        /**
         * DECODE SMALL, THEN REFINE — do not decode 2600×4206 and throw
         * most of it away.
         *
         * The old line was a bare `decodeFile`, which allocates the full
         * page: 2600 × 4206 × 4 bytes ≈ 42 MB of ARGB_8888 for something
         * about to be scaled to phone width. Play Console flags exactly
         * this ("improve performance with bitmap downsampling"), and on a
         * low-memory device it is the difference between a scaled page and
         * an OutOfMemoryError.
         *
         * `inSampleSize` is not a quality compromise here, which is the
         * only reason this is safe: at a power of two it is a clean box
         * average — the same operation the halving loop below was written
         * to get, done by the decoder for free. So take the largest power
         * of two that still leaves the bitmap AT OR ABOVE `targetWidth`,
         * and let the existing progressive chain do the rest. Nothing is
         * ever decoded below the size it will be displayed at, so the
         * sharpness this module exists for is untouched.
         */
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(srcPath, bounds)
        val opts = BitmapFactory.Options()
        if (bounds.outWidth > 0) {
          var sample = 1
          while (bounds.outWidth / (sample * 2) >= targetWidth) sample *= 2
          opts.inSampleSize = sample
        }
        var bmp = BitmapFactory.decodeFile(srcPath, opts)
          ?: throw IllegalStateException("decode failed: $srcPath")
        // Progressive downscale (v2.7.30): repeated bilinear steps of
        // ≈0.71 per step. A SINGLE bilinear step with a factor in the
        // 0.5–0.7 zone skips source pixels (bilinear only samples a 2×2
        // neighborhood) and leaves thin Arabic strokes ragged — mushaf
        // pages 1–2 landed exactly there (2600 → ~1720, 0.66×) and
        // rendered pixelated while pages 3+ (≈0.44×, caught by the old
        // halving loop) were sharp. Chaining steps that each stay above
        // ~0.7× approximates an area filter for ANY total factor.
        while (bmp.width > targetWidth) {
          val next = Math.max(targetWidth, Math.round(bmp.width * 0.71f))
          val h = Math.max(1, Math.round(bmp.height.toFloat() * next / bmp.width))
          val step = Bitmap.createScaledBitmap(bmp, next, h, true)
          if (step !== bmp) bmp.recycle()
          bmp = step
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
