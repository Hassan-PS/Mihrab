package com.prayer_times

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.SecureRandom

/**
 * Cryptographically secure random bytes, for the sync keypair.
 *
 * WHY THIS EXISTS AT ALL. React Native ships no WebCrypto — there is no
 * `crypto.getRandomValues` in Hermes — and `Math.random` is a PRNG seeded
 * from things that are often guessable. A keypair generated from
 * `Math.random` is not a weak keypair, it is a public one, so this is not a
 * corner that can be cut with something plausible-looking.
 *
 * WHY NOT A LIBRARY. `react-native-get-random-values` does this in about
 * forty lines of native code. Taking it means an entry in node_modules,
 * which means another `scanignore` line in the F-Droid recipe, which since
 * the merge lives in `fdroiddata` and needs a fresh MR and a review. App
 * source needs none of that, and this app already carries eight hand-written
 * native modules.
 *
 * ONE INSTANCE, NOT ONE PER CALL. `SecureRandom()` seeds itself on
 * construction, and on Android that can block on the entropy pool the first
 * time. Holding one and reusing it keeps the cost to the first call of the
 * process rather than paying it per keypair — and reusing a properly seeded
 * CSPRNG is exactly what it is designed for.
 *
 * NO `setSeed`. It is tempting to stir in the clock or a device id for
 * "extra" entropy; on Android that is at best useless and was historically
 * harmful, since some implementations REPLACED the seed rather than mixing.
 * The platform default is seeded from the kernel and is the right answer.
 */
class SecureRandomModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val random by lazy { SecureRandom() }

  override fun getName(): String = NAME

  /**
   * `count` random bytes, base64-encoded.
   *
   * Base64 because the bridge has no byte-array type and an array of numbers
   * would be one JSON element per byte. NO_WRAP because the default inserts
   * newlines at 76 characters, which turns a 32-byte value into a string the
   * JS side has to remember to strip.
   *
   * Rejects rather than substituting a weaker source if anything fails: the
   * caller is generating an identity and is entitled to know it could not be
   * done properly, rather than to receive something that looks the same.
   */
  @ReactMethod
  fun bytes(count: Int, promise: Promise) {
    if (count <= 0 || count > MAX_BYTES) {
      promise.reject("bad_count", "asked for $count bytes, which is outside 1..$MAX_BYTES")
      return
    }
    try {
      val out = ByteArray(count)
      random.nextBytes(out)
      promise.resolve(Base64.encodeToString(out, Base64.NO_WRAP))
    } catch (t: Throwable) {
      promise.reject("unavailable", "SecureRandom failed", t)
    }
  }

  companion object {
    const val NAME = "SecureRandom"

    /** Far more than a keypair needs; a bound so a bug cannot ask for a gigabyte. */
    private const val MAX_BYTES = 4096
  }
}
