#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface AppVersion : NSObject <RCTBridgeModule>
@end

@implementation AppVersion

RCT_EXPORT_MODULE();

- (NSDictionary *)constantsToExport
{
  NSString *version = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
  NSString *build = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleVersion"];
  if (version == nil) {
    version = @"";
  }
  if (build == nil) {
    build = @"";
  }
  return @{
    @"versionName": version,
    @"buildNumber": build,
  };
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
