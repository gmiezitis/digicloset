/**
 * Design tokens for Wardrobe MVP
 * Scandinavian minimal aesthetic with soft tones and subtle shadows
 */

export const colors = {
  // Neutrals
  white: '#FFFFFF',
  offWhite: '#F8F8F6',
  paleGray: '#E8E8E4',
  lightGray: '#C4C4C0',
  mediumGray: '#8A8A86',
  darkGray: '#4A4A48',
  black: '#1A1A1A',

  // Accent
  mutedTeal: '#7BA5A3',
  softSalmon: '#E8B4A0',
  
  // Semantic
  background: '#F8F8F6',
  surface: '#FFFFFF',
  border: '#E8E8E4',
  text: {
    primary: '#1A1A1A',
    secondary: '#4A4A48',
    tertiary: '#8A8A86',
    inverse: '#FFFFFF',
  },
  accent: {
    primary: '#7BA5A3',
    secondary: '#E8B4A0',
  },
  status: {
    success: '#7BA5A3',
    error: '#D97B6E',
    warning: '#E8B4A0',
    info: '#7BA5A3',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 9999,
};

export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const touchTargetSize = 44;

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  touchTargetSize,
};

export type Theme = typeof theme;

