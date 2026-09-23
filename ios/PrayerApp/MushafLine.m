#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(MushafLineManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(fontFamily, NSString)
RCT_EXPORT_VIEW_PROPERTY(fontSize, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(color, UIColor)
RCT_EXPORT_VIEW_PROPERTY(runs, NSArray)
RCT_EXPORT_VIEW_PROPERTY(penRight, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(penBaseline, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(boxTop, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(boxHeight, CGFloat)

@end
