package com.prayer_times

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Plays one slice of an ayah recording — a word — and stops.
 *
 * WHY NOT THE TRACK PLAYER. The recitation is a queue in
 * react-native-track-player, and a queue is the wrong instrument for a
 * half-second clip: it would have to be paused, its position kept, a track
 * pushed in, played, cut short, pulled out, and the queue put back — with
 * every listener on it (the listening top-up, the gapless prefetch, the
 * status the mini player draws) seeing all of it happen. A second player
 * that knows nothing about the queue is simpler and cannot disturb it:
 * the recitation is paused and resumed, and that is all it feels.
 *
 * `play` resolves when the slice has been heard, or at once with `false`
 * when it could not be. A new `play` or a `stop` ends the one in flight,
 * which resolves `false` — the caller is the one that asked, so that is
 * not a failure to it.
 *
 * The stop is a poll at 15 ms, not a timer set for the slice's length:
 * `MediaPlayer` reports where it is, and asking it beats assuming the
 * seek landed exactly where it was asked to. `SEEK_CLOSEST` (API 26+)
 * gets it within a frame; below that a seek lands on the nearest sync
 * point, which for MP3 is close enough to a word.
 */
class WordPlayerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var pending: Promise? = null
  private var ticker: Runnable? = null

  override fun getName(): String = "WordPlayer"

  @ReactMethod
  fun play(path: String, startMs: Double, endMs: Double, promise: Promise) {
    handler.post {
      finish(false)
      val mp = MediaPlayer()
      player = mp
      pending = promise
      try {
        mp.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        mp.setDataSource(path)
        mp.setOnErrorListener { _, _, _ ->
          finish(false)
          true
        }
        mp.setOnCompletionListener { finish(true) }
        mp.setOnSeekCompleteListener { p ->
          if (player !== p) return@setOnSeekCompleteListener
          p.start()
          val end = endMs.toInt()
          val tick = object : Runnable {
            override fun run() {
              val current = player ?: return
              if (current !== p) return
              if (!current.isPlaying || current.currentPosition >= end) {
                finish(true)
              } else {
                handler.postDelayed(this, 15)
              }
            }
          }
          ticker = tick
          handler.postDelayed(tick, 15)
        }
        mp.setOnPreparedListener { p ->
          if (player !== p) return@setOnPreparedListener
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            p.seekTo(startMs.toLong(), MediaPlayer.SEEK_CLOSEST)
          } else {
            @Suppress("DEPRECATION")
            p.seekTo(startMs.toInt())
          }
        }
        mp.prepareAsync()
      } catch (e: Exception) {
        finish(false)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    handler.post {
      finish(false)
      promise.resolve(true)
    }
  }

  /** Main thread only. Ends whatever is in flight and answers its promise. */
  private fun finish(heard: Boolean) {
    ticker?.let { handler.removeCallbacks(it) }
    ticker = null
    player?.let { p ->
      try {
        if (p.isPlaying) p.stop()
      } catch (_: IllegalStateException) {
      }
      p.release()
    }
    player = null
    pending?.resolve(heard)
    pending = null
  }
}
