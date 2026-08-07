/**
 * The addresses the app points people at, in one place.
 *
 * They were literals scattered across screens, and they drifted: the shared
 * month image was still printing the GitHub repo — with a QR code carrying
 * the app's old mosque icon — months after there was a website to send
 * people to, and Settings sent everyone to the source tree rather than to
 * the page written for them.
 *
 * The website is the front door. GitHub is for people who want the source,
 * which is a different audience and a different link.
 */

/** The project's own site. What a stranger should be handed. */
export const MIHRAB_WEBSITE = 'https://mihrab.elghamri.se';

/** Shown rather than linked — a bare host reads better than a URL. */
export const MIHRAB_WEBSITE_LABEL = 'mihrab.elghamri.se';

/** The source. Still linked from the attributions, where it belongs. */
export const MIHRAB_REPO = 'https://github.com/Hassan-PS/Mihrab';
