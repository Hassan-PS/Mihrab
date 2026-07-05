#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MushafPageScaler, NSObject)

RCT_EXTERN_METHOD(scaleToWidth:(NSString *)srcPath
                  destPath:(NSString *)destPath
                  targetWidth:(nonnull NSNumber *)targetWidth
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
