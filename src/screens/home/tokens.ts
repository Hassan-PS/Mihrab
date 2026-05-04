import { Platform } from 'react-native';

/**
 * Local design tokens for HomeScreen and its children — task #8.
 *
 * Co-located here so the split-out children can share constants without going
 * through HomeScreen as a prop. Will migrate to the global design system in
 * task #34.
 */
const isIOS = Platform.OS === 'ios';

export const HOME_CARD_RADIUS = isIOS ? 20 : 16;
export const HOME_CARD_PADDING = isIOS ? 20 : 18;
export const HOME_ROW_PADDING_V = isIOS ? 15 : 14;
export const HOME_TABLE_RADIUS = isIOS ? 16 : 12;
export const HOME_SCREEN_PADDING = 16;
