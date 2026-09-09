package com.prayer_times

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * THE SKY BEHIND THE COUNTDOWN, FOR THE HOME SCREEN.
 *
 * A Kotlin port of `src/screens/home/skyModel.ts` — the same five passages
 * meeting at the same prayer times, the same colour keyframes, the same
 * moon in the same eight phases, the same rule for the ink — so the widget
 * on the home screen and the hero inside the app are one drawing. If the
 * keyframes change there they change here; the test `widgetSkyModel`
 * pins the two tables to each other.
 *
 * ── PASSAGES ──────────────────────────────────────────────────────────
 *
 *   Isha → Fajr      night: the moon crosses the open sky in its phase.
 *   Fajr → Sunrise   dawn: dark through rose and orange to first light.
 *   Sunrise → Asr    day: the sun climbs to its height about Dhuhr.
 *   Asr → Maghrib    sunset: deepening to red as the sun sinks.
 *   Maghrib → Isha   dusk: the afterglow darkens into night.
 *
 * Pure functions plus one `render`; the provider only hands it the day's
 * times and the card's size.
 */
object SkyWidgetPainter {
  enum class Passage { NIGHT, DAWN, DAY, SUNSET, DUSK }

  data class Moment(val passage: Passage, val t: Float)

  private data class Key(val t: Float, val top: Int, val bottom: Int)

  private val NIGHT_TOP = Color.parseColor("#0B1230")
  private val NIGHT_BOTTOM = Color.parseColor("#1E2B5A")

  private val KEYS: Map<Passage, List<Key>> = mapOf(
    Passage.NIGHT to listOf(
      Key(0f, NIGHT_TOP, NIGHT_BOTTOM),
      Key(1f, NIGHT_TOP, NIGHT_BOTTOM),
    ),
    Passage.DAWN to listOf(
      Key(0f, c("#0E1745"), c("#3B3163")),
      Key(0.45f, c("#2F4A8F"), c("#B85E7C")),
      Key(0.78f, c("#5A7FC8"), c("#F5924F")),
      Key(1f, c("#7FA6DC"), c("#FBC48A")),
    ),
    Passage.DAY to listOf(
      Key(0f, c("#6F9BD8"), c("#FBD7A8")),
      Key(0.5f, c("#3F8FE0"), c("#D6ECFF")),
      Key(1f, c("#5F9EDC"), c("#F3DFAE")),
    ),
    Passage.SUNSET to listOf(
      Key(0f, c("#5F9EDC"), c("#F3DFAE")),
      Key(0.5f, c("#6C7BC2"), c("#F7A45A")),
      Key(0.85f, c("#4B4A93"), c("#F0653A")),
      Key(1f, c("#2E3272"), c("#D25A55")),
    ),
    Passage.DUSK to listOf(
      Key(0f, c("#2E3272"), c("#D25A55")),
      Key(0.4f, c("#1C2260"), c("#8A4B72")),
      Key(1f, NIGHT_TOP, NIGHT_BOTTOM),
    ),
  )

  /** The glow of the sun or moon, per passage. */
  private val GLOW: Map<Passage, Int> = mapOf(
    Passage.NIGHT to c("#E6E9FF"),
    Passage.DAWN to c("#FFD9A0"),
    Passage.DAY to c("#FFF3C4"),
    Passage.SUNSET to c("#FFC27A"),
    Passage.DUSK to c("#F2B3A0"),
  )

  private fun c(hex: String): Int = Color.parseColor(hex)

  // ── Where in the day ────────────────────────────────────────────────

