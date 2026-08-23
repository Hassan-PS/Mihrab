#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MihrabClipboard, NSObject)

RCT_EXTERN_METHOD(setString:(nonnull NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getString:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
