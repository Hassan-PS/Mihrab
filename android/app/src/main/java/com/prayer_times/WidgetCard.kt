package com.prayer_times

import android.graphics.Color
import android.widget.RemoteViews

/**
 * Painting the card behind a widget's content.
 *
 * Every provider used to do this:
 *
 *     views.setInt(R.id.widget_root, "setBackgroundColor", argb)
 *
 * which is why the widgets were square-cornered slabs that ran edge to
 * edge. `View.setBackgroundColor` does not tint the existing background —
 * it REPLACES it with a plain `ColorDrawable` — so any rounded shape put
 * in the layout survived exactly until the first update, and there was
 * nothing to inset the paint from the host view. Two widgets in adjacent
 * cells therefore fused into one block, with a seam where their
 * translucent fills met. That is the bug this exists to remove.
 *
 * So the card is now an `ImageView` (`@id/widget_card`) drawing a rounded
 * white shape, inset inside `@id/widget_shell`, and it is recoloured
 * rather than replaced:
 *
 *   - `setColorFilter` applies SRC_ATOP. The source is opaque white, so
 *     the result is exactly the requested hue wherever the shape paints
 *     and nothing where it does not — which is what keeps the corners.
 *   - `setImageAlpha` then applies the opacity the user chose, because
 *     SRC_ATOP takes its alpha from the destination and would otherwise
 *     ignore it.
 *
 * Both are remotable `ImageView` methods from API 16, so there is no
 * version branch: `RemoteViews.setColorStateList` would have been tidier
 * but arrived in API 31 and this app supports 24.
 */
object WidgetCard {
  /**
   * @param argb the colour the user configured, alpha included. The alpha
   *   is split out and applied separately; passing it through the colour
   *   filter alone would let the white source show through.
   */
  fun paint(views: RemoteViews, argb: Int) {
    views.setInt(R.id.widget_card, "setColorFilter", argb or 0xFF000000.toInt())
    views.setInt(R.id.widget_card, "setImageAlpha", Color.alpha(argb))
  }
}