  /**
   * Which passage the clock is in and how far through it. Times are
   * minutes since local midnight, or null when the row is absent; `now`
   * likewise. Mirrors `skyMoment` exactly, including the two rules the
   * app learnt the hard way: a missing Sunrise is a dawn of an hour and a
   * half, not "no timings"; an Isha earlier than Maghrib on the clock has
   * crossed midnight and belongs to the next day.
   */
  fun moment(
    fajr: Int?,
    sunrise: Int?,
    asr: Int?,
    maghrib: Int?,
    isha: Int?,
    tomorrowFajr: Int?,
    nowMinutes: Int,
  ): Moment {
    if (fajr == null || asr == null || maghrib == null || isha == null) {
      return Moment(Passage.DAY, 0.5f)
    }
    val day = 24 * 60
    val n = nowMinutes
    val wrapped = isha < maghrib
    val ishaAt = if (wrapped) isha + day else isha
    val sunriseAt = sunrise ?: (fajr + 90)
    fun frac(a: Int, b: Int): Float =
      if (b > a) ((n - a).toFloat() / (b - a)).coerceIn(0f, 1f) else 0f
    if (n < fajr) {
      if (wrapped && n < isha) return Moment(Passage.DUSK, frac(maghrib - day, isha))
      val from = if (wrapped) isha else ishaAt - day
      return Moment(Passage.NIGHT, frac(from, fajr))
    }
    if (n < sunriseAt) return Moment(Passage.DAWN, frac(fajr, sunriseAt))
    if (n < asr) return Moment(Passage.DAY, frac(sunriseAt, asr))
    if (n < maghrib) return Moment(Passage.SUNSET, frac(asr, maghrib))
    if (n < ishaAt) return Moment(Passage.DUSK, frac(maghrib, ishaAt))
    val end = if (tomorrowFajr != null) tomorrowFajr + day else fajr + day
    return Moment(Passage.NIGHT, frac(ishaAt, end))
  }

  /** "HH:mm" → minutes since midnight, or null. */
  fun minutesOf(time: String?): Int? {
    if (time.isNullOrBlank()) return null
    val parts = time.trim().split(":")
    if (parts.size < 2) return null
    val h = parts[0].trim().toIntOrNull() ?: return null
    val m = parts[1].trim().take(2).toIntOrNull() ?: return null
    if (h !in 0..23 || m !in 0..59) return null
    return h * 60 + m
  }

  // ── Colour arithmetic ───────────────────────────────────────────────

  fun mix(a: Int, b: Int, t: Float): Int {
    val k = t.coerceIn(0f, 1f)
    fun ch(x: Int, y: Int) = (x + (y - x) * k).roundToInt().coerceIn(0, 255)
    return Color.rgb(
      ch(Color.red(a), Color.red(b)),
      ch(Color.green(a), Color.green(b)),
      ch(Color.blue(a), Color.blue(b)),
    )
  }

