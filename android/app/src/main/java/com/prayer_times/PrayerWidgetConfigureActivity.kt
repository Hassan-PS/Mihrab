package com.prayer_times

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.RadioGroup
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

/**
 * Shown when the user adds the widget or opens “Settings” from the widget’s long-press menu.
 * Writes the same SharedPreferences keys the app and [PrayerWidgetProvider] use.
 */
class PrayerWidgetConfigureActivity : AppCompatActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val appWidgetId =
      intent?.extras?.getInt(
        AppWidgetManager.EXTRA_APPWIDGET_ID,
        AppWidgetManager.INVALID_APPWIDGET_ID,
      ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    setResult(RESULT_CANCELED)
    setContentView(R.layout.activity_prayer_widget_configure)

    supportActionBar?.apply {
      setTitle(R.string.widget_configure_title)
      setDisplayHomeAsUpEnabled(true)
    }

    val prefs = getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val opacityStored =
      prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88).coerceIn(20, 100)
    val highlightRaw =
      prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, "green")?.trim()
    val highlightId = if (highlightRaw.isNullOrEmpty()) "green" else highlightRaw
    val storedHex =
      prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, "")?.trim()
        ?: ""
    val dynamicStored =
      prefs.getBoolean(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC, false)

    val seek = findViewById<SeekBar>(R.id.widget_configure_opacity_seek)
    val opacityLabel = findViewById<TextView>(R.id.widget_configure_opacity_value)
    seek.max = 80
    seek.progress = opacityStored - 20

    fun updateOpacityLabel() {
      val v = seek.progress + 20
      opacityLabel.text = getString(R.string.widget_configure_opacity_percent, v)
    }
    updateOpacityLabel()
    seek.setOnSeekBarChangeListener(
      object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(
          sb: SeekBar?,
          progress: Int,
          fromUser: Boolean,
        ) {
          updateOpacityLabel()
        }

        override fun onStartTrackingTouch(sb: SeekBar?) {}

        override fun onStopTrackingTouch(sb: SeekBar?) {}
      },
    )

    val radioGroup = findViewById<RadioGroup>(R.id.widget_configure_highlight_group)
    val hexLayout = findViewById<TextInputLayout>(R.id.widget_configure_hex_layout)
    val hexInput = findViewById<TextInputEditText>(R.id.widget_configure_hex_input)

    val radioId =
      when (highlightId.lowercase()) {
        "teal" -> R.id.widget_configure_highlight_teal
        "blue" -> R.id.widget_configure_highlight_blue
        "amber" -> R.id.widget_configure_highlight_amber
        "custom" -> R.id.widget_configure_highlight_custom
        else -> R.id.widget_configure_highlight_green
      }
    radioGroup.check(radioId)

    fun syncHexVisibility() {
      val custom = radioGroup.checkedRadioButtonId == R.id.widget_configure_highlight_custom
      hexLayout.visibility = if (custom) View.VISIBLE else View.GONE
    }
    hexInput.setText(
      if (storedHex.matches(Regex("^#([0-9A-Fa-f]{6})$"))) {
        storedHex
      } else {
        "#6BC98A"
      },
    )
    syncHexVisibility()
    radioGroup.setOnCheckedChangeListener { _, _ -> syncHexVisibility() }

    findViewById<MaterialButton>(R.id.widget_configure_save).setOnClickListener {
      val checked = radioGroup.checkedRadioButtonId
      val hid =
        when (checked) {
          R.id.widget_configure_highlight_teal -> "teal"
          R.id.widget_configure_highlight_blue -> "blue"
          R.id.widget_configure_highlight_amber -> "amber"
          R.id.widget_configure_highlight_custom -> "custom"
          else -> "green"
        }
      val hexForStore =
        if (hid == "custom") {
          val raw = hexInput.text?.toString()?.trim() ?: ""
          if (raw.matches(Regex("^#([0-9A-Fa-f]{6})$"))) {
            raw
          } else {
            "#6BC98A"
          }
        } else {
          ""
        }

      prefs
        .edit()
        .putInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, seek.progress + 20)
        .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, hid)
        .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, hexForStore)
        .putBoolean(
          PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC,
          dynamicStored,
        )
        .apply()

      val updateIntent =
        Intent(this, PrayerWidgetProvider::class.java).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
        }
      sendBroadcast(updateIntent)

      setResult(
        RESULT_OK,
        Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId),
      )
      finish()
    }
  }

  override fun onOptionsItemSelected(item: MenuItem): Boolean {
    if (item.itemId == android.R.id.home) {
      finish()
      return true
    }
    return super.onOptionsItemSelected(item)
  }
}
