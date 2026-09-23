package com.prayer_times

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/** `MushafLine` to JS — see `src/quran/native/MushafLineView.ts` for the props. */
class MushafLineViewManager : SimpleViewManager<MushafLineView>() {
  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): MushafLineView =
    MushafLineView(context)

  @ReactProp(name = "fontFamily")
  fun setFontFamily(view: MushafLineView, value: String?) {
    view.fontFamily = value ?: ""
  }

  @ReactProp(name = "fontSize", defaultFloat = 0f)
  fun setFontSize(view: MushafLineView, value: Float) {
    view.fontSize = value
  }

  @ReactProp(name = "color", customType = "Color")
  fun setColor(view: MushafLineView, value: Int?) {
    view.color = value ?: -0x1000000
  }

  @ReactProp(name = "runs")
  fun setRuns(view: MushafLineView, value: ReadableArray?) {
    view.runs = value
  }

  @ReactProp(name = "penRight", defaultFloat = 0f)
  fun setPenRight(view: MushafLineView, value: Float) {
    view.penRight = value
  }

  @ReactProp(name = "penBaseline", defaultFloat = 0f)
  fun setPenBaseline(view: MushafLineView, value: Float) {
    view.penBaseline = value
  }

  @ReactProp(name = "boxTop", defaultFloat = 0f)
  fun setBoxTop(view: MushafLineView, value: Float) {
    view.boxTop = value
  }

  @ReactProp(name = "boxHeight", defaultFloat = 0f)
  fun setBoxHeight(view: MushafLineView, value: Float) {
    view.boxHeight = value
  }

  companion object {
    const val NAME = "MushafLine"
  }
}