  /** WCAG relative luminance. */
  fun luminance(color: Int): Double {
    fun lin(v: Int): Double {
      val s = v / 255.0
      return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin(Color.red(color)) + 0.7152 * lin(Color.green(color)) + 0.0722 * lin(Color.blue(color))
  }

  /** The luminance at which white and black both clear AA — see skyModel. */
  const val INK_SWITCH_LUMINANCE = 0.18

  data class Frame(
    val passage: Passage,
    val t: Float,
    val top: Int,
    val bottom: Int,
    val glow: Int,
    /** 0–1, how visible the stars are. */
    val stars: Float,
    /** 'none' | 'sun' | 'moon' */
    val body: String,
    /** Body centre, as fractions of the card. y is the MODEL's 0.08–0.3. */
    val bodyX: Float,
    val bodyY: Float,
    val bodyAlpha: Float,
    /** Moon only: 0 new … 4 full … 7 waning crescent. */
    val phase: Int,
    /** Moon only: lit fraction of the disc. */
    val lit: Float,
  )

  private fun keyed(keys: List<Key>, t: Float): Pair<Int, Int> {
    val k = t.coerceIn(0f, 1f)
    for (i in 1 until keys.size) {
      if (k <= keys[i].t) {
        val a = keys[i - 1]
        val b = keys[i]
        val span = (b.t - a.t).let { if (it == 0f) 1f else it }
        val u = (k - a.t) / span
        return Pair(mix(a.top, b.top, u), mix(a.bottom, b.bottom, u))
      }
    }
    val last = keys.last()
    return Pair(last.top, last.bottom)
  }

  private const val X0 = 0.3f
  private const val X1 = 0.66f
  private const val Y_LOW = 0.26f
  private const val Y_HIGH = 0.08f

  /** Reference new moon 2000-01-06 18:14 UTC; the mean synodic month. */
  private const val NEW_MOON_EPOCH_MS = 947182440000L
  private const val SYNODIC_DAYS = 29.530588853

  fun moonPhase(nowMs: Long): Int {
    val days = (nowMs - NEW_MOON_EPOCH_MS) / 86_400_000.0
    var f = (days / SYNODIC_DAYS) % 1.0
    if (f < 0) f += 1.0
    return ((f * 8).roundToInt()) % 8
  }

  fun frame(moment: Moment, nowMs: Long): Frame {
    val (top, bottom) = keyed(KEYS.getValue(moment.passage), moment.t)
    val t = moment.t
    val x = X0 + t * (X1 - X0)
    var stars = 0f
    var body = "none"
    var y = 0f
    var alpha = 1f
    var phase = 0
    var lit = 0f
    when (moment.passage) {
      Passage.NIGHT -> {
        stars = 1f
        phase = moonPhase(nowMs)
        lit = ((1 - cos(2 * PI * phase / 8)) / 2).toFloat()
        body = "moon"
        y = 0.22f - sin(t * PI).toFloat() * 0.1f
      }
      Passage.DAWN -> {
        stars = max(0f, 1f - t / 0.5f)
        val rise = max(0f, (t - 0.6f) / 0.4f)
        if (rise > 0f) {
          body = "sun"
          y = Y_LOW + 0.02f - rise * 0.02f
          alpha = min(1f, rise * 1.5f)
        }
      }
      Passage.DAY -> {
        body = "sun"
        y = Y_LOW - sin(t * PI).toFloat() * (Y_LOW - Y_HIGH)
      }
      Passage.SUNSET -> {
        body = "sun"
        y = 0.16f + t * (Y_LOW + 0.02f - 0.16f)
        alpha = if (t < 0.9f) 1f else max(0f, 1f - (t - 0.9f) / 0.1f)
      }
      Passage.DUSK -> {
        stars = max(0f, (t - 0.4f) / 0.6f)
      }
    }
    return Frame(moment.passage, t, top, bottom, GLOW.getValue(moment.passage), stars, body, x, y, alpha, phase, lit)
  }

  /** The sky's colour at a fraction of the card's height. */
  fun colorAt(frame: Frame, y: Float): Int = mix(frame.top, frame.bottom, y)

  /** Pure white or pure black — whichever clears AA on the sky at `y`. */
  fun inkAt(frame: Frame, y: Float): Int =
    if (luminance(colorAt(frame, y)) < INK_SWITCH_LUMINANCE) Color.WHITE else Color.BLACK

  /** The muted ink beside it, 78% / 66% as the hero has it. */
  fun mutedInkAt(frame: Frame, y: Float): Int =
    if (inkAt(frame, y) == Color.WHITE) Color.argb(199, 255, 255, 255) else Color.argb(168, 0, 0, 0)

  // ── The drawing ─────────────────────────────────────────────────────

  /** The same fixed, sparse star field the hero draws: x%, y%, radius dp. */
  private val STARS = arrayOf(
    floatArrayOf(6f, 30f, 1.2f),
    floatArrayOf(16f, 12f, 0.9f),
    floatArrayOf(27f, 34f, 1.0f),
    floatArrayOf(44f, 8f, 1.1f),
    floatArrayOf(56f, 26f, 0.9f),
    floatArrayOf(66f, 40f, 1.2f),
    floatArrayOf(78f, 14f, 0.8f),
  )

  /** The moon's diameter and the sun's radius, dp — the hero's numbers. */
  const val MOON_DP = 22f
  const val SUN_R_DP = 9f

  /**
   * Draw the sky into a bitmap of the card's size.
   *
   * `sceneTopPx`/`sceneBottomPx` are the bands the bodies keep out of —
   * the location line above, the countdown block below — exactly as the
   * hero's `skyScene` has them: the model's 0.08–0.3 becomes the room
   * between the bands less half a moon at each edge, and a room under
   * 40dp draws no body at all.
   */
  fun render(
    widthPx: Int,
    heightPx: Int,
    density: Float,
    radiusPx: Float,
    frame: Frame,
    sceneTopPx: Float,
    sceneBottomPx: Float,
  ): Bitmap {
    val w = max(1, widthPx)
    val h = max(1, heightPx)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val rect = RectF(0f, 0f, w.toFloat(), h.toFloat())
    val clip = Path().apply { addRoundRect(rect, radiusPx, radiusPx, Path.Direction.CW) }
    canvas.clipPath(clip)

    val sky = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = LinearGradient(0f, 0f, 0f, h.toFloat(), frame.top, frame.bottom, Shader.TileMode.CLAMP)
    }
    canvas.drawRect(rect, sky)

    val room = h - sceneTopPx - sceneBottomPx
    val cramped = room < 40f * density
    val margin = MOON_DP * density / 2f
    val inner = max(0f, room - 2 * margin)
    fun sceneY(fraction: Float): Float {
      val spread = ((fraction - 0.08f) / 0.22f).coerceIn(0f, 1f)
      return sceneTopPx + margin + spread * inner
    }

    if (!cramped && frame.stars > 0f) {
      val star = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = frame.glow
        alpha = (255 * 0.85f * frame.stars).roundToInt().coerceIn(0, 255)
      }
      for (s in STARS) {
        canvas.drawCircle(w * s[0] / 100f, sceneY(s[1] / 100f), s[2] * density, star)
      }
    }

