#import <React/RCTBridgeModule.h>

@import WidgetKit;

@interface PrayerWidget : NSObject <RCTBridgeModule>
@end

@implementation PrayerWidget

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

RCT_EXPORT_METHOD(setData
                  : (NSString *)json resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group =
      [[NSUserDefaults alloc] initWithSuiteName:@"group.com.prayerapp"];
  if (group != nil) {
    [group setObject:json forKey:@"prayer_widget_payload_v1"];
  } else {
    [[NSUserDefaults standardUserDefaults] setObject:json
                                                forKey:@"prayer_widget_payload_v1"];
  }
  if (@available(iOS 14.0, *)) {
    [[WidgetCenter sharedWidgetCenter] reloadAllTimelines];
  }
  resolve(nil);
}

@end
