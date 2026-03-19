/**
 * App-wide constants
 */

export const APP_NAME = 'Tidless';
export const APP_TAGLINE = 'Every clothe counts';
export const APP_VERSION = '1.0.0';

// Image processing
export const MAX_IMAGE_SIZE = 2048;
export const IMAGE_COMPRESSION_QUALITY = 0.8;

// Performance
export const THUMBNAIL_SIZE = 300;
export const LIST_WINDOW_SIZE = 10;

// Network
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.digicloset.local';

// Timing
export const SPLASH_MIN_DURATION = 1500; // ms
export const ANIMATION_DURATION = 300; // ms

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: '@tidless:settings',
  ONBOARDING_COMPLETE: '@tidless:onboarding_complete',
  ANALYTICS_CONSENT: '@tidless:analytics_consent',
} as const;

