package com.prayer_times

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.security.MessageDigest

/**
 * The user's own adhan recording — picking it, keeping it, and giving the
 * system a channel that will actually play it.
 *
 * WHY THIS IS NATIVE AT ALL. Notifee owns every other notification channel in
 * this app, but its channel `sound` field cannot express a user's file. Its
 * resolver was decompiled rather than guessed: `"default"` maps to
 * `RingtoneManager.getDefaultUri`, anything else is looked up as a `res/raw`
 * resource — with an extension stripped if present — and if that lookup misses
 * it returns null and the channel is left silent. There is no branch that
 * parses a URI. A file the user chose at runtime cannot be a `res/raw`
 * resource, so the channel has to be built here.
 *
 * Notifee is still what POSTS the notification; a channel belongs to the app,
 * not to the library that created it, so it is happy to publish into this one.
 */
class CustomAdhanModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private var pendingPick: Promise? = null

  private val activityListener: ActivityEventListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
          if (requestCode != PICK_REQUEST) return
          val promise = pendingPick ?: return
          pendingPick = null
          val uri = data?.data
          if (resultCode != Activity.RESULT_OK || uri == null) {
            // A cancelled picker is not an error — it is the user changing
            // their mind, and the caller renders nothing.
            promise.resolve(null)
            return
          }
          try {
            promise.resolve(importFrom(uri))
          } catch (e: Exception) {
            promise.reject("custom_adhan_import_failed", e.message, e)
          }
        }
      }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityListener)
    super.invalidate()
  }

  /**
   * Open the system document picker and import whatever comes back.
   *
   * Resolves null when the user cancels, otherwise a descriptor of the
   * imported file. Doing the copy here rather than handing a URI back to JS
   * keeps the window where the grant is alive as short as possible: the URI
   * from `ACTION_OPEN_DOCUMENT` is only readable by this process, and only
   * until it is revoked.
   */
  @ReactMethod
  fun pick(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("custom_adhan_no_activity", "No foreground activity")
      return
    }
    pendingPick?.resolve(null)
    pendingPick = promise
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "audio/*"
          putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/ogg"))
        }
    try {
      activity.startActivityForResult(intent, PICK_REQUEST)
    } catch (e: Exception) {
      pendingPick = null
      promise.reject("custom_adhan_no_picker", e.message, e)
    }
  }

  /** The imported adhan, or null when the user has never picked one. */
  @ReactMethod
  fun current(promise: Promise) {
    val file = storedFile()
    if (file == null) {
      promise.resolve(null)
      return
    }
    promise.resolve(describe(file, displayName(file)))
  }

  /** Forget the imported adhan and drop its channel. */
  @ReactMethod
  fun remove(promise: Promise) {
    storedFile()?.let { file ->
      deleteChannelFor(tokenOf(file))
      file.delete()
    }
    nameFile().delete()
    promise.resolve(true)
  }

  /**
   * Create the notification channel that plays the imported file, and delete
   * any channel left over from a previous one.
   *
   * A channel's sound is IMMUTABLE once created — re-creating it with the same
   * id and a different sound silently keeps the old sound, which is exactly the
   * bug where a user imports a new adhan and keeps hearing the previous one. So
   * the id carries a token derived from the file's own bytes: a different file
   * is a different channel, and the same file re-picked reuses the one already
   * there instead of piling up entries in Android's notification settings.
   */
  @ReactMethod
  fun ensureChannel(channelName: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      // No notification channels before Oreo, and the per-notification sound
      // that replaces them cannot be expressed through Notifee either. The
      // caller falls back to a bundled adhan rather than going silent.
      promise.reject(
          "custom_adhan_unsupported",
          "Custom notification sounds need Android 8 or newer",
      )
      return
    }
    val file = storedFile()
    if (file == null) {
      promise.reject("custom_adhan_missing", "No custom adhan has been imported")
      return
    }
    val manager =
        reactContext.getSystemService(NotificationManager::class.java)
    if (manager == null) {
      promise.reject("custom_adhan_no_manager", "No NotificationManager")
      return
    }
    val token = tokenOf(file)
    val id = channelIdFor(token)

    // Anything of ours that is not the current token is a previous import.
    for (channel in manager.notificationChannels) {
      if (channel.id.startsWith(CHANNEL_PREFIX) && channel.id != id) {
        manager.deleteNotificationChannel(channel.id)
      }
    }

    val uri = contentUriFor(file)
    grantReadToSystem(uri)
    val channel =
        NotificationChannel(id, channelName, NotificationManager.IMPORTANCE_HIGH).apply {
          enableVibration(true)
          setSound(
              uri,
              AudioAttributes.Builder()
                  .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                  .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                  .build(),
          )
        }
    manager.createNotificationChannel(channel)
    promise.resolve(id)
  }

  /**
   * A channel whose sound plays through the ALARM stream.
   *
   * ── WHY THIS IS NATIVE, AND WHY IT IS A SECOND CHANNEL ───────────────
   *
   * Reported as "notification sound not working on silent/vibrate" (#9).
   * It is not a bug: a notification channel's audio carries
   * `USAGE_NOTIFICATION`, which Android routes to the notification stream,
   * and the ringer switch silences that stream. Working as designed, and
   * useless to someone who silences their phone and still wants to be
   * called to prayer.
   *
   * `USAGE_ALARM` routes to the alarm stream instead, which the ringer does
   * NOT silence — the same reason an alarm clock still goes off. Notifee's
   * `createChannel` cannot express audio attributes at all, so this has to
   * be built here, which is the same reason the imported-file channel above
   * is native.
   *
   * A SEPARATE CHANNEL, not a modified one: a channel's sound and audio
   * attributes are frozen the moment it is created, and calling
   * `createNotificationChannel` again with the same id changes nothing.
   * Toggling the setting therefore has to switch channels, not edit one —
   * the same constraint that gives every adhan its own channel already.
   *
   * DND is deliberately NOT bypassed. `setBypassDnd` needs notification
   * policy access, which is a separate permission prompt, and Do Not
   * Disturb is a stronger statement than flicking the ringer off.
   */
  @ReactMethod
  fun ensureAlarmChannel(
      channelId: String,
      channelName: String,
      soundResName: String?,
      promise: Promise,
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.reject(
          "alarm_channel_unsupported",
          "Alarm-stream channels need Android 8 or newer",
      )
      return
    }
    val manager = reactContext.getSystemService(NotificationManager::class.java)
    if (manager == null) {
      promise.reject("alarm_channel_no_manager", "No NotificationManager")
      return
    }
    val uri =
        if (soundResName.isNullOrBlank()) {
          // The imported file, when that is what is selected. Its content
          // URI needs the same read grant the notification channel above
          // hands out, because the sound is played by the system UI process.
          val file = storedFile()
          if (file == null) {
            promise.reject("alarm_channel_no_sound", "No sound to attach")
            return
          }
          contentUriFor(file).also { grantReadToSystem(it) }
        } else {
          Uri.parse("android.resource://${reactContext.packageName}/raw/$soundResName")
        }
    val channel =
        NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_HIGH).apply {
          enableVibration(true)
          setSound(
              uri,
              AudioAttributes.Builder()
                  .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                  .setUsage(AudioAttributes.USAGE_ALARM)
                  .build(),
          )
        }
    manager.createNotificationChannel(channel)
    promise.resolve(channelId)
  }

  /** Drop a channel this module made. Used when the setting goes back off,
   *  so Android's notification settings do not accumulate dead entries. */
  @ReactMethod
  fun deleteChannel(channelId: String, promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext
          .getSystemService(NotificationManager::class.java)
          ?.deleteNotificationChannel(channelId)
    }
    promise.resolve(null)
  }

  private fun deleteChannelFor(token: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    reactContext
        .getSystemService(NotificationManager::class.java)
        ?.deleteNotificationChannel(channelIdFor(token))
  }

  /**
   * Hand the system a URI it is allowed to read.
   *
   * The file lives in this app's private storage, so a `file://` URI would be
   * unreadable to whoever plays the sound. FileProvider turns it into a
   * `content://` URI, and the read grant has to be handed out explicitly —
   * the notification is rendered by the system UI process, not by ours.
   */
  private fun grantReadToSystem(uri: Uri) {
    for (target in SOUND_READERS) {
      try {
        reactContext.grantUriPermission(
            target,
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      } catch (_: Exception) {
        // A package that is not present on this build is not a failure.
      }
    }
  }

  private fun contentUriFor(file: File): Uri =
      FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.adhan", file)

  private fun importFrom(uri: Uri): WritableMap {
    val resolver = reactContext.contentResolver
    val name = queryDisplayName(uri) ?: "adhan"
    val dir = storageDir()
    dir.mkdirs()

    // Copy to a scratch name first: the token is a digest of the bytes, so it
    // is not known until the copy has finished.
    val scratch = File(dir, "incoming.tmp")
    val digest = MessageDigest.getInstance("SHA-256")
    resolver.openInputStream(uri).use { input ->
      requireNotNull(input) { "Could not open the chosen file" }
      scratch.outputStream().use { output ->
        val buffer = ByteArray(BUFFER_BYTES)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
          output.write(buffer, 0, read)
        }
      }
    }
    val token = digest.digest().take(6).joinToString("") { "%02x".format(it) }
    val extension = name.substringAfterLast('.', "mp3").lowercase().take(5)

    // One import at a time: the previous file is only useful to a channel that
    // is about to be deleted.
    dir.listFiles()?.forEach { if (it != scratch) it.delete() }
    val target = File(dir, "$token.$extension")
    scratch.renameTo(target)
    nameFile().writeText(name)
    return describe(target, name)
  }

  private fun describe(file: File, name: String): WritableMap =
      Arguments.createMap().apply {
        putString("name", name)
        putString("token", tokenOf(file))
        putString("channelId", channelIdFor(tokenOf(file)))
        putDouble("bytes", file.length().toDouble())
        putDouble("durationMs", durationOf(file).toDouble())
        // Android plays whatever length the channel is given, so nothing is
        // ever trimmed here. iOS is the platform with a ceiling.
        putBoolean("trimmed", false)
      }

  private fun durationOf(file: File): Long {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      retriever
          .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
          ?.toLongOrNull()
          ?: 0L
    } catch (_: Exception) {
      0L
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
        // Nothing useful to do if the retriever will not let go.
      }
    }
  }

  private fun queryDisplayName(uri: Uri): String? {
    return try {
      reactContext.contentResolver
          .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
          ?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (column >= 0 && cursor.moveToFirst()) cursor.getString(column) else null
          }
    } catch (_: Exception) {
      null
    }
  }

  private fun storageDir(): File = File(reactContext.filesDir, DIR_NAME)

  private fun nameFile(): File = File(storageDir(), "display-name")

  private fun displayName(file: File): String {
    val stored = nameFile()
    return if (stored.exists()) {
      try {
        stored.readText()
      } catch (_: Exception) {
        file.name
      }
    } else {
      file.name
    }
  }

  private fun storedFile(): File? =
      storageDir()
          .listFiles()
          ?.firstOrNull { it.isFile && it.name != nameFile().name && !it.name.endsWith(".tmp") }

  private fun tokenOf(file: File): String = file.nameWithoutExtension

  companion object {
    const val NAME = "CustomAdhan"

    private const val PICK_REQUEST = 0xADAA
    private const val DIR_NAME = "custom_adhan"
    private const val BUFFER_BYTES = 64 * 1024

    /**
     * Channel ids start with this, which is how a stale one is recognised
     * without having to remember what the previous token was.
     */
    const val CHANNEL_PREFIX = "prayer-times-adhan-custom-"

    /**
     * Who has to be able to read the sound. The system UI process renders the
     * notification and plays it; `android` covers the ranker on the builds
     * that route it differently. Granting to a package that is not installed
     * throws, and is caught.
     */
    private val SOUND_READERS = listOf("com.android.systemui", "android")

    fun channelIdFor(token: String): String = "$CHANNEL_PREFIX$token"
  }
}
