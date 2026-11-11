/**
 * Try-On Screen
 * 
 * Main virtual try-on interface where users can:
 * - Select a mannequin model
 * - Generate try-on previews
 * - Save/share results
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Alert,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ModelSelector, TryOnPreview, TryOnQuotaBar } from '@/components/tryOn';
import {
    getMannequinModels,
    getMannequinById,
    generateTryOnPreview,
    generateTryOnHD,
} from '@/services/tryOnService';
import { quotaStore, useCanTryOn, useQuota } from '@/services/quotaStore';
import { adService } from '@/services/adService';
import type {
    MannequinModel,
    MannequinType,
    TryOnStatus,
    TryOnCategory,
} from '@/types/tryOn';
import { mapItemCategoryToTryOn } from '@/types/tryOn';

interface TryOnRouteParams {
    garmentUri: string;
    garmentName?: string;
    category?: string;
}

export function TryOnScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const params = (route.params as TryOnRouteParams) || {};

    const quota = useQuota();
    const canTryOn = useCanTryOn();
    const isPremium = quota.tier === 'premium';

    // State
    const [selectedModel, setSelectedModel] = useState<MannequinType | null>('neutral');
    const [status, setStatus] = useState<TryOnStatus>('idle');
    const [previewUri, setPreviewUri] = useState<string | undefined>();
    const [hdUri, setHdUri] = useState<string | undefined>();
    const [errorMessage, setErrorMessage] = useState<string | undefined>();

    // Get available models based on tier
    const models = getMannequinModels(isPremium);

    // Determine try-on category from garment
    const tryOnCategory: TryOnCategory = params.category
        ? mapItemCategoryToTryOn(params.category)
        : 'upper_body';

    const handleModelSelect = useCallback((model: MannequinModel) => {
        setSelectedModel(model.id);
    }, []);

    const handleUpgradePress = useCallback(() => {
        Alert.alert(
            'Upgrade to Premium',
            'Unlock all models including man, child, and pet mannequins with Premium!',
            [
                { text: 'Maybe Later', style: 'cancel' },
                {
                    text: 'Learn More', onPress: () => {
                        // TODO: Navigate to subscription screen
                    }
                },
            ]
        );
    }, []);

    const handleTryOn = useCallback(async () => {
        if (!selectedModel || !params.garmentUri) {
            Alert.alert('Missing Selection', 'Please select a model and garment.');
            return;
        }

        // Check quota
        const canDo = quotaStore.canTryOn();
        if (!canDo.allowed) {
            Alert.alert('Try-On Limit Reached', canDo.reason);
            return;
        }

        const model = getMannequinById(selectedModel);
        if (!model) return;

        setStatus('processing');
        setErrorMessage(undefined);

        try {
            // Generate preview first (fast)
            const previewResult = await generateTryOnPreview(
                params.garmentUri,
                model.imageUri.toString(),
                tryOnCategory
            );

            if (!previewResult.success) {
                setStatus('error');
                setErrorMessage(previewResult.error);
                return;
            }

            setPreviewUri(previewResult.previewUri);
            setStatus('preview_ready');

            // Increment usage
            quotaStore.incrementTryOnUsage();

            // Generate HD in background
            const hdResult = await generateTryOnHD(
                params.garmentUri,
                model.imageUri.toString(),
                tryOnCategory
            );

            if (hdResult.success && hdResult.hdUri) {
                setHdUri(hdResult.hdUri);
                setStatus('hd_ready');
            }
        } catch (error) {
            setStatus('error');
            setErrorMessage(error instanceof Error ? error.message : 'Try-on failed');
        }
    }, [selectedModel, params.garmentUri, tryOnCategory]);

    const handleRetry = useCallback(() => {
        setStatus('idle');
        setPreviewUri(undefined);
        setHdUri(undefined);
        setErrorMessage(undefined);
    }, []);

    const handleSave = useCallback(() => {
        Alert.alert('Saved!', 'Your try-on look has been saved to your gallery.');
        // TODO: Implement actual save logic
    }, []);

    const handleShare = useCallback(() => {
        Alert.alert('Share', 'Sharing functionality coming soon!');
        // TODO: Implement share logic
    }, []);

    const handleWatchAd = useCallback(async () => {
        const success = await adService.showRewardedAd();
        if (success) {
            quotaStore.addBonusTryOns(2);
            Alert.alert('Bonus Earned!', 'You earned 2 extra try-ons this week!');
        }
    }, []);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </Pressable>
                <Text style={styles.title}>Virtual Try-On</Text>
            </View>

            {params.garmentName && (
                <Text style={styles.garmentLabel}>
                    Trying on: <Text style={styles.garmentName}>{params.garmentName}</Text>
                </Text>
            )}

            <TryOnQuotaBar
                onWatchAd={handleWatchAd}
                onUpgrade={handleUpgradePress}
            />

            <TryOnPreview
                status={status}
                previewUri={previewUri}
                hdUri={hdUri}
                onSave={handleSave}
                onShare={handleShare}
                onRetry={handleRetry}
                errorMessage={errorMessage}
            />

            <ModelSelector
                models={models}
                selectedId={selectedModel}
                onSelect={handleModelSelect}
                onUpgradePress={handleUpgradePress}
            />

            <Pressable
                style={[
                    styles.tryOnButton,
                    (!canTryOn.allowed || status === 'processing') && styles.tryOnButtonDisabled,
                ]}
                onPress={handleTryOn}
                disabled={!canTryOn.allowed || status === 'processing'}
            >
                <Text style={styles.tryOnButtonText}>
                    {status === 'processing' ? 'Creating...' : '✨ Try It On'}
                </Text>
            </Pressable>

            {!canTryOn.allowed && (
                <Text style={styles.quotaWarning}>{canTryOn.reason}</Text>
            )}

            <View style={styles.tipsSection}>
                <Text style={styles.tipsTitle}>💡 Tips</Text>
                <Text style={styles.tipsText}>
                    • Choose the model that best matches your style{'\n'}
                    • HD results take a few extra seconds{'\n'}
                    • Premium unlocks man, child, and pet models
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.lg,
        gap: spacing.md,
    },
    backButton: {
        padding: spacing.sm,
        marginLeft: -spacing.sm,
    },
    backButtonText: {
        fontSize: typography.fontSize.md,
        color: colors.accent.primary,
        fontWeight: typography.fontWeight.medium,
    },
    title: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.primary,
        flex: 1,
    },
    garmentLabel: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        marginBottom: spacing.md,
    },
    garmentName: {
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
    },
    tryOnButton: {
        backgroundColor: colors.accent.primary,
        paddingVertical: spacing.lg,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    tryOnButtonDisabled: {
        backgroundColor: colors.border,
    },
    tryOnButtonText: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.inverse,
    },
    quotaWarning: {
        fontSize: typography.fontSize.sm,
        color: colors.accent.secondary,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    tipsSection: {
        backgroundColor: colors.accent.primary + '15',
        padding: spacing.lg,
        borderRadius: borderRadius.md,
    },
    tipsTitle: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
        marginBottom: spacing.sm,
    },
    tipsText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        lineHeight: 22,
    },
});
