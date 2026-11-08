import { Platform } from 'react-native';
import { quotaStore } from './quotaStore';
import { defaultNowUtc } from './storage';

/**
 * Ad Monetization Service
 *
 * Strategy: Show interstitial ad after each item save for free users.
 * 
 * Revenue Model:
 * - Interstitial ads: $2-5 CPM (~$0.002-0.005 per view)
 * - Rewarded ads: $10-20 CPM (~$0.01-0.02 per completion)
 * 
 * At 20K free users × 50 items = 1M ad views = ~$2,000-5,000/month
 */

// Ad Unit IDs - Replace with your actual AdMob IDs
const AD_UNITS = {
    interstitial: {
        ios: 'ca-app-pub-xxxxx/interstitial-ios',
        android: 'ca-app-pub-xxxxx/interstitial-android',
        // Test IDs for development
        test: 'ca-app-pub-3940256099942544/1033173712',
    },
    rewarded: {
        ios: 'ca-app-pub-xxxxx/rewarded-ios',
        android: 'ca-app-pub-xxxxx/rewarded-android',
        // Test IDs for development
        test: 'ca-app-pub-3940256099942544/5224354917',
    },
    banner: {
        ios: 'ca-app-pub-xxxxx/banner-ios',
        android: 'ca-app-pub-xxxxx/banner-android',
        test: 'ca-app-pub-3940256099942544/6300978111',
    },
};

// Configuration
const AD_CONFIG = {
    // Minimum time between interstitial ads (30 seconds)
    minInterstitialInterval: 30000,
    // Bonus processings given for watching rewarded ad
    rewardedAdBonus: 5,
    // Use test ads in development
    useTestAds: __DEV__,
};

export type AdType = 'interstitial' | 'rewarded' | 'banner';

export interface AdResult {
    shown: boolean;
    completed?: boolean;
    reward?: {
        type: string;
        amount: number;
    };
    error?: string;
}

const LOG_TAG = '[ad-service]';

/**
 * AdService Implementation
 * 
 * Manages ad loading, display, and reward handling.
 * Integrates with react-native-google-mobile-ads (to be installed).
 */
class AdServiceImpl {
    private initialized = false;
    private lastInterstitialShown = 0;
    private interstitialLoaded = false;
    private rewardedLoaded = false;

    /**
     * Initialize the ad SDK
     * Call this early in app startup
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // In production, this would initialize AdMob:
            // await mobileAds().initialize();

            this.initialized = true;
            this.log('initialized');

            // Pre-load ads
            await this.preloadAds();
        } catch (error) {
            this.logError('initialization-failed', error);
        }
    }

    /**
     * Pre-load ads for faster display
     */
    private async preloadAds(): Promise<void> {
        try {
            // Pre-load interstitial
            // In production: await InterstitialAd.createForAdRequest(this.getAdUnitId('interstitial'));
            this.interstitialLoaded = true;

            // Pre-load rewarded
            // In production: await RewardedAd.createForAdRequest(this.getAdUnitId('rewarded'));
            this.rewardedLoaded = true;

            this.log('ads-preloaded');
        } catch (error) {
            this.logError('preload-failed', error);
        }
    }

    /**
     * Get the appropriate ad unit ID based on platform
     */
    private getAdUnitId(type: AdType): string {
        if (AD_CONFIG.useTestAds) {
            return AD_UNITS[type].test;
        }
        return Platform.OS === 'ios'
            ? AD_UNITS[type].ios
            : AD_UNITS[type].android;
    }

    /**
     * Check if an interstitial ad should be shown
     */
    shouldShowInterstitial(): boolean {
        // Don't show ads to premium users
        if (!quotaStore.shouldShowAds()) {
            return false;
        }

        // Enforce minimum interval
        const now = Date.now();
        if (now - this.lastInterstitialShown < AD_CONFIG.minInterstitialInterval) {
            this.log('interstitial-rate-limited');
            return false;
        }

        return true;
    }

