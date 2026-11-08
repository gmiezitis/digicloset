import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';

interface ClothingImage3DProps {
    /**
     * URI of the clothing image (should be transparent PNG for best results)
     */
    uri: string;
    /**
     * Optional container style
     */
    style?: ViewStyle;
    /**
     * Shadow intensity level
     * - light: Subtle shadow for minimal effect
     * - medium: Balanced shadow (default)
     * - strong: Prominent shadow for dramatic effect
     */
    shadowIntensity?: 'light' | 'medium' | 'strong';
    /**
     * If true, uses premium-quality shadow (requires processed depth data)
     */
    isPremium?: boolean;
    /**
     * URI to pre-generated shadow image (for premium users)
     */
    premiumShadowUri?: string;
}

/**
 * ClothingImage3D Component
 * 
 * Displays a clothing image with a 3D-like shadow effect.
 * 
 * Cost Structure:
 * - Free users: CSS-like drop-shadow (client-side, $0.00/image)
 * - Premium users: Server-generated depth-aware shadows ($0.0005/image)
 * 
 * The shadow creates a "floating" effect that makes clothing items
 * look more professional and catalog-like.
 */
export function ClothingImage3D({
    uri,
    style,
    shadowIntensity = 'medium',
    isPremium = false,
    premiumShadowUri,
}: ClothingImage3DProps) {
    // Shadow configuration based on intensity
    const shadowConfig = {
        light: { offset: 4, blur: 8, opacity: 0.15, scale: 0.99 },
        medium: { offset: 8, blur: 16, opacity: 0.25, scale: 0.98 },
        strong: { offset: 12, blur: 24, opacity: 0.35, scale: 0.97 },
    }[shadowIntensity];

    // Premium users get server-rendered shadows
    if (isPremium && premiumShadowUri) {
        return (
            <View style={[styles.container, style]}>
                <Image
                    source={{ uri: premiumShadowUri }}
                    style={styles.premiumShadow}
                    resizeMode="contain"
                />
                <Image
                    source={{ uri }}
                    style={styles.mainImage}
                    resizeMode="contain"
                />
            </View>
        );
    }

    // Free users get client-side CSS-like shadows
    return (
        <View style={[styles.container, style]}>
            {/* Shadow layer: offset, blurred copy of the clothing silhouette */}
            <Image
                source={{ uri }}
                style={[
                    styles.shadowImage,
                    {
                        transform: [
                            { translateX: shadowConfig.offset },
                            { translateY: shadowConfig.offset * 1.5 }, // More vertical offset for floor effect
                            { scale: shadowConfig.scale },
                        ],
                        opacity: shadowConfig.opacity,
                    },
                ]}
                blurRadius={shadowConfig.blur}
            />

            {/* Main clothing image on top */}
            <Image
                source={{ uri }}
                style={styles.mainImage}
                resizeMode="contain"
            />
        </View>
    );
}

/**
 * Compact version for grid/thumbnail displays
 */
export function ClothingImage3DCompact({
    uri,
    style,
}: Pick<ClothingImage3DProps, 'uri' | 'style'>) {
    return (
        <View style={[styles.container, style]}>
            <Image
                source={{ uri }}
                style={[
                    styles.shadowImage,
                    {
                        transform: [
                            { translateX: 3 },
                            { translateY: 4 },
                            { scale: 0.99 },
                        ],
                        opacity: 0.12,
                    },
                ]}
                blurRadius={6}
            />
            <Image
                source={{ uri }}
                style={styles.mainImage}
                resizeMode="contain"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
    },
    shadowImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        tintColor: '#000000', // Force shadow to be black
    },
    mainImage: {
        width: '100%',
        height: '100%',
    },
    premiumShadow: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
});
