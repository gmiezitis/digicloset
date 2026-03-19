import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRemainingQuota, useShouldShowAds, useHasPremium3D } from '../services/quotaStore';
import { useRewardedAd } from '../services/adService';
import { colors, spacing, typography, borderRadius } from '../theme';

/**
 * QuotaStatusBar
 * 
 * Displays remaining processings and upgrade prompts for free users.
 * Compact design for use in header or bottom of screens.
 */
export function QuotaStatusBar() {
    const quota = useRemainingQuota();
    const showAds = useShouldShowAds();

    // Don't show for premium users
    if (!showAds) {
        return null;
    }

    const isLow = quota.percentUsed > 80;
    const isEmpty = quota.processingsRemaining === 0;

    return (
        <View style={[styles.container, isEmpty && styles.containerEmpty]}>
            <View style={styles.progressBar}>
                <View
                    style={[
                        styles.progressFill,
                        { width: `${Math.min(quota.percentUsed, 100)}%` },
                        isLow && styles.progressFillLow,
                    ]}
                />
            </View>
            <Text style={[styles.text, isEmpty && styles.textEmpty]}>
                {isEmpty
                    ? '0 processings left • Upgrade for more!'
                    : `${quota.processingsRemaining} processings left`
                }
            </Text>
        </View>
    );
}

/**
 * QuotaExhaustedCard
 * 
 * Shows when user has no processings remaining.
 * Offers rewarded ad option and upgrade CTA.
 */
export function QuotaExhaustedCard() {
    const { showAd, isAvailable, bonusAmount } = useRewardedAd();
    const [isWatching, setIsWatching] = React.useState(false);

    const handleWatchAd = async () => {
        setIsWatching(true);
        try {
            const result = await showAd();
            if (result.completed) {
                // Ad watched successfully, bonus already applied by adService
            }
        } finally {
            setIsWatching(false);
        }
    };

    return (
        <View style={styles.exhaustedCard}>
            <Text style={styles.exhaustedTitle}>Monthly Limit Reached</Text>
            <Text style={styles.exhaustedText}>
                You've used all your free processings this month.
            </Text>

            {isAvailable && (
                <Pressable
                    style={styles.watchAdButton}
                    onPress={handleWatchAd}
                    disabled={isWatching}
                >
                    <Text style={styles.watchAdButtonText}>
                        {isWatching ? 'Loading...' : `Watch Ad for +${bonusAmount} processings`}
                    </Text>
                </Pressable>
            )}

            <Pressable style={styles.upgradeButton}>
                <Text style={styles.upgradeButtonText}>
                    Upgrade to Premium - $7.99/mo
                </Text>
            </Pressable>

            <Text style={styles.benefitsText}>
                ✓ 200 processings/month  ✓ Premium 3D effects  ✓ No ads
            </Text>
        </View>
    );
}

/**
 * Premium3DUpgradePrompt
 * 
 * Shows for free users when 3D effects are available only in premium.
 */
export function Premium3DUpgradePrompt() {
    const hasPremium = useHasPremium3D();

    if (hasPremium) {
        return null;
    }

    return (
        <View style={styles.premium3DPrompt}>
            <Text style={styles.premium3DText}>
                ✨ Premium 3D shadows available with upgrade
            </Text>
        </View>
    );
}

/**
 * ClosetFullCard
 * 
 * Shows when user has reached item limit.
 */
export function ClosetFullCard({ itemLimit }: { itemLimit: number }) {
    return (
        <View style={styles.exhaustedCard}>
            <Text style={styles.exhaustedTitle}>Closet Full</Text>
            <Text style={styles.exhaustedText}>
                You have {itemLimit} items in your closet (the free limit).
                Remove items or upgrade for more space.
            </Text>

            <Pressable style={styles.upgradeButton}>
                <Text style={styles.upgradeButtonText}>
                    Upgrade to Premium - 500 items
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.sm,
    },
    containerEmpty: {
        backgroundColor: colors.error + '20',
    },
    progressBar: {
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        marginBottom: spacing.xs,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 2,
    },
    progressFillLow: {
        backgroundColor: colors.warning,
    },
    text: {
        ...typography.caption,
        color: colors.text.secondary,
        textAlign: 'center',
    },
    textEmpty: {
        color: colors.error,
        fontWeight: '600',
    },

    // Exhausted card
    exhaustedCard: {
        backgroundColor: colors.surface,
        padding: spacing.lg,
        borderRadius: borderRadius.lg,
        alignItems: 'center',
        gap: spacing.md,
    },
    exhaustedTitle: {
        ...typography.headline,
        color: colors.text.primary,
    },
    exhaustedText: {
        ...typography.body,
        color: colors.text.secondary,
        textAlign: 'center',
    },
    watchAdButton: {
        backgroundColor: colors.secondary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        width: '100%',
        alignItems: 'center',
    },
    watchAdButtonText: {
        ...typography.button,
        color: colors.text.primary,
    },
    upgradeButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        width: '100%',
        alignItems: 'center',
    },
    upgradeButtonText: {
        ...typography.button,
        color: '#FFFFFF',
    },
    benefitsText: {
        ...typography.caption,
        color: colors.text.tertiary,
        textAlign: 'center',
    },

    // Premium 3D prompt
    premium3DPrompt: {
        backgroundColor: colors.accent + '20',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.sm,
    },
    premium3DText: {
        ...typography.caption,
        color: colors.accent,
        textAlign: 'center',
    },
});
