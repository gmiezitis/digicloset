/**
 * DigiCloset Theme
 * 
 * Design tokens for consistent styling across the app.
 */

// Color palette
export const colors = {
    // Primary brand colors
    primary: '#6366F1',     // Indigo
    secondary: '#A5B4FC',   // Light indigo
    accent: '#F59E0B',      // Amber

    // Semantic colors
    success: '#10B981',     // Green
    warning: '#F59E0B',     // Orange
    error: '#EF4444',       // Red

    // Surface colors
    background: '#F9FAFB',  // Light gray
    surface: '#FFFFFF',     // White
    surfaceElevated: '#FFFFFF',

    // Border colors
    border: '#E5E7EB',      // Gray 200
    borderLight: '#F3F4F6', // Gray 100

    // Text colors
    text: {
        primary: '#111827',   // Gray 900
        secondary: '#6B7280', // Gray 500
        tertiary: '#9CA3AF',  // Gray 400
        inverse: '#FFFFFF',
    },

    // Dark mode colors (for future use)
    dark: {
        background: '#111827',
        surface: '#1F2937',
        text: {
            primary: '#F9FAFB',
            secondary: '#9CA3AF',
            tertiary: '#6B7280',
        },
    },
};

// Spacing scale (in pixels)
export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

// Border radius
export const borderRadius = {
    none: 0,
    sm: 4,
    md: 8,
    lg: 16,
    xl: 24,
    full: 9999,
};

// Typography
export const typography = {
    // Headings
    headline: {
        fontSize: 24,
        fontWeight: '700' as const,
        lineHeight: 32,
    },
    title: {
        fontSize: 20,
        fontWeight: '600' as const,
        lineHeight: 28,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '600' as const,
        lineHeight: 24,
    },

    // Body text
    body: {
        fontSize: 16,
        fontWeight: '400' as const,
        lineHeight: 24,
    },
    bodySmall: {
        fontSize: 14,
        fontWeight: '400' as const,
        lineHeight: 20,
    },

    // UI elements
    button: {
        fontSize: 16,
        fontWeight: '600' as const,
        lineHeight: 24,
    },
    caption: {
        fontSize: 12,
        fontWeight: '400' as const,
        lineHeight: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500' as const,
        lineHeight: 20,
    },
};

// Shadows (React Native compatible)
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
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
};

// Animation durations
export const animation = {
    fast: 150,
    normal: 300,
    slow: 500,
};

// Screen breakpoints (for responsive design)
export const breakpoints = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
};

// Z-index scale
export const zIndex = {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    modal: 1200,
    popover: 1300,
    tooltip: 1400,
    toast: 1500,
};
