/**
 * Device class — answered ONCE, at module scope (mushaf-reader-split plan).
 *
 * A phone cannot become an iPad mid-session; only WINDOW size changes. So
 * the phone/tablet split is a constant, evaluated at import from the
 * physical screen's shorter side (<600dp = phone, the classic Android
 * phone/tablet line). Everything downstream branches on props it is given,
 * never on the window.
 *
 * Never read per render — import the constant.
 */
import { Dimensions } from 'react-native';

export type DeviceClass = 'phone' | 'large';

const screen = Dimensions.get('screen');

export const DEVICE_CLASS: DeviceClass =
  Math.min(screen.width, screen.height) < 600 ? 'phone' : 'large';
