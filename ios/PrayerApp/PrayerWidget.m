#import <React/RCTBridgeModule.h>

#import "PrayerApp-Swift.h"
#import "MihrabAppGroup.h"

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
  // The language travels beside the payload rather than being dug back out of
  // it on every draw. Six widget kinds read it, and re-decoding a hundred
  // kilobytes of JSON to find one string is work a widget cannot afford —
  // see mihrabLocalizationTag() in the extension.
  NSString *language = nil;
  NSError *parseError = nil;
  id parsed = [NSJSONSerialization
      JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding]
                 options:0
                   error:&parseError];
  if ([parsed isKindOfClass:[NSDictionary class]]) {
    id value = parsed[@"language"];
    if ([value isKindOfClass:[NSString class]]) {
      language = value;
    }
  }

  NSUserDefaults *group =
      MihrabAppGroupDefaults();
  NSUserDefaults *store = group != nil ? group : [NSUserDefaults standardUserDefaults];
  [store setObject:json forKey:@"prayer_widget_payload_v1"];
  // Cleared rather than left behind when a payload arrives without one: an
  // older app writing to a newer extension should give the phone's language
  // back, not keep whatever was last set.
  if (language.length > 0) {
    [store setObject:language forKey:@"prayer_widget_language"];
  } else {
    [store removeObjectForKey:@"prayer_widget_language"];
  }
  // Every other writer in this file synchronizes and this one did not — the
  // one that writes the payload every widget reads. The extension is a
  // separate process with its own view of the group container, and the
  // reload below is a race against it: flush first, then ask.
  [store synchronize];
  [WidgetTimelineReloader reloadAllTimelinesIfAvailable];
  resolve(nil);
}

/**
 * Hand over the Log Today widget's queued taps and clear them, in one step.
 *
 * One step because the app is about to write these to the journal, and a
 * read-then-clear that is interrupted between the two either loses taps or
 * writes them twice. The rules that decide what is IN the queue live in
 * WidgetLogQueue.swift (widget side) and widgetLogQueue.ts (app side); this
 * only moves the string across.
 */
RCT_EXPORT_METHOD(takeLogQueue
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group = MihrabAppGroupDefaults();
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  NSString *json = [target stringForKey:@"widget_log_queue"];
  if (json != nil) {
    [target removeObjectForKey:@"widget_log_queue"];
    [target synchronize];
    // The widget draws the queue OVER the payload, so a card that has just
    // been drained is still showing its taps twice — once as queued, once as
    // whatever the payload said. Android reloads here; this side did not,
    // and the card kept its doubled state until some later setData happened
    // to correct it. Ask for a redraw at the moment the queue empties.
    [WidgetTimelineReloader reloadAllTimelinesNow];
  }
  resolve(json);
}

/**
 * The same hand-over for the Tasbih widget's queue.
 *
 * A separate key rather than one queue with a `kind` field: the two have
 * different rules — a log tap is a set member and a dhikr tap is a sequence —
 * and one string that two sets of rules both parse is a string that will
 * eventually be parsed by the wrong one.
 */
RCT_EXPORT_METHOD(takeTasbihQueue
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group = MihrabAppGroupDefaults();
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  NSString *json = [target stringForKey:@"widget_tasbih_queue"];
  if (json != nil) {
    [target removeObjectForKey:@"widget_tasbih_queue"];
    [target synchronize];
    // Uncoalesced, like the log queue above: the card is showing the drained
    // taps twice until this lands.
    [WidgetTimelineReloader reloadAllTimelinesNow];
  }
  resolve(json);
}

RCT_EXPORT_METHOD(setUiHints:(NSString *)style
                  oledBackground:(BOOL)oled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group =
      MihrabAppGroupDefaults();
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  [target setObject:(style != nil ? style : @"fixed") forKey:@"widget_ui_style"];
  [target setBool:oled forKey:@"widget_oled"];
  [target synchronize];
  [WidgetTimelineReloader reloadAllTimelinesIfAvailable];
  resolve(nil);
}

RCT_EXPORT_METHOD(setWidgetHighlightDynamic:(BOOL)enabled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group =
      MihrabAppGroupDefaults();
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  [target setBool:enabled forKey:@"widget_highlight_dynamic"];
  [target synchronize];
  [WidgetTimelineReloader reloadAllTimelinesIfAvailable];
  resolve(nil);
}

RCT_EXPORT_METHOD(setIosWidgetHighlightAppearance:(NSString *)highlightId
                  hex:(NSString *)hex
                  dynamic:(BOOL)dynamic
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *group =
      MihrabAppGroupDefaults();
  NSUserDefaults *target = group != nil ? group : [NSUserDefaults standardUserDefaults];
  NSString *hid =
      (highlightId != nil && highlightId.length > 0) ? highlightId : @"green";
  [target setObject:hid forKey:@"widget_highlight_id"];
  if (hex != nil && hex.length > 0) {
    [target setObject:hex forKey:@"widget_highlight_hex"];
  } else {
    [target removeObjectForKey:@"widget_highlight_hex"];
  }
  [target setBool:dynamic forKey:@"widget_highlight_dynamic"];
  [target synchronize];
  [WidgetTimelineReloader reloadAllTimelinesIfAvailable];
  resolve(nil);
}

@end
