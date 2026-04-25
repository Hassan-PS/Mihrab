#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(CompassModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startUpdates)
RCT_EXTERN_METHOD(stopUpdates)

@end
