#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

/**
 * Whether the device clock is set to 24-hour time — issue #18.
 *
 * iOS has no API that names the "24-Hour Time" switch. What it does
 * instead is fold the choice into the current locale, so the honest way
 * to ask is to request the locale's preferred format for an hour field
 * ("j" — hour, in whichever cycle this user reads) and see whether a
 * day-period symbol came back with it. No "a" means 24-hour.
 *
 * `autoupdatingCurrentLocale` rather than `currentLocale` so a change
 * made in Settings while the app is backgrounded is visible on the next
 * call, which is exactly when JavaScript asks again.
 */
@interface SystemClock : NSObject <RCTBridgeModule>
@end

@implementation SystemClock

RCT_EXPORT_MODULE();

static BOOL MihrabSystemIs24Hour(void)
{
  NSString *format = [NSDateFormatter dateFormatFromTemplate:@"j"
                                                     options:0
                                                      locale:[NSLocale autoupdatingCurrentLocale]];
  if (format == nil) {
    return NO;
  }
  return [format rangeOfString:@"a"].location == NSNotFound;
}

- (NSDictionary *)constantsToExport
{
  return @{ @"is24Hour": @(MihrabSystemIs24Hour()) };
}

// A different name from the `is24Hour` constant above, on purpose: a
// method and a constant sharing a name means one of them is unreachable
// from JavaScript in every bridge mode. See SystemClockModule.kt.
RCT_EXPORT_METHOD(readIs24Hour:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  resolve(@(MihrabSystemIs24Hour()));
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
