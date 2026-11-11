import { useSyncExternalStore } from 'react';
import { defaultNowUtc } from './storage';

/**
 * Subscription Tiers
 * 
 * Two tiers only:
 * - free: Ad-supported, limited features
 * - premium: Full features, no ads
 */
export type SubscriptionTier = 'free' | 'premium';

/**
 * Tier limits configuration
 * These values protect cloud costs and define the product offering.
 */
export const TIER_LIMITS = {
    free: {
        maxItems: 50,
        aiProcessingsPerMonth: 15,
        tryOnsPerWeek: 5,
        mannequinModels: ['neutral'] as const,
        customPhotoTryOns: false,
        premium3DEffects: false,
        showAds: true,
        maxImageSizeMB: 5,
    },
    premium: {
        maxItems: 500,
        aiProcessingsPerMonth: 200,
        tryOnsPerWeek: 50,
        mannequinModels: ['neutral', 'man', 'child', 'dog', 'cat'] as const,
        customPhotoTryOns: true,
        premium3DEffects: true,
        showAds: false,
        maxImageSizeMB: 15,
    },
} as const;

export interface QuotaUsage {
    processingsThisMonth: number;
    processingsLimit: number;
    itemsCount: number;
    itemsLimit: number;
    lastProcessingAt: string | null;
    tryOnsThisWeek: number;
    tryOnsLimit: number;
    tryOnWeekStartsAt: string | null;
}

export interface SubscriptionInfo {
    tier: SubscriptionTier;
    expiresAt: string | null;
    isActive: boolean;
    platform: 'ios' | 'android' | 'web' | null;
    purchaseToken: string | null;
}

export interface QuotaState {
    tier: SubscriptionTier;
    usage: QuotaUsage;
    subscription: SubscriptionInfo;
    lastSyncedAt: string | null;
    isLoading: boolean;
}

type QuotaListener = () => void;

const LOG_TAG = '[quota-store]';

/**
 * QuotaStore
 * 
 * Manages user subscription tier and usage quotas.
 * Syncs with backend and provides hooks for UI components.
 */
class QuotaStoreImpl {
    private state: QuotaState = {
        tier: 'free',
        usage: {
            processingsThisMonth: 0,
            processingsLimit: TIER_LIMITS.free.aiProcessingsPerMonth,
            itemsCount: 0,
            itemsLimit: TIER_LIMITS.free.maxItems,
            lastProcessingAt: null,
            tryOnsThisWeek: 0,
            tryOnsLimit: TIER_LIMITS.free.tryOnsPerWeek,
            tryOnWeekStartsAt: null,
        },
        subscription: {
            tier: 'free',
            expiresAt: null,
            isActive: false,
            platform: null,
            purchaseToken: null,
        },
        lastSyncedAt: null,
        isLoading: false,
    };

    private listeners = new Set<QuotaListener>();

