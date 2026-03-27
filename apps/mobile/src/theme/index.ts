// DominoClub Design System
// Dark forest green theme matching Figma mockups

import { Platform } from 'react-native';

export const colors = {
  // Backgrounds
  bg: '#0a1f0a',           // Deep forest green background
  bgCard: '#0f2e0f',       // Card / panel background
  bgOverlay: '#071507',    // Darker overlay
  bgTable: '#1a5c1a',      // Game table felt green
  bgTableBorder: '#0d3d0d',

  // Brand
  primary: '#4ade80',      // Lime green — buttons, accents
  primaryDark: '#16a34a',  // Darker green for press states
  primaryLight: '#86efac',
  gold: '#facc15',         // Gold — coins, prizes
  goldDark: '#ca8a04',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#a7f3d0', // Mint green
  textMuted: '#6b7280',
  textOnPrimary: '#000000',

  // Borders & separators
  border: 'rgba(74,222,128,0.2)',
  borderStrong: 'rgba(74,222,128,0.5)',

  // Status
  success: '#4ade80',
  error: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',

  // Tiles
  tileBg: '#ffffff',
  tileBorder: '#d1d5db',
  tilePip: '#111827',
  tileShadow: 'rgba(0,0,0,0.5)',

  // Transparent overlays
  overlay20: 'rgba(0,0,0,0.2)',
  overlay50: 'rgba(0,0,0,0.5)',
  overlay80: 'rgba(0,0,0,0.8)',

  // Navigation
  tabBarBg: '#071507',
  tabBarActive: '#4ade80',
  tabBarInactive: '#4b7a4b',
};

export const fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 40,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  tile: {
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
};

export const backgroundCoverFix =
  Platform.OS === 'web'
    ? ({
        minHeight: '100vh',
        height: '100vh',
        width: '100%',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      } as any)
    : null;
