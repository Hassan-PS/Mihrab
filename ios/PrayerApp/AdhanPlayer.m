#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AdhanPlayer, NSObject)

RCT_EXTERN_METHOD(play:(NSString *)name
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isPlaying:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
