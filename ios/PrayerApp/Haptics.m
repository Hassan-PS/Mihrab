#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Haptics, NSObject)

RCT_EXTERN_METHOD(prepare)
RCT_EXTERN_METHOD(selectionTick)
RCT_EXTERN_METHOD(impact:(NSString *)style)

@end