    if (!cramped && frame.body != "none") {
      val cx = w * frame.bodyX
      val cy = sceneY(frame.bodyY)
      // The glow: a soft radial disc, its strength following the body.
      val glowAlpha = when (frame.body) {
        "sun" -> 0.65f * frame.bodyAlpha
        else -> 0.12f + 0.4f * frame.lit
      }
      val glowR = min(w, h) * 0.26f
      val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = RadialGradient(
          cx, cy, max(1f, glowR),
          intArrayOf(withAlpha(frame.glow, glowAlpha), withAlpha(frame.glow, 0f)),
          floatArrayOf(0f, 1f),
          Shader.TileMode.CLAMP,
        )
      }
      canvas.drawCircle(cx, cy, glowR, glow)

      if (frame.body == "sun") {
        val sun = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = frame.glow
          alpha = (255 * frame.bodyAlpha).roundToInt().coerceIn(0, 255)
        }
        canvas.drawCircle(cx, cy, SUN_R_DP * density, sun)
      } else {
        drawMoon(canvas, cx, cy, MOON_DP * density / 2f, frame.phase, frame.glow, frame.top)
      }
    }
    return bmp
  }

  private fun withAlpha(color: Int, alpha: Float): Int =
    Color.argb((255 * alpha.coerceIn(0f, 1f)).roundToInt(), Color.red(color), Color.green(color), Color.blue(color))

  /**
   * The moon in one of its eight phases: a lit disc with the shadow laid
   * over it as a half-disc plus a terminator ellipse — the way the hero's
   * `moonShadowPath` draws it. Phase 0 is a new moon: a faint full disc.
   */
  private fun drawMoon(canvas: Canvas, cx: Float, cy: Float, r: Float, phase: Int, lit: Int, shadow: Int) {
    val litPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = lit }
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = shadow }
    if (phase == 0) {
      litPaint.alpha = (255 * 0.18f).roundToInt()
      canvas.drawCircle(cx, cy, r, litPaint)
      return
    }
    if (phase == 4) {
      canvas.drawCircle(cx, cy, r, litPaint)
      return
    }
    canvas.drawCircle(cx, cy, r, litPaint)
    // f: 0 new → 0.5 full → 1 new again. The terminator's half-width is
    // |cos 2πf| of the radius; waxing phases (1–3) light the right side of
    // the disc, waning (5–7) the left.
    val f = phase / 8f
    val waxing = phase < 4
    val lessThanHalfLit = (waxing && phase < 2) || (!waxing && phase > 6)
    val a = abs(cos(2 * PI * f)).toFloat() * r
    val litSide = if (waxing) 1f else -1f
    // Shadow half: the side away from the light.
    val half = Path().apply {
      addRect(
        if (litSide > 0) cx - r else cx,
        cy - r,
        if (litSide > 0) cx else cx + r,
        cy + r,
        Path.Direction.CW,
      )
    }
    canvas.save()
    canvas.clipPath(Path().apply { addCircle(cx, cy, r, Path.Direction.CW) })
    canvas.drawPath(half, shadowPaint)
    val ellipse = RectF(cx - a, cy - r, cx + a, cy + r)
    if (lessThanHalfLit) {
      // Crescent: the terminator bulges INTO the lit side, in shadow.
      canvas.drawOval(ellipse, shadowPaint)
    } else {
      // Gibbous: the terminator bulges into the shadow side, lit.
      canvas.drawOval(ellipse, litPaint)
    }
    canvas.restore()
  }
}
