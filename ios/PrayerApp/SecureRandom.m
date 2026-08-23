#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SecureRandom, NSObject)

RCT_EXTERN_METHOD(bytes:(nonnull NSNumber *)count
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
