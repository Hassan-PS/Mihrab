import Foundation
import WidgetKit

@objc final class WidgetTimelineReloader: NSObject {
  @objc static func reloadAllTimelinesIfAvailable() {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
