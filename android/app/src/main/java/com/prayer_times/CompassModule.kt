package com.prayer_times

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import android.view.Surface
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The Android half of the Qibla compass.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * iOS has had a native `CompassModule` since the compass was written:
 * CoreLocation hands over a heading that is already corrected to TRUE
 * north and already fused across the device's sensors. Android had
 * nothing of the kind. It subscribed to `react-native-sensors`'
 * magnetometer and computed
 *
 *     atan2(-x, y)
 *
 * which is a heading only while the phone is lying flat. Tilt it — which
 * is how anyone actually holds a phone they are reading a dial off — and
 * the horizontal components are projections of a vector that is no longer
 * horizontal, so the answer drifts with pitch and roll. It was also
 * MAGNETIC north with no declination applied, which in Morocco is about
 * 1° west, in Sweden about 7° east, and in parts of Alaska over 20°. A
 * Qibla arrow is exactly the case where that matters: the whole point is
 * a direction, and the error is silent.
 *
 * ── WHAT IT DOES INSTEAD ──────────────────────────────────────────────
 *
 * The approach Kr0oked/Compass takes, which was the reference asked for.
 * Its `MathUtils.calculateAzimuth` and `MainActivity` were read to confirm
 * the sequence and the axis table below match; no code was copied — that
 * project is GPL-3.0 and this one AGPL-3.0-or-later, which are compatible,
 * but the steps here are the platform's own documented recipe rather than
 * anyone's expression of it.
 * https://github.com/Kr0oked/Compass
 *
 *   1. TYPE_ROTATION_VECTOR — the fused orientation the platform already
 *      computes from accelerometer, magnetometer and, where present,
 *      gyroscope. Falling back to raw accelerometer + magnetic field only
 *      where no rotation vector exists.
 *   2. getRotationMatrixFromVector, then remapCoordinateSystem for the
 *      CURRENT display rotation — without this the reading is 90° out in
 *      landscape, and this app allows landscape.
 *   3. getOrientation, whose first component is the azimuth from MAGNETIC
 *      north.
 *   4. GeomagneticField for the user's own coordinates, whose declination
 *      is ADDED to the magnetic azimuth to give TRUE north — the same
 *      frame `qiblaBearingFrom` computes the Qibla in. Mixing the two
 *      would put the arrow off by the local declination and look
 *      entirely plausible.
 *
 * One deliberate divergence from the reference: it samples the rotation
 * vector at SENSOR_DELAY_FASTEST, which suits an app whose only job is the
 * compass. This one is a prayer app that has already had a compass left
 * running in someone's pocket (docs/design/background-power.md), so it
 * samples at SENSOR_DELAY_GAME — 20 ms, far finer than a dial can show.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────
 *
 * Deliberately identical to the iOS module: a `CompassHeading` event
 * carrying `{ heading, accuracy }`, heading in degrees clockwise from
 * true north, accuracy in degrees with NEGATIVE meaning "do not trust
 * this" — the convention CoreLocation uses and the JS side already
 * branches on. Android reports accuracy as one of four buckets rather
 * than a number, so they are mapped onto representative degree values;
 * the JS scoring reads them the same way it reads CoreLocation's.
 */
class CompassModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), SensorEventListener {

  override fun getName(): String = "CompassModule"

  private val sensorManager: SensorManager? =
    reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  /** Reused across events: allocating these per sample would churn the heap at 50 Hz. */
  private val rotationMatrix = FloatArray(9)
  private val remapped = FloatArray(9)
  private val orientation = FloatArray(3)
  private val gravity = FloatArray(3)
  private val geomagnetic = FloatArray(3)
  private var haveGravity = false
  private var haveGeomagnetic = false

  /**
   * Degrees to add to a magnetic azimuth to get a true one, for the
   * user's coordinates. Zero until `startUpdates` is told where we are —
   * which is honest rather than convenient: with no location there is no
   * declination to apply, and the reading is magnetic north.
   */
  private var declination = 0f

  private var listening = false
  private var usingRotationVector = false
  private var accuracyDegrees = ACCURACY_UNKNOWN

