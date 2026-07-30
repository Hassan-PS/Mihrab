# Mihrab — name and branding policy

The **code** in this repository is free software under AGPL-3.0-or-later, and
you are welcome to use, study, modify and redistribute it under those terms.

This document is about something the licence deliberately does not cover: the
**name, the icon, and the store presence**. Neither AGPL-3.0 nor the
Apache-2.0 licence that covered earlier releases grants any trademark rights —
Apache-2.0 excludes them explicitly in section 6, and the GPL family grants
none at all. So those rights are reserved, and this page says plainly how they
may and may not be used.

## What is covered

- The name **Mihrab** used as the name of an application.
- The Mihrab app icon and any variation of it.
- The store listing copy, feature graphics and screenshots published to Google
  Play, the App Store and F-Droid.

The five design principles, the layout of the app and the ideas behind it are
not claimed here — only the marks above.

## What you may do, without asking

- **Redistribute builds under the name Mihrab.** F-Droid, Google Play, the App
  Store, Obtainium, Homebrew, a mirror, a friend with a USB stick — if the app
  is built from this project's source, it is Mihrab and may say so. This
  permission is deliberate and permanent: a policy that forced distributors to
  rename the app would make Mihrab useless to F-Droid, which is exactly where
  the users who care most about this project find it.

### Packaging changes do not cost you the name

A distributor almost always has to touch the source to build it at all. None
of the following makes a build "modified" for the purposes of this policy, and
all of them keep the name:

- **Build and toolchain changes** — SDK, NDK or compiler versions, Gradle
  configuration, dependency patching, signing, reproducibility fixes, or
  disabling a check that will not run in the distributor's environment.
  F-Droid's recipe for Mihrab does several of these; those builds are Mihrab.
- **Security fixes**, including backports.
- **Removing non-free components** so the app can be distributed at all.
- **Translations and locale corrections.**
- **Architecture or packaging splits**, and repacking into another format.

This clause exists because of what happened to Firefox: Mozilla's policy drew
no line between packaging and functional changes, Debian's security patches
fell on the wrong side of it, and Debian shipped the browser as "Iceweasel"
for about ten years. Nobody was served by that. What this policy is actually
about is a *different app* wearing Mihrab's name and face — changed features,
added advertising, a different data-handling posture — not the ordinary work
of getting software to compile somewhere else.

If you are unsure which side of the line your change sits on, ask. The answer
will almost always be "keep the name".
- **Say what your software is based on.** "A fork of Mihrab", "derived from
  Mihrab", "compatible with Mihrab" — describing the relationship accurately
  is fair use and always allowed.
- **Use the name in reviews, articles, tutorials and academic work.**

## What requires permission

- Publishing a **functionally modified** version under the name Mihrab, or
  under a name likely to be confused with it, on any store or download page.
  "Functionally modified" means changes a user would notice or care about —
  altered or added features, advertising or tracking, a different privacy
  posture, changed religious content — not the packaging work listed above.
- Using the Mihrab icon, or a recognisable variation, as the icon of another
  application.
- Reusing the store listing text, feature graphics or screenshots.
- Anything that suggests this project endorses, maintains or is responsible
  for your version.

## If you fork it

You are encouraged to. Please give your version its own name and its own
icon, and describe the lineage in your own words. That is not a legal
formality — it is so that a user who has a problem with your build reports it
to you and not to a project that cannot fix it, and so that a security issue
in one is never mistaken for the other.

## Why this exists

Nearly every app clone keeps the original's name and icon, because that is
what makes it findable. Copyright arguments about licences are slow; a
branding complaint is not. Google Play, the App Store and GitHub all act on a
straightforward report that an app is using someone else's name and artwork,
without anyone needing to go to court.

## Asking

Email **mihrab@elghamri.se**, or open an issue at
<https://github.com/Hassan-PS/Mihrab/issues> if the matter is not private.
Permission for reasonable uses is usually easy to get; the point of this page
is to stop passing-off, not to stop people building things.

The marks described here are held by **Hassan El Ghamri**, the author and
copyright holder of Mihrab.
