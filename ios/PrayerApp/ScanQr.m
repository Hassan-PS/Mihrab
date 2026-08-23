#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ScanQr, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(scan:(nonnull NSString *)hint
                  cancel:(nonnull NSString *)cancel
                  accent:(nonnull NSString *)accent
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