    // React external store subscription
    subscribe = (listener: QuotaListener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = () => this.state;

    private emit() {
        this.listeners.forEach(listener => listener());
    }

    private setState(updater: (prev: QuotaState) => QuotaState) {
        this.state = updater(this.state);
        this.emit();
    }

    /**
     * Check if user can process another image
     */
    canProcess(): { allowed: boolean; reason?: string } {
        const { usage } = this.state;

        if (usage.processingsThisMonth >= usage.processingsLimit) {
            return {
                allowed: false,
                reason: `You've used all ${usage.processingsLimit} processings this month. Upgrade to Premium for more!`,
            };
        }

        return { allowed: true };
    }

    /**
     * Check if user can add another item to closet
     */
    canAddItem(): { allowed: boolean; reason?: string } {
        const { usage } = this.state;

        if (usage.itemsCount >= usage.itemsLimit) {
            return {
                allowed: false,
                reason: `Your closet is full (${usage.itemsLimit} items). Upgrade to Premium for more space!`,
            };
        }

        return { allowed: true };
    }

    /**
     * Get remaining quota for UI display
     */
    getRemainingQuota() {
        const { usage, tier } = this.state;
        return {
            processingsRemaining: usage.processingsLimit - usage.processingsThisMonth,
            itemsRemaining: usage.itemsLimit - usage.itemsCount,
            tier,
            percentUsed: Math.round((usage.processingsThisMonth / usage.processingsLimit) * 100),
        };
    }

    /**
     * Check if ads should be shown
     */
    shouldShowAds(): boolean {
        return TIER_LIMITS[this.state.tier].showAds;
    }

    /**
     * Check if premium 3D effects are available
     */
    hasPremium3D(): boolean {
        return TIER_LIMITS[this.state.tier].premium3DEffects;
    }

    /**
     * Increment usage after successful processing
     * Called after an image is processed successfully
     */
    incrementProcessingUsage() {
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                processingsThisMonth: prev.usage.processingsThisMonth + 1,
                lastProcessingAt: defaultNowUtc(),
            },
        }));
        this.log('processing-incremented', {
            new: this.state.usage.processingsThisMonth,
            limit: this.state.usage.processingsLimit,
        });
    }

    /**
     * Increment item count after adding new item
     */
    incrementItemCount() {
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                itemsCount: prev.usage.itemsCount + 1,
            },
        }));
    }

    /**
     * Decrement item count after removing item
     */
    decrementItemCount() {
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                itemsCount: Math.max(0, prev.usage.itemsCount - 1),
            },
        }));
    }

    /**
     * Update tier from subscription status
     */
    setTier(tier: SubscriptionTier, subscription?: Partial<SubscriptionInfo>) {
        const limits = TIER_LIMITS[tier];
        this.setState(prev => ({
            ...prev,
            tier,
            usage: {
                ...prev.usage,
                processingsLimit: limits.aiProcessingsPerMonth,
                itemsLimit: limits.maxItems,
            },
            subscription: {
                ...prev.subscription,
                tier,
                ...subscription,
            },
        }));
        this.log('tier-updated', { tier });
    }

    /**
     * Sync quota from backend
     */
    async syncFromBackend(data: {
        tier: SubscriptionTier;
        processingsThisMonth: number;
        itemsCount: number;
        tryOnsThisWeek?: number;
        subscription?: Partial<SubscriptionInfo>;
    }) {
        const limits = TIER_LIMITS[data.tier];
        this.setState(prev => ({
            ...prev,
            tier: data.tier,
            usage: {
                processingsThisMonth: data.processingsThisMonth,
                processingsLimit: limits.aiProcessingsPerMonth,
                itemsCount: data.itemsCount,
                itemsLimit: limits.maxItems,
                lastProcessingAt: prev.usage.lastProcessingAt,
                tryOnsThisWeek: data.tryOnsThisWeek ?? prev.usage.tryOnsThisWeek,
                tryOnsLimit: limits.tryOnsPerWeek,
                tryOnWeekStartsAt: prev.usage.tryOnWeekStartsAt,
            },
            subscription: {
                ...prev.subscription,
                tier: data.tier,
                ...data.subscription,
            },
            lastSyncedAt: defaultNowUtc(),
            isLoading: false,
        }));
        this.log('synced-from-backend', data);
    }

    /**
     * Add bonus processings (from rewarded ads)
     */
    addBonusProcessings(count: number) {
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                processingsLimit: prev.usage.processingsLimit + count,
            },
        }));
        this.log('bonus-added', { count, newLimit: this.state.usage.processingsLimit });
    }

    /**
     * Reset monthly usage (called at month start)
     */
    resetMonthlyUsage() {
        const limits = TIER_LIMITS[this.state.tier];
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                processingsThisMonth: 0,
                processingsLimit: limits.aiProcessingsPerMonth,
                lastProcessingAt: null,
            },
        }));
        this.log('monthly-reset');
    }

    /**
     * Check if user can perform a try-on
     */
    canTryOn(): { allowed: boolean; reason?: string } {
        const { usage, tier } = this.state;

        // Check if we need to reset weekly counter
        this.checkWeeklyReset();

        if (usage.tryOnsThisWeek >= usage.tryOnsLimit) {
            return {
                allowed: false,
                reason: tier === 'free'
                    ? `You've used all ${usage.tryOnsLimit} try-ons this week. Upgrade to Premium or watch an ad for more!`
                    : `You've reached your weekly limit of ${usage.tryOnsLimit} try-ons.`,
            };
        }

        return { allowed: true };
    }

    /**
     * Increment try-on usage after successful generation
     */
    incrementTryOnUsage() {
        this.checkWeeklyReset();
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                tryOnsThisWeek: prev.usage.tryOnsThisWeek + 1,
            },
        }));
        this.log('try-on-incremented', {
            current: this.state.usage.tryOnsThisWeek,
            limit: this.state.usage.tryOnsLimit,
        });
    }

    /**
     * Get try-on quota info for UI display
     */
    getTryOnQuota() {
        this.checkWeeklyReset();
        const { usage, tier } = this.state;
        return {
            remaining: Math.max(0, usage.tryOnsLimit - usage.tryOnsThisWeek),
            total: usage.tryOnsLimit,
            used: usage.tryOnsThisWeek,
            resetsAt: this.getNextMondayUtc(),
            isPremium: tier === 'premium',
        };
    }

    /**
     * Add bonus try-ons (from rewarded ads)
     */
    addBonusTryOns(count: number) {
        this.setState(prev => ({
            ...prev,
            usage: {
                ...prev.usage,
                tryOnsLimit: prev.usage.tryOnsLimit + count,
            },
        }));
        this.log('try-on-bonus-added', { count, newLimit: this.state.usage.tryOnsLimit });
    }

    /**
     * Check and reset weekly try-on counter if needed (Monday reset)
     */
    private checkWeeklyReset() {
        const now = new Date();
        const weekStart = this.state.usage.tryOnWeekStartsAt;

        if (!weekStart || this.isNewWeek(weekStart)) {
            const limits = TIER_LIMITS[this.state.tier];
            const mondayUtc = this.getCurrentMondayUtc();

            this.setState(prev => ({
                ...prev,
                usage: {
                    ...prev.usage,
                    tryOnsThisWeek: 0,
                    tryOnsLimit: limits.tryOnsPerWeek,
                    tryOnWeekStartsAt: mondayUtc,
                },
            }));
            this.log('weekly-try-on-reset', { weekStart: mondayUtc });
        }
    }

    /**
     * Check if the given date is from a previous week
     */
    private isNewWeek(weekStartUtc: string): boolean {
        const weekStart = new Date(weekStartUtc);
        const now = new Date();
        const currentMonday = this.getCurrentMondayDate();
        return weekStart < currentMonday;
    }

    /**
     * Get the Monday of the current week
     */
    private getCurrentMondayDate(): Date {
        const now = new Date();
        const day = now.getUTCDay();
        const diff = day === 0 ? 6 : day - 1; // Sunday is 0, Monday is 1
        const monday = new Date(now);
        monday.setUTCDate(now.getUTCDate() - diff);
        monday.setUTCHours(0, 0, 0, 0);
        return monday;
    }

    private getCurrentMondayUtc(): string {
        return this.getCurrentMondayDate().toISOString();
    }

    private getNextMondayUtc(): string {
        const monday = this.getCurrentMondayDate();
        monday.setUTCDate(monday.getUTCDate() + 7);
        return monday.toISOString();
    }

    /**
     * Get available mannequin models for current tier
     */
    getAvailableMannequins(): readonly string[] {
        return TIER_LIMITS[this.state.tier].mannequinModels;
    }

    private log(event: string, data?: Record<string, unknown>) {
        console.log(`${LOG_TAG} ${event}`, {
            timestamp: defaultNowUtc(),
            ...data,
        });
    }
}

