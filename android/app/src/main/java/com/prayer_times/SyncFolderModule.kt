package com.prayer_times

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import java.io.FileOutputStream
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
 * ── ONE TAP, AND THE FOLDER MAKES ITSELF ─────────────────────────────
 *
 * The picker opens already inside Downloads, and whatever the user grants,
 * this creates and then reuses a `Mihrab` directory inside it. So the whole
 * job is "tap Use this folder" — no navigating, and nothing to create by
 * hand first, which is what it cost before.
 *
 * The handle stored afterwards is the DOCUMENT uri of that subdirectory,
 * not the tree uri of the grant. Every operation below therefore asks for
 * the parent document id rather than assuming the tree root — which also
 * means a handle saved by an older build, when it was the tree itself,
 * still works.
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

  /**
   * The folder to use when the user has not chosen one — and on Android
   * there isn't one.
   *
   * iOS can hand the app its own Documents directory and have the Files app
   * show it to everything else. Android has no equivalent: an app's own
   * external files directory is invisible to other apps from Android 11, so
   * a sync client could never see what we wrote there, and shared storage
   * cannot be written by path any more. `ACTION_OPEN_DOCUMENT_TREE` is the
   * supported way to get a directory two apps can both use, and it costs
   * one confirmation.
   *
   * Resolving null rather than throwing: "there is no default here" is an
   * answer, not a failure, and the screen turns it into a Choose a folder
   * button.
   */
  @ReactMethod
  fun defaultFolder(promise: Promise) {
    promise.resolve(null)
  }

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
    // `getCurrentActivity()` on the module base class is deprecated as of
    // RN 0.80 and is a function rather than a property, so it cannot be
    // reached by shorthand. The context is where it lives now.
    val activity = reactContext.currentActivity
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
      // Open inside Downloads rather than at the root of nothing. A hint,
      // not a restriction: someone whose sync client watches a particular
      // directory can still navigate to it.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        putExtra(
          DocumentsContract.EXTRA_INITIAL_URI,
          DocumentsContract.buildDocumentUri(EXTERNAL_STORAGE_AUTHORITY, "primary:Download"),
        )
      }
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
    activity: Activity,
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
    // A `Mihrab` folder inside what they picked is a courtesy, not a
    // requirement: it keeps our files out of the way of theirs. Plenty of
    // providers will not make a directory on request — the Downloads root
    // is the common one, and it throws FileNotFoundException rather than
    // saying so — and refusing the whole folder over that told the user
    // their choice was invalid when it was perfectly usable (reported on a
    // Pixel, 2026-08-24). So fall back to the folder itself, and only give
    // up when even that cannot hold a file.
    //
    // And not when they have already made one: someone who creates a folder
    // called Mihrab creates it FOR this, and nesting a second inside it
    // leaves their sync client watching Documents/Mihrab while the app
    // writes to Documents/Mihrab/Mihrab — which looks like sync silently
    // doing nothing, from a folder whose name says it should be working.
    val label = labelFor(uri)
    val sub = if (label == FOLDER_NAME) null else subfolderIn(uri)
    if (sub == null && !canCreateIn(uri)) {
      promise.reject("unwritable", "nothing can be written to that folder")
      return
    }
    val out = Arguments.createMap()
    out.putString("handle", (sub ?: documentOf(uri)).toString())
    out.putString("label", if (sub != null) "$label/$FOLDER_NAME" else label)
    out.putString("kind", "picked")
    promise.resolve(out)
  }

  override fun onNewIntent(intent: Intent) = Unit

  /** Whether a folder chosen earlier is still ours to read and write. */
  @ReactMethod
  fun hasAccess(handle: String, promise: Promise) {
    // The grant is on the TREE; the handle may be a subdirectory inside it.
    // Comparing the handle itself would report no access for every folder
    // this build creates.
    val tree = try {
      treeOf(Uri.parse(handle)).toString()
    } catch (t: Throwable) {
      promise.resolve(false)
      return
    }
    promise.resolve(
      resolver.persistedUriPermissions.any {
        it.uri.toString() == tree && it.isReadPermission && it.isWritePermission
      },
    )
  }

  /** Give the folder back. The files stay; only our access ends. */
  @ReactMethod
  fun forget(handle: String, promise: Promise) {
    try {
      resolver.releasePersistableUriPermission(
        treeOf(Uri.parse(handle)),
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
      val uri = DocumentsContract.buildDocumentUriUsingTree(treeOf(tree), documentId)
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
      val folder = Uri.parse(handle)
      val bytes = contents.toByteArray(Charsets.UTF_8)

      // Everything this device has ever written here, newest name first.
      // There is normally one; there can be more because a provider is
      // allowed to rename on create, and an earlier build then made a fresh
      // file every round instead of finding the one it already had.
      val ours = childrenWithStem(folder, stemOf(name), name)

      if (ours.isNotEmpty()) {
        val target = DocumentsContract.buildDocumentUriUsingTree(
          treeOf(folder),
          ours.first(),
        )
        if (!tryWrite(target, bytes)) {
          // NOT followed by a create. Creating one here is what filled the
          // folder with "mihrab-… (1).json", "(2)", "(3)" — a failure to
          // overwrite has to be a failure, or every round leaves litter.
          promise.reject("unwritable", "could not overwrite $name")
          return
        }
        // Tidy up any duplicates left by that. Only ever files whose name
        // begins with THIS device's own id — no other device's file is
        // touched, here or anywhere else in this module.
        for (stale in ours.drop(1)) {
          try {
            DocumentsContract.deleteDocument(
              resolver,
              DocumentsContract.buildDocumentUriUsingTree(treeOf(folder), stale),
            )
          } catch (t: Throwable) {
            // Leaving a stale copy is untidy and harmless: the reader skips
            // files this device wrote. Failing the sync over it would not be.
          }
        }
        promise.resolve(true)
        return
      }

      val created = DocumentsContract.createDocument(
        resolver,
        documentOf(folder),
        MIME,
        name,
      )
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
   * Delete one file — the only deletion in the whole transport.
   *
   * The folder module otherwise never removes anything that is not this
   * device's own litter, because deciding that a quiet device is a gone
   * device loses data. This is the one case where somebody DID decide: the
   * user removed a paired device on the Sync screen, and its file is now a
   * corpse that the merge would keep listening to for ever. See
   * `forgetPeer` and the comment above `syncWithFolder`.
   *
   * `childrenWithStem` rather than one exact name, because a provider is
   * allowed to rename on create — a departed device can have left
   * `mihrab-XXXX.sync.json` AND `mihrab-XXXX (1).sync.json`, and clearing
   * only the first would leave the resurrection running from the second.
   *
   * A file that is not there resolves `false` rather than rejecting. Two
   * devices can be told to forget the same third one, and the second to act
   * should not report a failure for work the first already did.
   */
  @ReactMethod
  fun remove(handle: String, name: String, promise: Promise) {
    try {
      val folder = Uri.parse(handle)
      val matches = childrenWithStem(folder, stemOf(name), name)
      if (matches.isEmpty()) {
        promise.resolve(false)
        return
      }
      var removed = false
      for (documentId in matches) {
        val uri = DocumentsContract.buildDocumentUriUsingTree(treeOf(folder), documentId)
        if (DocumentsContract.deleteDocument(resolver, uri)) removed = true
      }
      if (!removed) {
        promise.reject("undeletable", "could not delete $name")
        return
      }
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("undeletable", "could not delete $name", t)
    }
  }

  /**
   * Replace a file's contents, or say it could not be done.
   *
   * Truncation is the point: without it a shorter envelope leaves the tail
   * of the previous one behind and the file no longer parses. Two ways of
   * asking, because providers differ in which they honour — "rwt" through a
   * file descriptor is the one that works most widely, and truncating the
   * channel by hand covers the rest.
   */
  private fun tryWrite(uri: Uri, bytes: ByteArray): Boolean {
    try {
      resolver.openFileDescriptor(uri, "rwt")?.use { pfd ->
        FileOutputStream(pfd.fileDescriptor).use { it.write(bytes) }
        return true
      }
    } catch (t: Throwable) {
      // Fall through and try the other way.
    }
    try {
      resolver.openFileDescriptor(uri, "rw")?.use { pfd ->
        FileOutputStream(pfd.fileDescriptor).use { out ->
          out.channel.truncate(0)
          out.write(bytes)
        }
        return true
      }
    } catch (t: Throwable) {
      return false
    }
    return false
  }

  // ── Walking the tree ──────────────────────────────────────────────────

  /**
   * The tree the grant was made on, whatever the handle points at.
   *
   * A handle is either the tree itself (older builds) or a document inside
   * it (this one). Permissions live on the tree, so anything that talks
   * about access has to come back here first.
   */
  private fun treeOf(folder: Uri): Uri =
    DocumentsContract.buildTreeDocumentUri(
      folder.authority,
      DocumentsContract.getTreeDocumentId(folder),
    )

  /** The document id to list and create children under. */
  private fun parentIdOf(folder: Uri): String =
    if (DocumentsContract.isDocumentUri(reactContext, folder)) {
      DocumentsContract.getDocumentId(folder)
    } else {
      DocumentsContract.getTreeDocumentId(folder)
    }

  /** The folder itself as a document, for creating things inside it. */
  private fun documentOf(folder: Uri): Uri =
    DocumentsContract.buildDocumentUriUsingTree(treeOf(folder), parentIdOf(folder))

  /**
   * `Mihrab` inside `tree`, made if it is not there yet — or null if this
   * provider will not make one.
   *
   * Reused rather than duplicated: a provider that already has one returns
   * it, so choosing the same parent twice does not leave the user with
   * `Mihrab` and `Mihrab (1)` and half their files in each.
   *
   * Null rather than an exception, because "no subfolder" is not the end of
   * the road: the caller writes into the picked folder instead. Providers
   * differ on directory creation more than the contract suggests — the
   * Downloads root will happily hold files and refuses to hold a folder,
   * and it refuses by throwing FileNotFoundException from a method whose
   * documented failure is a null return.
   */
  private fun subfolderIn(tree: Uri): Uri? {
    var existing: String? = null
    forEachChild(tree) { id, name ->
      if (existing == null && name == FOLDER_NAME) existing = id
    }
    // Without the middle branch a provider that will not list makes a fresh
    // `Mihrab (1)`, `Mihrab (2)` every time the folder is opened.
    val id = existing
      ?: documentIdFor(tree, FOLDER_NAME)
      ?: try {
        DocumentsContract.createDocument(
          resolver,
          documentOf(tree),
          DocumentsContract.Document.MIME_TYPE_DIR,
          FOLDER_NAME,
        )?.let { DocumentsContract.getDocumentId(it) }
      } catch (t: Throwable) {
        null
      }
    return id?.let { DocumentsContract.buildDocumentUriUsingTree(treeOf(tree), it) }
  }

  /**
   * Whether this folder will accept a new file at all.
   *
   * Asked only when the subfolder could not be made, to tell "this provider
   * does not do directories" — fine, we write beside their files — from
   * "this is read-only", which is the one case worth stopping the user for.
   *
   * Two answers, because the first one lies. `FLAG_DIR_SUPPORTS_CREATE` is
   * the provider's own claim, and a provider that backs a remote service
   * (Nextcloud, and the reported case is exactly that) may not set it on a
   * folder it will happily accept a file into. Refusing on the flag alone
   * would tell someone their Nextcloud folder is unusable when it is the
   * whole reason they wanted sync. So if the flag says no, ASK by writing:
   * one empty file, deleted immediately, in a folder the user has just
   * nominated for our files anyway.
   */
  private fun canCreateIn(folder: Uri): Boolean {
    val claimed = try {
      resolver.query(
        documentOf(folder),
        arrayOf(DocumentsContract.Document.COLUMN_FLAGS),
        null,
        null,
        null,
      )?.use { cursor ->
        cursor.moveToFirst() &&
          (cursor.getInt(0) and DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE) != 0
      } ?: false
    } catch (t: Throwable) {
      false
    }
    if (claimed) return true

    val probe = try {
      DocumentsContract.createDocument(resolver, documentOf(folder), MIME, PROBE_NAME)
    } catch (t: Throwable) {
      null
    } ?: return false
    try {
      DocumentsContract.deleteDocument(resolver, probe)
    } catch (t: Throwable) {
      // Named so that a provider which will not delete leaves something
      // recognisable rather than a mystery, and one file rather than one
      // per attempt: the next probe finds the same name taken and the
      // provider either reuses or renames it.
    }
    return true
  }

  private fun forEachChild(folder: Uri, each: (id: String, name: String) -> Unit) {
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(
      treeOf(folder),
      parentIdOf(folder),
    )
    try {
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
    } catch (t: Throwable) {
      // A provider that will not enumerate is not a provider that cannot
      // be used — see `documentIdFor`. Callers treat "no children" and "no
      // listing" the same, and both have a way through.
    }
  }

  /**
   * The document id for a named child, WITHOUT enumerating the folder.
   *
   * Directory listing is the one part of the Storage Access Framework that
   * is allowed to be useless: a provider may return an empty cursor for a
   * directory it will happily create and open files in, and one does — an
   * Android 16 emulator returns zero children for a folder holding seven
   * files, with the read and write grants both held. Every round then
   * failed to find the file it wrote last time and made another.
   *
   * Document ids are opaque BY CONTRACT, so composing one is not something
   * to do lightly. It is done here only as a fallback, only after listing
   * has come up empty, and the result is verified with a real query before
   * it is used — so on a provider whose ids are not paths this simply finds
   * nothing, which is exactly where it started.
   */
  private fun documentIdFor(folder: Uri, name: String): String? {
    val guess = "${parentIdOf(folder)}/$name"
    val uri = DocumentsContract.buildDocumentUriUsingTree(treeOf(folder), guess)
    return try {
      resolver.query(
        uri,
        arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID),
        null,
        null,
        null,
      )?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (t: Throwable) {
      null
    }
  }

  private fun childId(folder: Uri, name: String): String? {
    var found: String? = null
    forEachChild(folder) { id, childName ->
      if (found == null && childName == name) found = id
    }
    return found ?: documentIdFor(folder, name)
  }

  /** `mihrab-XXXXXXXXXXXX` — this device's own id, and unique to it. */
  private fun stemOf(name: String): String = name.substringBefore('.')

  /**
   * Every child whose name begins with `stem`, with an exact match for
   * `exact` first if there is one.
   *
   * The stem is this device's own id, so this can only ever match files
   * this device wrote. That is what makes it safe for the caller to
   * overwrite the first and delete the rest.
   */
  private fun childrenWithStem(
    folder: Uri,
    stem: String,
    exact: String,
  ): List<String> {
    if (stem.isEmpty()) return emptyList()
    val matches = mutableListOf<String>()
    var exactId: String? = null
    forEachChild(folder) { id, childName ->
      if (childName == exact) {
        exactId = id
      } else if (childName.startsWith(stem)) {
        matches.add(id)
      }
    }
    val first = exactId ?: documentIdFor(folder, exact)
    return if (first != null) listOf(first) + matches else matches
  }

  private fun labelFor(tree: Uri): String {
    val doc = documentOf(tree)
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

    /** Made inside whatever the user grants, so nothing has to exist first. */
    private const val FOLDER_NAME = "Mihrab"

    /**
     * Written and deleted once, only to find out whether a folder that
     * refused a subdirectory will still take a file. Named to explain
     * itself if a provider will not delete it again.
     */
    private const val PROBE_NAME = "mihrab-write-test.json"

    /** The provider behind "Internal storage" on every Android build. */
    private const val EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents"
  }
}
