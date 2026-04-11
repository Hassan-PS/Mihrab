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

RCT_EXPORT_METHOD(setUiHints:(NSString *)style
                  oledBackground:(BOOL)oled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group =
      [[NSUserDefaults alloc] initWithSuiteName:@"group.com.prayerapp"];
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  [target setObject:(style != nil ? style : @"fixed") forKey:@"widget_ui_style"];
  [target setBool:oled forKey:@"widget_oled"];
  [target synchronize];
  if (@available(iOS 14.0, *)) {
    [[WidgetCenter sharedWidgetCenter] reloadAllTimelines];
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(setWidgetHighlightDynamic:(BOOL)enabled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group =
      [[NSUserDefaults alloc] initWithSuiteName:@"group.com.prayerapp"];
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  [target setBool:enabled forKey:@"widget_highlight_dynamic"];
  [target synchronize];
  if (@available(iOS 14.0, *)) {
    [[WidgetCenter sharedWidgetCenter] reloadAllTimelines];
  }
  resolve(nil);
}

@end
