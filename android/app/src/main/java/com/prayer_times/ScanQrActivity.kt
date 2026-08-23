package com.prayer_times

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
 * ── AND WHY IT IS DRAWN BY HAND ───────────────────────────────────────
 *
 * Everything below is code rather than XML for one reason: this activity
 * has no theme to inherit from. The manifest gives it a plain fullscreen
 * theme so the preview reaches the edges, which means no AppCompat, no
 * Material components, and no `?attr/colorPrimary` to resolve. A stock
 * `Button` under that theme is the grey slab the rest of the app spent a
 * design review getting rid of.
 *
 * The accent is passed in from JS instead of being a constant here: the
 * user picks it in Appearance and it lives on that side, so the scanner
 * asks rather than guesses. `#RRGGBB`, and a fall back to the app's green
 * when it is anything else.
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
    val accent = accentColor()
    val root = FrameLayout(this).apply {
      layoutParams = ViewGroup.LayoutParams(MATCH, MATCH)
      setBackgroundColor(Color.BLACK)
    }
    preview = PreviewView(this).apply {
      layoutParams = FrameLayout.LayoutParams(MATCH, MATCH)
    }
    root.addView(preview)

    // The frame is not decoration. A camera filling the screen gives no clue
    // how close to hold it or what part is being read, and people respond by
    // moving the phone around until something happens. A window with the
    // rest dimmed answers both questions before they are asked.
    root.addView(
      ViewfinderView(this, accent),
      FrameLayout.LayoutParams(MATCH, MATCH),
    )

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      layoutParams = FrameLayout.LayoutParams(MATCH, WRAP).apply {
        gravity = Gravity.BOTTOM
        bottomMargin = dp(40)
      }
    }
    hint = TextView(this).apply {
      text = intent.getStringExtra(EXTRA_HINT).orEmpty()
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      gravity = Gravity.CENTER
      setPadding(dp(28), 0, dp(28), dp(20))
      // White on an unknown scene: the shadow is what keeps it readable
      // against a bright wall without putting a plate behind it.
      setShadowLayer(dp(6).toFloat(), 0f, dp(1).toFloat(), 0xCC000000.toInt())
    }

    // A pill, not a Button. Translucent white rather than the accent,
    // because backing out is not the thing being encouraged — but it is
    // still a real target, not a word floating on a camera.
    val cancel = TextView(this).apply {
      text = intent.getStringExtra(EXTRA_CANCEL).orEmpty()
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(dp(36), dp(14), dp(36), dp(14))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(28).toFloat()
        setColor(0x40FFFFFF)
        setStroke(dp(1), 0x66FFFFFF)
      }
      isClickable = true
      isFocusable = true
      setOnClickListener { finishWith(Activity.RESULT_CANCELED, null) }
    }
    column.addView(hint)
    // WRAP, explicitly: a vertical LinearLayout hands its children
    // MATCH_PARENT width by default, which turns the pill into a bar
    // across the screen.
    column.addView(
      cancel,
      LinearLayout.LayoutParams(WRAP, WRAP).apply {
        gravity = Gravity.CENTER_HORIZONTAL
      },
    )
    root.addView(column)

    // The theme is fullscreen, so the preview reaches under the navigation
    // bar and so would the pill. Nothing here is worth putting under a
    // gesture handle.
    ViewCompat.setOnApplyWindowInsetsListener(column) { view, insets ->
      val bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom
      view.setPadding(0, 0, 0, bottom)
      insets
    }
    return root
  }

  /** The colour the user chose, or the app's green if it did not arrive. */
  private fun accentColor(): Int {
    val raw = intent.getStringExtra(EXTRA_ACCENT)
    if (raw.isNullOrBlank()) return DEFAULT_ACCENT
    return try {
      Color.parseColor(raw)
    } catch (t: IllegalArgumentException) {
      DEFAULT_ACCENT
    }
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
    const val EXTRA_ACCENT = "accent"
    const val EXTRA_RESULT = "result"

    /** Mihrab's own green, for when JS sends nothing usable. */
    private const val DEFAULT_ACCENT = 0xFF0F5132.toInt()

    /** Told apart from a cancel so the user hears the right thing. */
    const val RESULT_NO_CAMERA = Activity.RESULT_FIRST_USER + 1

    private const val PERMISSION_REQUEST = 0x5147
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
  }
}

/**
 * The dimmed screen with a window in it, and four accent corners.
 *
 * Drawn rather than assembled from views: the shape is one rounded
 * rectangle and four arcs, and doing it in `onDraw` costs a path and two
 * paints instead of nine overlapping views measured on every frame.
 *
 * The window sits ABOVE centre, at 42% of the height. Centred looks
 * balanced on a mockup and wrong in the hand — the bottom third of a phone
 * held up is where the fingers and the button are, and a code framed there
 * is a code held at an angle.
 */
private class ViewfinderView(context: Context, accent: Int) : View(context) {

  private val scrim = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = 0xA6000000.toInt()
  }
  private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = 0x33FFFFFF
    strokeWidth = dp(1f)
  }
  private val bracket = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = accent
    strokeWidth = dp(4f)
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val window = RectF()
  private val corners = Path()

  init {
    // Nothing here is touchable; the cancel pill sits above it.
    isClickable = false
    isFocusable = false
  }

  override fun onSizeChanged(w: Int, h: Int, oldW: Int, oldH: Int) {
    super.onSizeChanged(w, h, oldW, oldH)
    val side = minOf(w, h) * 0.68f
    val cx = w / 2f
    val cy = h * 0.42f
    window.set(cx - side / 2f, cy - side / 2f, cx + side / 2f, cy + side / 2f)
    buildCorners(dp(22f), side * 0.16f)
  }

  private fun buildCorners(r: Float, arm: Float) {
    val l = window.left
    val t = window.top
    val rt = window.right
    val b = window.bottom
    corners.reset()

    corners.moveTo(l + r + arm, t)
    corners.lineTo(l + r, t)
    corners.arcTo(RectF(l, t, l + 2 * r, t + 2 * r), 270f, -90f)
    corners.lineTo(l, t + r + arm)

    corners.moveTo(rt - r - arm, t)
    corners.lineTo(rt - r, t)
    corners.arcTo(RectF(rt - 2 * r, t, rt, t + 2 * r), 270f, 90f)
    corners.lineTo(rt, t + r + arm)

    corners.moveTo(rt, b - r - arm)
    corners.lineTo(rt, b - r)
    corners.arcTo(RectF(rt - 2 * r, b - 2 * r, rt, b), 0f, 90f)
    corners.lineTo(rt - r - arm, b)

    corners.moveTo(l + r + arm, b)
    corners.lineTo(l + r, b)
    corners.arcTo(RectF(l, b - 2 * r, l + 2 * r, b), 90f, 90f)
    corners.lineTo(l, b - r - arm)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (window.isEmpty) return
    val w = width.toFloat()
    val h = height.toFloat()
    // Four rectangles around the hole rather than a cleared layer: no
    // off-screen buffer, no PorterDuff, and it composites the same.
    canvas.drawRect(0f, 0f, w, window.top, scrim)
    canvas.drawRect(0f, window.bottom, w, h, scrim)
    canvas.drawRect(0f, window.top, window.left, window.bottom, scrim)
    canvas.drawRect(window.right, window.top, w, window.bottom, scrim)

    val r = dp(22f)
    canvas.drawRoundRect(window, r, r, edge)
    canvas.drawPath(corners, bracket)
  }

  private fun dp(value: Float): Float = value * resources.displayMetrics.density
}
