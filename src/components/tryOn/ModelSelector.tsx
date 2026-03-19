/**
 * Model Selector Component
 * 
 * Allows users to select a mannequin model for virtual try-on.
 * Shows locked state for premium models when user is on free tier.
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Image,
} from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '@theme';
import type { MannequinModel, MannequinType } from '@/types/tryOn';

export interface ModelSelectorProps {
    models: (MannequinModel & { isLocked?: boolean })[];
    selectedId: MannequinType | null;
    onSelect: (model: MannequinModel) => void;
    onUpgradePress?: () => void;
}

export function ModelSelector({
    models,
    selectedId,
    onSelect,
    onUpgradePress,
}: ModelSelectorProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>Choose a model</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {models.map(model => {
                    const isSelected = model.id === selectedId;
                    const isLocked = model.isLocked;

                    return (
                        <Pressable
                            key={model.id}
                            style={[
                                styles.modelCard,
                                isSelected && styles.modelCardSelected,
                                isLocked && styles.modelCardLocked,
                            ]}
                            onPress={() => {
                                if (isLocked && onUpgradePress) {
                                    onUpgradePress();
                                } else if (!isLocked) {
                                    onSelect(model);
                                }
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected, disabled: isLocked }}
                            accessibilityLabel={`${model.name} model${isLocked ? ', premium only' : ''}`}
                        >
                            <View style={styles.imageContainer}>
                                <Image
                                    source={model.imageUri}
                                    style={styles.modelImage}
                                    resizeMode="cover"
                                />
                                {isLocked && (
                                    <View style={styles.lockOverlay}>
                                        <Text style={styles.lockIcon}>🔒</Text>
                                        <Text style={styles.lockText}>PRO</Text>
                                    </View>
                                )}
                                {isSelected && !isLocked && (
                                    <View style={styles.selectedBadge}>
                                        <Text style={styles.selectedIcon}>✓</Text>
                                    </View>
                                )}
                            </View>
                            <Text
                                style={[
                                    styles.modelName,
                                    isSelected && styles.modelNameSelected,
                                    isLocked && styles.modelNameLocked,
                                ]}
                            >
                                {model.name}
                            </Text>
                            <Text style={styles.modelDescription} numberOfLines={1}>
                                {model.description}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.lg,
    },
    label: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        color: colors.text.secondary,
        marginBottom: spacing.sm,
        marginLeft: spacing.xs,
    },
    scrollContent: {
        paddingHorizontal: spacing.xs,
        gap: spacing.md,
    },
    modelCard: {
        width: 100,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        borderWidth: 2,
        borderColor: colors.border,
        overflow: 'hidden',
        ...shadows.sm,
    },
    modelCardSelected: {
        borderColor: colors.accent.primary,
        backgroundColor: colors.offWhite,
    },
    modelCardLocked: {
        opacity: 0.9,
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 0.75,
        position: 'relative',
    },
    modelImage: {
        width: '100%',
        height: '100%',
    },
    lockOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockIcon: {
        fontSize: 24,
    },
    lockText: {
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.inverse,
        marginTop: spacing.xs,
        letterSpacing: 1,
    },
    selectedBadge: {
        position: 'absolute',
        top: spacing.xs,
        right: spacing.xs,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.accent.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectedIcon: {
        fontSize: 14,
        color: colors.text.inverse,
        fontWeight: typography.fontWeight.bold,
    },
    modelName: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
        textAlign: 'center',
        paddingTop: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
    modelNameSelected: {
        color: colors.accent.primary,
    },
    modelNameLocked: {
        color: colors.text.tertiary,
    },
    modelDescription: {
        fontSize: typography.fontSize.xs,
        color: colors.text.tertiary,
        textAlign: 'center',
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
});
