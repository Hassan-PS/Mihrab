// PrayerLiveActivity Objective-C bridge — task #128.
//
// Re-exports the Swift @objc methods on `PrayerLiveActivity` so the
// React Native bridge can find them by selector. The Swift class itself
// lives in `PrayerLiveActivity.swift` and conforms to the implicit RCT
// module protocol via `@objc(PrayerLiveActivity)`.
//
// We deliberately don't import any ActivityKit headers here — the
// bridge is pure JS↔Swift glue; all ActivityKit calls live in the Swift
// file under `#if canImport(ActivityKit)` guards.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PrayerLiveActivity, NSObject)

RCT_EXTERN_METHOD(start:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(update:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup { return NO; }

@end
