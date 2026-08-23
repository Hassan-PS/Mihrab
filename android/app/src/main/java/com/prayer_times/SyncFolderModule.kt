package com.prayer_times

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * A folder the user picked, reachable across app restarts.
 *
 * This is the Android half of the sync transport. It knows nothing about
 * envelopes, peers or merging — it lists, reads and writes text files in one
 * directory, and `folderSync.ts` does the rest.
 *
 * ── WHY THE STORAGE ACCESS FRAMEWORK, AND NOT A PATH ──────────────────
 *
 * The point of this folder is that something else already synchronises it:
 * Syncthing, Nextcloud, a Dropbox folder, a USB drive. That means it has to
 * be a directory OTHER apps can see, and since Android 10 an app cannot
 * simply write to shared storage by path. SAF is not a workaround for that;
 * it is the supported answer, and it comes with the property this feature
 * needs most — the user picks the folder, sees which one they picked, and
 * can revoke it.
 *
 * `takePersistableUriPermission` is what makes the choice survive a restart.
 * Without it the grant dies with the process and the user would be asked to
 * find their folder again every launch.
 *
 * ── DocumentsContract, NOT androidx.documentfile ──────────────────────
 *
 * `DocumentFile` would make this shorter. It is also a dependency this app
 * does not currently have, and adding one to the Android build for a class
 * that wraps a ContentResolver is a poor trade for a project that ships on
 * F-Droid. `DocumentsContract` is in the framework, present since API 21,
 * and the whole of what is needed here is four queries.
 *
 * ── NAMES, AND WHY WRITING LOOKS FOR THE STEM ─────────────────────────
 *
 * `createDocument` is allowed to rename: a provider may add an extension,
 * or turn "x.sync.json" into "x.sync (1).json" if it thinks the name is
 * taken. If this module only ever matched the exact name it asked for, a
 * provider that renamed once would make it create a new file on every
 * single sync until the folder was full of them. So writing looks for an
 * exact match first and then for any child starting with the same stem —
 * which is this device's own id and unique to it.
 */
class SyncFolderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  /** Held between launching the picker and the activity result. */
  private var pending: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  private val resolver
    get() = reactContext.contentResolver

  // ── Choosing ──────────────────────────────────────────────────────────

  /**
   * Ask the user for a folder.
   *
   * Resolves `{handle, label}`, or `null` if they backed out — a cancel is
   * a decision, not a failure, and rejecting would make the JS side treat
   * "no thanks" as an error to report.
   */
  @ReactMethod
  fun pick(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("no_activity", "there is no activity to show the picker over")
      return
    }
    if (pending != null) {
      promise.reject("busy", "a folder is already being chosen")
      return
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
      addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or
          Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
      )
    }
    pending = promise
    try {
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (t: Throwable) {
      pending = null
      promise.reject("no_picker", "this device has no document provider", t)
    }
  }

  override fun onActivityResult(
    activity: Activity?,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_CODE) return
    val promise = pending ?: return
    pending = null

    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(null)
      return
    }
    try {
      resolver.takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (t: Throwable) {
      // Without the persistable grant the folder works until the process
      // dies, which is worse than not working: the user would set it up and
      // find it broken tomorrow with no explanation.
      promise.reject("not_persistable", "could not keep access to that folder", t)
      return
    }
    val out = Arguments.createMap()
    out.putString("handle", uri.toString())
    out.putString("label", labelFor(uri))
    promise.resolve(out)
  }

  override fun onNewIntent(intent: Intent?) = Unit

  /** Whether a folder chosen earlier is still ours to read and write. */
  @ReactMethod
  fun hasAccess(handle: String, promise: Promise) {
    promise.resolve(
      resolver.persistedUriPermissions.any {
        it.uri.toString() == handle && it.isReadPermission && it.isWritePermission
      },
    )
  }

  /** Give the folder back. The files stay; only our access ends. */
  @ReactMethod
  fun forget(handle: String, promise: Promise) {
    try {
      resolver.releasePersistableUriPermission(
        Uri.parse(handle),
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (t: Throwable) {
      // Already gone, or never held. Either way the caller's intent is now
      // true, so this is not worth an error.
    }
    promise.resolve(true)
  }

  // ── Files ─────────────────────────────────────────────────────────────

  @ReactMethod
  fun list(handle: String, promise: Promise) {
    try {
      val out: WritableArray = Arguments.createArray()
      forEachChild(Uri.parse(handle)) { _, name -> out.pushString(name) }
      promise.resolve(out)
    } catch (t: Throwable) {
      promise.reject("unreadable", "could not list that folder", t)
    }
  }

  @ReactMethod
  fun read(handle: String, name: String, promise: Promise) {
    try {
      val tree = Uri.parse(handle)
      val documentId = childId(tree, name)
      if (documentId == null) {
        promise.reject("not_found", "no file called $name in that folder")
        return
      }
      val uri = DocumentsContract.buildDocumentUriUsingTree(tree, documentId)
      val text = resolver.openInputStream(uri)?.use { stream ->
        stream.bufferedReader(Charsets.UTF_8).readText()
      }
      if (text == null) {
        promise.reject("unreadable", "could not open $name")
        return
      }
      promise.resolve(text)
    } catch (t: Throwable) {
      promise.reject("unreadable", "could not read $name", t)
    }
  }

  @ReactMethod
  fun write(handle: String, name: String, contents: String, promise: Promise) {
    try {
      val tree = Uri.parse(handle)
      val bytes = contents.toByteArray(Charsets.UTF_8)
      val existing = childId(tree, name) ?: childIdByStem(tree, stemOf(name))

      if (existing != null) {
        val uri = DocumentsContract.buildDocumentUriUsingTree(tree, existing)
        if (tryWrite(uri, bytes)) {
          promise.resolve(true)
          return
        }
        // The provider would not truncate. Replacing is the only way left,
        // and it is done ONLY to this device's own file — every other file
        // in the folder belongs to another device and is never touched.
        try {
          DocumentsContract.deleteDocument(resolver, uri)
        } catch (t: Throwable) {
          promise.reject("unwritable", "could not replace $name", t)
          return
        }
      }

      val treeDoc = DocumentsContract.buildDocumentUriUsingTree(
        tree,
        DocumentsContract.getTreeDocumentId(tree),
      )
      val created = DocumentsContract.createDocument(resolver, treeDoc, MIME, name)
      if (created == null) {
        promise.reject("unwritable", "could not create $name")
        return
      }
      if (!tryWrite(created, bytes)) {
        promise.reject("unwritable", "created $name but could not write to it")
        return
      }
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("unwritable", "could not write $name", t)
    }
  }

  /**
   * Replace a file's contents, or say it could not be done.
   *
   * "wt" truncates, which is the point: without it a shorter envelope would
   * leave the tail of the previous one behind and the file would not parse.
   * Providers are not obliged to honour the flag, so the caller has a
   * fallback rather than this having a silent one.
   */
  private fun tryWrite(uri: Uri, bytes: ByteArray): Boolean {
    return try {
      val stream = resolver.openOutputStream(uri, "wt") ?: return false
      stream.use { it.write(bytes) }
      true
    } catch (t: Throwable) {
      false
    }
  }

  // ── Walking the tree ──────────────────────────────────────────────────

  private fun forEachChild(tree: Uri, each: (id: String, name: String) -> Unit) {
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(
      tree,
      DocumentsContract.getTreeDocumentId(tree),
    )
    resolver.query(
      children,
      arrayOf(
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      ),
      null,
      null,
      null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getString(0) ?: continue
        val name = cursor.getString(1) ?: continue
        each(id, name)
      }
    }
  }

  private fun childId(tree: Uri, name: String): String? {
    var found: String? = null
    forEachChild(tree) { id, childName -> if (found == null && childName == name) found = id }
    return found
  }

  /** `mihrab-XXXXXXXXXXXX` — this device's own id, and unique to it. */
  private fun stemOf(name: String): String = name.substringBefore('.')

  private fun childIdByStem(tree: Uri, stem: String): String? {
    if (stem.isEmpty()) return null
    var found: String? = null
    forEachChild(tree) { id, childName ->
      if (found == null && childName.startsWith(stem)) found = id
    }
    return found
  }

  private fun labelFor(tree: Uri): String {
    val doc = DocumentsContract.buildDocumentUriUsingTree(
      tree,
      DocumentsContract.getTreeDocumentId(tree),
    )
    try {
      resolver.query(
        doc,
        arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
        null,
        null,
        null,
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val name = cursor.getString(0)
          if (!name.isNullOrEmpty()) return name
        }
      }
    } catch (t: Throwable) {
      // Providers are allowed to be awkward. A label is decoration.
    }
    return tree.lastPathSegment ?: tree.toString()
  }

  companion object {
    const val NAME = "SyncFolder"

    /** Arbitrary, and only compared against itself. */
    private const val REQUEST_CODE = 0x5946

    /** What the file is. Providers may still choose their own extension. */
    private const val MIME = "application/json"
  }
}
