/**
 * What an iOS `<Modal>` is allowed to rotate to.
 *
 * ── WHY EVERY MODAL IN THE READER NEEDS THIS ──────────────────────────
 *
 * React Native's `<Modal>` defaults `supportedOrientations` to
 * `['portrait']`, and on iOS that is not a hint: the modal is a presented
 * view controller, and UIKit refuses a presentation whose supported set has
 * no orientation in common with the window it is being presented from.
 *
 * Everything in this app is portrait except the muṣḥaf, which asks the
 * navigator for `orientation: 'default'` so a phone can be read on its
 * side. Turn the phone in fullscreen, tap an ayah, and the sheet has
 * nowhere legal to appear — the tap does nothing at all, which reads as
 * "the reader will not let me select an ayah in fullscreen". Reported on
 * v2.9, iOS only, because on Android a Dialog has no such rule.
 *
 * So every modal that can be opened from the reader — the ayah sheet, the
 * share card nested inside it, the jump card, the riwayah and reciter
 * pickers, the player's own sheet — declares both. Portrait-only screens
 * are unaffected: their window never offers a landscape to match.
 *
 * NOT `portrait-upside-down`. The reader asks the navigator for
 * `orientation: 'default'` precisely so the platform's own policy applies,
 * and on a phone that policy excludes upside-down — a modal that allowed
 * it would be the one thing on screen that could arrive there.
 */
import type { ModalProps } from 'react-native';

export const MODAL_ORIENTATIONS: NonNullable<
  ModalProps['supportedOrientations']
> = ['portrait', 'landscape'];
