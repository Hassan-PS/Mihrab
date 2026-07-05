// Rate-the-app native module — in-app App Store review prompt.
//
// Uses SKStoreReviewController so no App Store numeric id is needed and the
// user never leaves the app. iOS rate-limits the prompt system-side (max ~3
// times/year), so calling it from an explicit "Rate Mihrab" tap is safe and
// App Review-compliant. Registered via RCT_EXPORT_MODULE like AppVersion.m;
// works under the new architecture through the interop layer.

#import <React/RCTBridgeModule.h>
#import <StoreKit/StoreKit.h>
#import <UIKit/UIKit.h>

@interface RateApp : NSObject <RCTBridgeModule>
@end

@implementation RateApp

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(requestReview)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (@available(iOS 14.0, *)) {
      for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (scene.activationState == UISceneActivationStateForegroundActive &&
            [scene isKindOfClass:[UIWindowScene class]]) {
          [SKStoreReviewController requestReviewInScene:(UIWindowScene *)scene];
          return;
        }
      }
    }
  });
}

@end
