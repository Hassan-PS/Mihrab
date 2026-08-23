#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

/**
 * When this app was first installed on this device.
 *
 * The journal's backfill button offers to fill every day from the install
 * date to yesterday, so this number decides how far back the app is willing
 * to claim anything about someone's prayers. It must be the FIRST install
 * and not the last update: a user who has had Mihrab for a year and updates
 * on Tuesday would otherwise be offered a single day, which is the feature
 * failing precisely the people it exists for.
 *
 * iOS has no "when was this installed" API. What it has is the app
 * container's Documents directory, created once when the container is and
 * untouched by every update after — the binary is replaced on update, the
 * container is not. So its creation date IS the install date, and unlike
 * the bundle's own date it does not move when the app updates.
 *
 * Reinstalling resets it, which is correct: a reinstall takes the journal
 * with it, so there is nothing older left to fill in.
 *
 * 0 means "cannot tell", and JS falls back to its own first-run stamp
 * rather than guessing (see installDate.ts).
 */
@interface PrayerBuildInfo : NSObject <RCTBridgeModule>
@end

@implementation PrayerBuildInfo

RCT_EXPORT_MODULE();

- (NSDictionary *)constantsToExport
{
  return @{
    // Android's flavour (play / fdroid) is what this key exists for; iOS
    // has one channel, and JS defaults sensibly if it is missing.
    @"distribution" : @"appstore",
    @"firstInstallTime" : @([self firstInstallTimeMs]),
    @"deviceName" : [self deviceName],
  };
}

/**
 * What this device calls itself, for the paired list on someone else's
 * phone.
 *
 * Worth being clear about the limit: since iOS 16, `UIDevice.name` returns
 * the MODEL name — "iPhone" — to any app without the user-assigned device
 * name entitlement, which is granted by request and not for something as
 * small as this. So on modern iOS this is "iPhone" or "iPad", and the user
 * can type something better on the Sync screen. Android has the name its
 * owner actually set, and gets it.
 */
- (NSString *)deviceName
{
  NSString *name = UIDevice.currentDevice.name;
  if (name.length == 0) {
    return @"iPhone";
  }
  return name;
}

- (double)firstInstallTimeMs
{
  NSFileManager *fm = [NSFileManager defaultManager];
  NSURL *documents = [[fm URLsForDirectory:NSDocumentDirectory
                                 inDomains:NSUserDomainMask] firstObject];
  if (documents == nil) {
    return 0;
  }
  NSError *error = nil;
  NSDictionary *attrs = [fm attributesOfItemAtPath:documents.path error:&error];
  NSDate *created = attrs[NSFileCreationDate];
  if (created == nil) {
    return 0;
  }
  return [created timeIntervalSince1970] * 1000.0;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
