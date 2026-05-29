import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Design baseline — iPhone SE / 375-point width */
const BASE_WIDTH  = 375;
const BASE_HEIGHT = 812;

/** Linear scale factor against BASE_WIDTH */
export const scale = (size: number): number =>
  Math.round(size * (SCREEN_W / BASE_WIDTH));

/** Linear scale factor against BASE_HEIGHT */
export const verticalScale = (size: number): number =>
  Math.round(size * (SCREEN_H / BASE_HEIGHT));

/**
 * Moderate scale — dampens the linear scale by `factor` (default 0.45).
 * factor 0 → no scaling, factor 1 → full linear scaling.
 * Good middle-ground for fonts and spacing that need to grow on large screens
 * without becoming too large on small ones.
 */
export const moderateScale = (size: number, factor = 0.45): number =>
  Math.round(size + (scale(size) - size) * factor);

/** True for iPad / tablet-class screen widths */
export const isTablet = SCREEN_W >= 768 || (Platform.OS === 'ios' && SCREEN_W >= 768);

/**
 * Tile scale — how much to grow tile dimensions on large screens.
 * Clamped so tiles never become smaller than designed or larger than 1.6×.
 */
export const tileScale = Math.min(1.6, Math.max(1, SCREEN_W / BASE_WIDTH));
