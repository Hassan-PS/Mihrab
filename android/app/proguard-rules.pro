# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in proguard-android.txt.  You can edit the include path and order by
# changing the proguardFiles directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ── React Native ──────────────────────────────────────────────────────────────
# Keep all JS-accessible RN modules and the RN bridge infrastructure.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ── App native modules ────────────────────────────────────────────────────────
-keep class com.prayer_times.** { *; }

# ── notifee ───────────────────────────────────────────────────────────────────
-keep class io.invertase.notifee.** { *; }
-dontwarn io.invertase.notifee.**

# ── react-native-sensors ──────────────────────────────────────────────────────
-keep class com.sensors.** { *; }
-dontwarn com.sensors.**

# ── react-native-share ────────────────────────────────────────────────────────
-keep class cl.json.** { *; }
-dontwarn cl.json.**

# ── react-native-svg ─────────────────────────────────────────────────────────
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**

# ── adhan (pure-JS, no native classes — kept for completeness) ────────────────
# Nothing to keep; adhan runs in the JS bundle via Hermes.

# ── Kotlin / coroutines ───────────────────────────────────────────────────────
-keep class kotlin.** { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.**

# ── Gson / JSON (used by some RN bridges) ────────────────────────────────────
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# ── OkHttp / Okio (networking) ───────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**

# ── General Android safety rules ─────────────────────────────────────────────
# Preserve line numbers in stack traces for crash reporting.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
