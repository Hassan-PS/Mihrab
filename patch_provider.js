const fs = require('fs');
const path = 'android/app/src/main/java/com/prayer_times/PrayerWidgetProvider.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
`      val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
      val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
      val isHorizontal = minHeight > 0 && minHeight < 100
      
      val providerName = appWidgetManager.getAppWidgetInfo(appWidgetId)?.provider?.className
      val isSmall = providerName == PrayerWidgetSmallProvider::class.java.name
      
      val layoutId = if (isSmall) {
        R.layout.prayer_widget_small
      } else if (isHorizontal) {
        R.layout.prayer_widget_horizontal
      } else {
        R.layout.prayer_widget
      }`,
`      val providerName = appWidgetManager.getAppWidgetInfo(appWidgetId)?.provider?.className
      val isSmall = providerName == PrayerWidgetSmallProvider::class.java.name
      val isLarge = providerName == PrayerWidgetLargeProvider::class.java.name
      
      val layoutId = if (isSmall) {
        R.layout.prayer_widget_small
      } else if (isLarge) {
        R.layout.prayer_widget
      } else {
        R.layout.prayer_widget_horizontal
      }`
);

fs.writeFileSync(path, content);
