//  Which App Group the app and its widget share.
//
//  iOS uses the plain `group.com.prayerapp` and always has; changing it would
//  orphan every existing user's widget, so it is fixed.
//
//  Mac Catalyst uses `GAW23HT439.group.com.prayerapp` — the same name with the
//  Team ID in front, because that is the one the widget extension has been
//  seen to read successfully and the plain one has not. The .m file has the
//  evidence, including the part of it that is still unexplained.
//
//  Both sides resolve the name through this one header, so they cannot drift
//  apart: whatever the app writes to, the widget reads from.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// The suite name to read and write the widget payload through.
FOUNDATION_EXPORT NSString *MihrabAppGroupSuiteName(void);

/// The defaults for that suite, or `standardUserDefaults` if no group works.
FOUNDATION_EXPORT NSUserDefaults *MihrabAppGroupDefaults(void);

NS_ASSUME_NONNULL_END