  @ReactMethod
  fun startUpdates(latitude: Double, longitude: Double) {
    val manager = sensorManager ?: return
    stopUpdates()

    declination =
      if (latitude.isFinite() && longitude.isFinite() && (latitude != 0.0 || longitude != 0.0)) {
        GeomagneticField(
          latitude.toFloat(),
          longitude.toFloat(),
          0f,
          System.currentTimeMillis(),
        ).declination
      } else {
        0f
      }

    val rotationVector = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    if (rotationVector != null) {
      manager.registerListener(this, rotationVector, SensorManager.SENSOR_DELAY_GAME)
      // The magnetometer as well, and NOT for its readings — the rotation
      // vector supplies those. It is registered for its ACCURACY: the
      // fused sensor reports its own, which says nothing about whether
      // the magnetic field is being distorted, and distortion is the
      // whole reason a compass ever needs recalibrating. Slow rate,
      // because an accuracy bucket does not change at 50 Hz.
      manager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let {
        manager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
      }
      usingRotationVector = true
      listening = true
      return
    }

    // No fused orientation on this device. Accelerometer + magnetometer
    // still gives a tilt-corrected heading through getRotationMatrix; it
    // is noisier, not wrong. A device with neither reports nothing, and
    // the JS side's startup timeout turns that into "unsupported".
    val accelerometer = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    val magnetometer = manager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    if (accelerometer != null && magnetometer != null) {
      manager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME)
      manager.registerListener(this, magnetometer, SensorManager.SENSOR_DELAY_GAME)
      usingRotationVector = false
      listening = true
    }
  }

  @ReactMethod
  fun stopUpdates() {
    if (!listening) return
    sensorManager?.unregisterListener(this)
    listening = false
    usingRotationVector = false
    haveGravity = false
    haveGeomagnetic = false
    accuracyDegrees = ACCURACY_UNKNOWN
  }

  /** Required by NativeEventEmitter; the work is done by the sensor listener. */
  @ReactMethod
  fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) = Unit

  @ReactMethod
  fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) = Unit

  override fun onSensorChanged(event: SensorEvent) {
    when (event.sensor.type) {
      Sensor.TYPE_ROTATION_VECTOR -> {
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        emitHeading()
      }
      Sensor.TYPE_ACCELEROMETER -> {
        System.arraycopy(event.values, 0, gravity, 0, 3)
        haveGravity = true
        if (haveGeomagnetic) emitFromRawPair()
      }
      Sensor.TYPE_MAGNETIC_FIELD -> {
        // Only a heading source on the fallback path. With a rotation
        // vector registered this sensor is here for onAccuracyChanged
        // alone, and its raw values are ignored.
        if (usingRotationVector) return
        System.arraycopy(event.values, 0, geomagnetic, 0, 3)
        haveGeomagnetic = true
        if (haveGravity) emitFromRawPair()
      }
      else -> Unit
    }
  }

  private fun emitFromRawPair() {
    if (!SensorManager.getRotationMatrix(rotationMatrix, null, gravity, geomagnetic)) return
    emitHeading()
  }

  private fun emitHeading() {
    // Remap for how the display is actually turned. Skipping this is the
    // classic 90°-in-landscape compass bug.
    val (axisX, axisY) = when (displayRotation()) {
      Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
      Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
      Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
      else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
    }
    if (!SensorManager.remapCoordinateSystem(rotationMatrix, axisX, axisY, remapped)) return

    SensorManager.getOrientation(remapped, orientation)
    val magneticAzimuth = Math.toDegrees(orientation[0].toDouble())
    val trueHeading = normalize(magneticAzimuth + declination)

    val payload = Arguments.createMap().apply {
      putDouble("heading", trueHeading)
      putDouble("accuracy", accuracyDegrees.toDouble())
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("CompassHeading", payload)
  }

  /**
   * Which way the display is turned.
   *
   * Deliberately NOT `reactApplicationContext.display`. That throws
   * `UnsupportedOperationException` — "Tried to obtain display from a
   * Context not associated with one" — because a React application
   * context is not a visual context, and it throws on the sensor
   * callback thread, which took the whole app down the first time the
   * compass was opened. Only an Activity is a visual context; when there
   * is not one (backgrounded mid-reading), DisplayManager's default
   * display is the right answer and cannot throw.
   */
  private fun displayRotation(): Int {
    val activity = reactApplicationContext.currentActivity
    val display: Display? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        activity?.display
          ?: (reactApplicationContext.getSystemService(Context.DISPLAY_SERVICE)
            as? DisplayManager)?.getDisplay(Display.DEFAULT_DISPLAY)
      } else {
        @Suppress("DEPRECATION")
        (activity?.windowManager
          ?: reactApplicationContext.getSystemService(Context.WINDOW_SERVICE)
            as? WindowManager)?.defaultDisplay
      }
    return display?.rotation ?: Surface.ROTATION_0
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    // ONLY the magnetometer's. The accelerometer's accuracy is unrelated,
    // and the fused rotation vector reports an accuracy of its own that
    // stays high while the magnetic field around it is being distorted by
    // a speaker magnet or a car door — which is exactly the case the
    // calibration prompt exists for.
    if (sensor?.type != Sensor.TYPE_MAGNETIC_FIELD) return
    accuracyDegrees = when (accuracy) {
      SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> 5
      SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> 15
      SensorManager.SENSOR_STATUS_ACCURACY_LOW -> 30
      // UNRELIABLE and NO_CONTACT both mean "this needs calibrating".
      // Negative is the iOS module's word for that, and the JS side
      // already shows the figure-of-eight prompt when it sees one.
      else -> ACCURACY_UNRELIABLE
    }
  }

  override fun onCatalystInstanceDestroy() {
    stopUpdates()
  }

  override fun invalidate() {
    stopUpdates()
    super.invalidate()
  }

  private fun normalize(degrees: Double): Double {
    val d = degrees % 360.0
    return if (d < 0) d + 360.0 else d
  }

  private companion object {
    /** Before the first onAccuracyChanged. Treated as "fine" rather than "broken". */
    const val ACCURACY_UNKNOWN = 15

    /** Negative == invalid, the convention CoreLocation uses and JS reads. */
    const val ACCURACY_UNRELIABLE = -1
  }
}
