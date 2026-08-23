package com.prayer_times

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageProxy
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.zxing.LuminanceSource
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Point the camera at another device's pairing code.
 *
 * ── WHY AN ACTIVITY AND NOT A REACT VIEW ──────────────────────────────
 *
 * A camera preview inside the React tree means a native view manager, a
 * lifecycle to keep in step with a JS component, and a surface that has to
 * survive navigation. All of that to show a rectangle for four seconds. An
 * activity is started, returns a string, and is gone — and the camera goes
 * with it, which is the property that matters most for a permission people
 * are right to be careful about.
 *
 * ── ZXING, NOT ML KIT ─────────────────────────────────────────────────
 *
 * ML Kit's barcode scanner is one line and pulls in Google Play Services,
 * which the F-Droid build exists to be without. `zxing:core` is pure Java,
 * Apache 2.0, and decodes a QR from a luminance plane in about fifteen
 * lines. See the note in build.gradle.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
 *
 * No torch, no zoom, no gallery import, no autofocus tap. A pairing code
 * fills a phone screen held thirty centimetres away, in a room with enough
 * light to read it. Every control added here is one more thing between
 * someone and a feature they use twice.
 */
/*
 * `ComponentActivity`, not `AppCompatActivity`: AppCompat insists on a
 * Theme.AppCompat descendant and throws at runtime under any other, and the
 * manifest gives this one a plain fullscreen theme so the camera fills the
 * screen. ComponentActivity is a LifecycleOwner, which is all the camera
 * controller asks for.
 */
class ScanQrActivity : ComponentActivity() {

  private lateinit var preview: PreviewView
  private lateinit var hint: TextView
  private val analysisExecutor = Executors.newSingleThreadExecutor()

  /**
   * A QR fills many frames, so the analyser decodes the same code again and
   * again. Without this the activity finishes several times over and the
   * promise resolves more than once.
   */
  private val finished = AtomicBoolean(false)

  private val reader = MultiFormatReader().apply {
    setHints(
      mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)),
    )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(buildLayout())

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED
    ) {
      start()
    } else {
      ActivityCompat.requestPermissions(
        this,
        arrayOf(Manifest.permission.CAMERA),
        PERMISSION_REQUEST,
      )
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != PERMISSION_REQUEST) return
    if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      start()
    } else {
      // A distinct result, not a cancel: "you said no to the camera" and "I
      // changed my mind" need different things said to the user.
      finishWith(RESULT_FIRST_USER, null)
    }
  }

  private fun buildLayout(): ViewGroup {
    val root = FrameLayout(this).apply {
      layoutParams = ViewGroup.LayoutParams(MATCH, MATCH)
      setBackgroundColor(Color.BLACK)
    }
    preview = PreviewView(this).apply {
      layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
    }
    root.addView(preview)

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      layoutParams = FrameLayout.LayoutParams(MATCH, WRAP).apply {
        gravity = Gravity.BOTTOM
        bottomMargin = dp(32)
      }
    }
    hint = TextView(this).apply {
      text = intent.getStringExtra(EXTRA_HINT).orEmpty()
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      gravity = Gravity.CENTER
      setPadding(dp(24), 0, dp(24), dp(16))
    }
    val cancel = Button(this).apply {
      text = intent.getStringExtra(EXTRA_CANCEL).orEmpty()
      setOnClickListener { finishWith(Activity.RESULT_CANCELED, null) }
    }
    column.addView(hint)
    column.addView(cancel)
    root.addView(column)
    return root
  }

  /**
   * `LifecycleCameraController` rather than `ProcessCameraProvider`.
   *
   * The provider hands back a `ListenableFuture`, whose class is not on the
   * compile classpath unless Guava is dragged in — three megabytes for one
   * type. The controller binds preview and analysis to this activity's
   * lifecycle in four lines and needs nothing extra.
   */
  private fun start() {
    try {
      val controller = LifecycleCameraController(this).apply {
        cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
        // Analysis only. Preview is bound implicitly by attaching the
        // controller to a PreviewView; image and video capture are use cases
        // this has no business holding open.
        setEnabledUseCases(LifecycleCameraController.IMAGE_ANALYSIS)
        setImageAnalysisAnalyzer(analysisExecutor) { image -> decode(image) }
        bindToLifecycle(this@ScanQrActivity)
      }
      preview.controller = controller
    } catch (t: Throwable) {
      finishWith(RESULT_NO_CAMERA, null)
    }
  }

  /**
   * One frame, as luminance.
   *
   * The Y plane of a YUV_420_888 image IS a greyscale bitmap, which is
   * exactly what a QR decoder wants — no colour conversion, no allocation
   * beyond the row copy. `rowStride` is not always the width: some devices
   * pad every row, and reading the buffer straight through gives a sheared
   * image that never decodes.
   */
  private fun decode(image: ImageProxy) {
    if (finished.get()) {
      image.close()
      return
    }
    try {
      val plane = image.planes[0]
      val buffer = plane.buffer
      val width = image.width
      val height = image.height
      val rowStride = plane.rowStride
      val data = ByteArray(width * height)
      if (rowStride == width) {
        buffer.get(data, 0, minOf(buffer.remaining(), data.size))
      } else {
        val row = ByteArray(rowStride)
        for (y in 0 until height) {
          if (buffer.remaining() < rowStride) break
          buffer.get(row, 0, rowStride)
          System.arraycopy(row, 0, data, y * width, width)
        }
      }

      val source = PlanarYUVLuminanceSource(
        data, width, height, 0, 0, width, height, false,
      )
      val text = read(source) ?: read(source.rotateCounterClockwise())
      if (text != null && finished.compareAndSet(false, true)) {
        runOnUiThread { finishWith(Activity.RESULT_OK, text) }
      }
    } catch (t: Throwable) {
      // One bad frame is not a failure; the next one is along in 30ms.
    } finally {
      image.close()
    }
  }

  private fun read(source: LuminanceSource): String? =
    try {
      reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
    } catch (t: Throwable) {
      null
    } finally {
      reader.reset()
    }

  private fun finishWith(code: Int, text: String?) {
    finished.set(true)
    setResult(code, intent.putExtra(EXTRA_RESULT, text))
    finish()
  }

  override fun onDestroy() {
    super.onDestroy()
    analysisExecutor.shutdown()
  }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_HINT = "hint"
    const val EXTRA_CANCEL = "cancel"
    const val EXTRA_RESULT = "result"

    /** Told apart from a cancel so the user hears the right thing. */
    const val RESULT_NO_CAMERA = Activity.RESULT_FIRST_USER + 1

    private const val PERMISSION_REQUEST = 0x5147
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
  }
}