    /**
     * Show an interstitial ad
     * Returns true if ad was shown successfully
     */
    async showInterstitialAd(): Promise<AdResult> {
        if (!this.initialized) {
            this.log('not-initialized');
            return { shown: false, error: 'Ad service not initialized' };
        }

        if (!this.shouldShowInterstitial()) {
            return { shown: false, error: 'Rate limited or premium user' };
        }

        try {
            // In production, this would show the actual ad:
            // const interstitial = await InterstitialAd.createForAdRequest(this.getAdUnitId('interstitial'));
            // await interstitial.load();
            // await interstitial.show();

            // For now, simulate ad display
            this.log('interstitial-shown');
            this.lastInterstitialShown = Date.now();

            // Reload for next time
            this.preloadAds();

            return { shown: true, completed: true };
        } catch (error) {
            this.logError('interstitial-failed', error);
            return { shown: false, error: 'Failed to show ad' };
        }
    }

    /**
     * Show a rewarded ad (e.g., for extra processings)
     */
    async showRewardedAd(): Promise<AdResult> {
        if (!this.initialized) {
            return { shown: false, error: 'Ad service not initialized' };
        }

        // Premium users shouldn't see rewarded ads either
        if (!quotaStore.shouldShowAds()) {
            return { shown: false, error: 'Premium user' };
        }

        try {
            // In production:
            // const rewarded = await RewardedAd.createForAdRequest(this.getAdUnitId('rewarded'));
            // await rewarded.load();
            // const result = await rewarded.show();

            // Simulate successful reward
            this.log('rewarded-shown');

            // Grant the bonus
            quotaStore.addBonusProcessings(AD_CONFIG.rewardedAdBonus);

            // Reload for next time
            this.preloadAds();

            return {
                shown: true,
                completed: true,
                reward: {
                    type: 'extra_processings',
                    amount: AD_CONFIG.rewardedAdBonus,
                },
            };
        } catch (error) {
            this.logError('rewarded-failed', error);
            return { shown: false, error: 'Failed to show rewarded ad' };
        }
    }

    /**
     * Hook for post-save ad display
     * Shows an interstitial after saving an item (free users only)
     */
    async onItemSaved(): Promise<void> {
        if (this.shouldShowInterstitial()) {
            await this.showInterstitialAd();
        }
    }

    /**
     * Check if rewarded ad is available
     */
    isRewardedAdAvailable(): boolean {
        return this.initialized && this.rewardedLoaded && quotaStore.shouldShowAds();
    }

    /**
     * Get the bonus amount for watching a rewarded ad
     */
    getRewardedBonus(): number {
        return AD_CONFIG.rewardedAdBonus;
    }

    private log(event: string, data?: Record<string, unknown>) {
        console.log(`${LOG_TAG} ${event}`, {
            timestamp: defaultNowUtc(),
            ...data,
        });
    }

    private logError(event: string, error: unknown) {
        console.error(`${LOG_TAG} ${event}`, {
            timestamp: defaultNowUtc(),
            error,
        });
    }
}

// Singleton instance
export const adService = new AdServiceImpl();

/**
 * React hook for showing post-save ads
 * 
 * Usage in AddItemFlow:
 * ```
 * const showPostSaveAd = usePostSaveAd();
 * 
 * const handleSave = async () => {
 *   await saveItem();
 *   await showPostSaveAd();
 * };
 * ```
 */
export function usePostSaveAd() {
    return async () => {
        await adService.onItemSaved();
    };
}

/**
 * React hook for rewarded ad functionality
 * 
 * Usage:
 * ```
 * const { showAd, isAvailable, bonusAmount } = useRewardedAd();
 * 
 * <Button
 *   title={`Watch Ad for +${bonusAmount} processings`}
 *   onPress={showAd}
 *   disabled={!isAvailable}
 * />
 * ```
 */
export function useRewardedAd() {
    return {
        showAd: () => adService.showRewardedAd(),
        isAvailable: adService.isRewardedAdAvailable(),
        bonusAmount: adService.getRewardedBonus(),
    };
}
