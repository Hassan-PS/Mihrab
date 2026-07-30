#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MushafFont, NSObject)

RCT_EXTERN_METHOD(registerFont:(NSString *)family
                  path:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isValidFont:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
