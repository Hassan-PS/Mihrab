#import "MihrabAppGroup.h"

/**
 * One name per platform, both spelling the same group.
 *
 * iOS: `group.com.prayerapp`, unchanged since the widget shipped.
 *
 * Mac Catalyst: the same string with the Team ID in front. Apple's guidance
 * contradicts itself here — DTS says Catalyst keeps the plain iOS identifier,
 * while macOS logs that "Group containers identifiers should be prefixed by
 * requestor's team ID to allow access on this platform" — so this was decided
 * by what was observed, and it is worth being precise about what that was.
 *
 * OBSERVED (2026-08-07). With the plain name, the widget extension launched
 * under chronod and faulted on every read:
 *
 *   Couldn't read values in CFPrefsPlistSource (Domain: group.com.prayerapp,
 *   Container: (null)): accessing preferences outside an application's
 *   container requires user-preference-read or file-read-data sandbox access
 *
 * With the team-prefixed name, nothing of the kind appears. That is the whole
 * of the evidence, and it is one observation, not a proof.
 *
 * NOT OBSERVED, though it sounds like it should follow: that a sandboxed
 * process simply cannot read a non-prefixed group. A probe binary signed with
 * exactly this extension's entitlements — app-sandbox plus the plain group,
 * even carrying the extension's own bundle identifier — read the plain
 * container without complaint. So the prefix rule is NOT a blanket sandbox
 * rule; something narrower about how ExtensionKit hosts the widget is at
 * play, and that part is still unexplained.
 *
 * The prefixed name is therefore the one that has never failed, not the one
 * that is understood. If you are tempted to unify the two platforms on the
 * plain name, the check that settles it is placing the widget in Notification
 * Centre and seeing whether it draws real times or an empty card. Nothing
 * short of that has caught this class of bug: signature verification passes,
 * notarization passes, pluginkit registers, and chronod reports success.
 *
 * Mind the shape: team ID FIRST, then `group.`. An earlier attempt spelled it
 * `group.GAW23HT439.com.prayerapp`, which macOS does not recognise as
 * prefixed at all — it produced no container, and that dead end is what first
 * made the prefix rule look like a myth.
 */
#if TARGET_OS_MACCATALYST
static NSString *const kGroup = @"GAW23HT439.group.com.prayerapp";
#else
static NSString *const kGroup = @"group.com.prayerapp";
#endif

NSString *MihrabAppGroupSuiteName(void) { return kGroup; }

NSUserDefaults *MihrabAppGroupDefaults(void)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:kGroup];
  // Falling back keeps the app's own reads and writes working when there is
  // no group at all — an ad-hoc build, which carries no Team ID and so gets
  // no container. The widget shows nothing there, which is honest, but
  // nothing in the app breaks on a nil defaults object.
  //
  // Worth remembering: a non-nil object here proves nothing. initWithSuiteName
  // hands back a live-looking NSUserDefaults for a group the process is not
  // entitled to and silently drops every write. Round-tripping a value is the
  // only real test.
  return defaults ?: [NSUserDefaults standardUserDefaults];
}
