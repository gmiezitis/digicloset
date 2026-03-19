/**
 * Try-On Quota Bar Component
 * 
 * Displays remaining try-on quota for the week with upgrade prompt.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import { useTryOnQuota } from '@/services/quotaStore';

export interface TryOnQuotaBarProps {
    onWatchAd?: () => void;
    onUpgrade?: () => void;
}

export function TryOnQuotaBar({ onWatchAd, onUpgrade }: TryOnQuotaBarProps) {
    const quota = useTryOnQuota();
    const percentUsed = Math.round((quota.used / quota.total) * 100);
    const isLow = quota.remaining <= 1 && !quota.isPremium;
    const isEmpty = quota.remaining === 0;

    // Format reset date
    const resetDate = new Date(quota.resetsAt);
    const daysUntilReset = Math.ceil(
        (resetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return (
        <View style={[styles.container, isEmpty && styles.containerEmpty]}>
            <View style={styles.infoRow}>
                <View style={styles.quotaInfo}>
                    <Text style={[styles.quotaCount, isEmpty && styles.quotaCountEmpty]}>
                        {quota.remaining}
                    </Text>
                    <Text style={styles.quotaLabel}>
                        of {quota.total} try-ons left
                    </Text>
                </View>
                <Text style={styles.resetText}>
                    Resets in {daysUntilReset} {daysUntilReset === 1 ? 'day' : 'days'}
                </Text>
            </View>

            <View style={styles.progressBar}>
                <View
                    style={[
                        styles.progressFill,
                        { width: `${Math.min(100, percentUsed)}%` },
                        isLow && styles.progressFillLow,
                        isEmpty && styles.progressFillEmpty,
                    ]}
                />
            </View>

            {isEmpty && !quota.isPremium && (
                <View style={styles.actionsRow}>
                    {onWatchAd && (
                        <Pressable style={styles.adButton} onPress={onWatchAd}>
                            <Text style={styles.adButtonText}>🎬 Watch Ad for +2</Text>
                        </Pressable>
                    )}
                    {onUpgrade && (
                        <Pressable style={styles.upgradeButton} onPress={onUpgrade}>
                            <Text style={styles.upgradeButtonText}>⭐ Go Premium</Text>
                        </Pressable>
                    )}
                </View>
            )}

            {isLow && !isEmpty && !quota.isPremium && (
                <Text style={styles.warningText}>
                    Running low! Watch an ad or upgrade for more try-ons.
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.md,
    },
    containerEmpty: {
        borderColor: colors.accent.secondary,
        backgroundColor: colors.accent.secondary + '10',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    quotaInfo: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: spacing.xs,
    },
    quotaCount: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
        color: colors.accent.primary,
    },
    quotaCountEmpty: {
        color: colors.accent.secondary,
    },
    quotaLabel: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
    resetText: {
        fontSize: typography.fontSize.xs,
        color: colors.text.tertiary,
    },
    progressBar: {
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.accent.primary,
        borderRadius: 3,
    },
    progressFillLow: {
        backgroundColor: '#F59E0B', // warning amber
    },
    progressFillEmpty: {
        backgroundColor: colors.accent.secondary,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    adButton: {
        flex: 1,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.accent.primary,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    adButtonText: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        color: colors.accent.primary,
    },
    upgradeButton: {
        flex: 1,
        backgroundColor: colors.accent.primary,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    upgradeButtonText: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.inverse,
    },
    warningText: {
        fontSize: typography.fontSize.xs,
        color: '#F59E0B',
        marginTop: spacing.sm,
        textAlign: 'center',
    },
});
