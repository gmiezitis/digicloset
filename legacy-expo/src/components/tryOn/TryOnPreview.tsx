/**
 * Try-On Preview Component
 * 
 * Displays the virtual try-on result with loading states,
 * progressive image quality, and action buttons.
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '@theme';
import type { TryOnStatus } from '@/types/tryOn';

export interface TryOnPreviewProps {
    status: TryOnStatus;
    previewUri?: string;
    hdUri?: string;
    onSave?: () => void;
    onShare?: () => void;
    onRetry?: () => void;
    errorMessage?: string;
}

export function TryOnPreview({
    status,
    previewUri,
    hdUri,
    onSave,
    onShare,
    onRetry,
    errorMessage,
}: TryOnPreviewProps) {
    const displayUri = hdUri || previewUri;
    const isLoading = status === 'processing';
    const hasResult = status === 'preview_ready' || status === 'hd_ready';
    const hasError = status === 'error';
    const isHD = status === 'hd_ready';

    return (
        <View style={styles.container}>
            <View style={styles.previewContainer}>
                {isLoading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={colors.accent.primary} />
                        <Text style={styles.loadingText}>Creating your look...</Text>
                        <Text style={styles.loadingSubtext}>This takes a few seconds</Text>
                    </View>
                )}

                {hasError && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorText}>
                            {errorMessage || 'Something went wrong'}
                        </Text>
                        {onRetry && (
                            <Pressable style={styles.retryButton} onPress={onRetry}>
                                <Text style={styles.retryButtonText}>Try Again</Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {hasResult && displayUri && (
                    <>
                        <Image
                            source={{ uri: displayUri }}
                            style={styles.previewImage}
                            resizeMode="contain"
                        />
                        {!isHD && (
                            <View style={styles.qualityBadge}>
                                <Text style={styles.qualityText}>Enhancing...</Text>
                            </View>
                        )}
                        {isHD && (
                            <View style={[styles.qualityBadge, styles.hdBadge]}>
                                <Text style={[styles.qualityText, styles.hdText]}>HD</Text>
                            </View>
                        )}
                    </>
                )}

                {status === 'idle' && (
                    <View style={styles.placeholderContainer}>
                        <Text style={styles.placeholderIcon}>✨</Text>
                        <Text style={styles.placeholderText}>
                            Select a model and tap Try It On
                        </Text>
                    </View>
                )}
            </View>

            {hasResult && (
                <View style={styles.actionsRow}>
                    {onSave && (
                        <Pressable
                            style={[styles.actionButton, styles.saveButton]}
                            onPress={onSave}
                        >
                            <Text style={styles.saveButtonText}>💾 Save Look</Text>
                        </Pressable>
                    )}
                    {onShare && (
                        <Pressable
                            style={[styles.actionButton, styles.shareButton]}
                            onPress={onShare}
                        >
                            <Text style={styles.shareButtonText}>📤 Share</Text>
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.lg,
    },
    previewContainer: {
        aspectRatio: 0.75,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        ...shadows.md,
    },
    loadingOverlay: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    loadingText: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
        marginTop: spacing.lg,
    },
    loadingSubtext: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        marginTop: spacing.xs,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    qualityBadge: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
    },
    hdBadge: {
        backgroundColor: colors.accent.primary,
    },
    qualityText: {
        fontSize: typography.fontSize.xs,
        color: colors.text.inverse,
    },
    hdText: {
        fontWeight: typography.fontWeight.bold,
    },
    placeholderContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    placeholderIcon: {
        fontSize: 48,
        marginBottom: spacing.md,
    },
    placeholderText: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        textAlign: 'center',
    },
    errorContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    errorIcon: {
        fontSize: 48,
        marginBottom: spacing.md,
    },
    errorText: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    retryButton: {
        backgroundColor: colors.accent.primary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
    },
    retryButtonText: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.inverse,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    actionButton: {
        flex: 1,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    saveButton: {
        backgroundColor: colors.accent.primary,
    },
    saveButtonText: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.inverse,
    },
    shareButton: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    shareButtonText: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        color: colors.text.primary,
    },
});
