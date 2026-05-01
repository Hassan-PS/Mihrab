const fs = require('fs');
const path = 'android/app/src/main/java/com/prayer_times/PrayerWidgetProvider.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
`      if (json.isNullOrBlank()) {
        showMessageOnly(views, context.getString(R.string.widget_placeholder_day), isError = false, style)
      } else {
        try {
          applyJson(views, json, style, context, isHorizontal)
        } catch (_: Exception) {`,
`      if (json.isNullOrBlank()) {
        showMessageOnly(views, context.getString(R.string.widget_placeholder_day), isError = false, style)
      } else {
        try {
          val isHorizontal = layoutId == R.layout.prayer_widget_horizontal
          applyJson(views, json, style, context, isHorizontal)
        } catch (_: Exception) {`
);

fs.writeFileSync(path, content);
