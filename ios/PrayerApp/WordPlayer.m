#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WordPlayer, NSObject)

RCT_EXTERN_METHOD(play:(NSString *)path
                  startMs:(nonnull NSNumber *)startMs
                  endMs:(nonnull NSNumber *)endMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