// Singleton instance
export const quotaStore = new QuotaStoreImpl();

/**
 * Hook to access quota state
 */
export function useQuota(): QuotaState {
    return useSyncExternalStore(
        quotaStore.subscribe,
        quotaStore.getSnapshot,
        quotaStore.getSnapshot
    );
}

/**
 * Hook to check if user can process
 */
export function useCanProcess(): { allowed: boolean; reason?: string } {
    const quota = useQuota();
    return quotaStore.canProcess();
}

/**
 * Hook to check if user can add item
 */
export function useCanAddItem(): { allowed: boolean; reason?: string } {
    const quota = useQuota();
    return quotaStore.canAddItem();
}

/**
 * Hook to get remaining quota info
 */
export function useRemainingQuota() {
    const quota = useQuota();
    return quotaStore.getRemainingQuota();
}

/**
 * Hook to check if ads should be shown
 */
export function useShouldShowAds(): boolean {
    const quota = useQuota();
    return quotaStore.shouldShowAds();
}

/**
 * Hook to check premium 3D availability
 */
export function useHasPremium3D(): boolean {
    const quota = useQuota();
    return quotaStore.hasPremium3D();
}

/**
 * Hook to check if user can try-on
 */
export function useCanTryOn(): { allowed: boolean; reason?: string } {
    const quota = useQuota();
    return quotaStore.canTryOn();
}

/**
 * Hook to get try-on quota info
 */
export function useTryOnQuota() {
    const quota = useQuota();
    return quotaStore.getTryOnQuota();
}

/**
 * Hook to get available mannequin models for current tier
 */
export function useAvailableMannequins(): readonly string[] {
    const quota = useQuota();
    return quotaStore.getAvailableMannequins();
}
