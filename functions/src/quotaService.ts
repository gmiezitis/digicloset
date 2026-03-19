import * as admin from 'firebase-admin';

const db = admin.firestore();
const LOG_TAG = '[quota-service]';

/**
 * Tier-based usage limits
 * Two tiers only: free (ad-supported) and premium (no ads)
 */
export const TIER_LIMITS = {
    free: {
        maxItems: 50,
        aiProcessingsPerMonth: 15,
        premium3DEffects: false,
        showAds: true,
        maxImageSizeMB: 5,
    },
    premium: {
        maxItems: 500,
        aiProcessingsPerMonth: 200,
        premium3DEffects: true,
        showAds: false,
        maxImageSizeMB: 15,
    },
} as const;

export type UserTier = keyof typeof TIER_LIMITS;

export interface QuotaCheckResult {
    canProcess: boolean;
    tier: UserTier;
    reason?: string;
    usage: {
        thisMonth: number;
        limit: number;
        remaining: number;
    };
}

/**
 * Check if a user can process another image
 */
export async function checkUserQuota(userId: string): Promise<QuotaCheckResult> {
    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};

    // Determine tier (default to free)
    const tier: UserTier = userData.subscriptionTier || 'free';
    const limits = TIER_LIMITS[tier];

    // Get current month's usage
    const currentMonth = getCurrentMonthKey();
    const usageDoc = await db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(currentMonth)
        .get();

    const usageData = usageDoc.data() || { processings: 0 };
    const thisMonth = usageData.processings || 0;

    // Check processing quota
    if (thisMonth >= limits.aiProcessingsPerMonth) {
        console.log(`${LOG_TAG} User ${userId} exceeded monthly limit (${thisMonth}/${limits.aiProcessingsPerMonth})`);
        return {
            canProcess: false,
            tier,
            reason: `Monthly limit reached (${limits.aiProcessingsPerMonth} processings). Upgrade to Premium for more!`,
            usage: {
                thisMonth,
                limit: limits.aiProcessingsPerMonth,
                remaining: 0,
            },
        };
    }

    // Check total items limit
    const itemsCount = userData.itemsCount || 0;
    if (itemsCount >= limits.maxItems) {
        console.log(`${LOG_TAG} User ${userId} exceeded items limit (${itemsCount}/${limits.maxItems})`);
        return {
            canProcess: false,
            tier,
            reason: `Closet is full (${limits.maxItems} items). Upgrade to Premium for more space!`,
            usage: {
                thisMonth,
                limit: limits.aiProcessingsPerMonth,
                remaining: limits.aiProcessingsPerMonth - thisMonth,
            },
        };
    }

    // All checks passed
    return {
        canProcess: true,
        tier,
        usage: {
            thisMonth,
            limit: limits.aiProcessingsPerMonth,
            remaining: limits.aiProcessingsPerMonth - thisMonth,
        },
    };
}

/**
 * Increment usage after successful processing
 */
export async function incrementUsage(
    userId: string,
    tier: UserTier
): Promise<void> {
    const currentMonth = getCurrentMonthKey();
    const usageRef = db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(currentMonth);

    await usageRef.set(
        {
            processings: admin.firestore.FieldValue.increment(1),
            lastProcessingAt: admin.firestore.FieldValue.serverTimestamp(),
            tier,
        },
        { merge: true }
    );

    console.log(`${LOG_TAG} Incremented usage for ${userId} in ${currentMonth}`);
}

/**
 * Increment item count when adding new item
 */
export async function incrementItemCount(userId: string): Promise<void> {
    await db.collection('users').doc(userId).set(
        {
            itemsCount: admin.firestore.FieldValue.increment(1),
            lastItemAddedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Decrement item count when removing item
 */
export async function decrementItemCount(userId: string): Promise<void> {
    await db.collection('users').doc(userId).set(
        {
            itemsCount: admin.firestore.FieldValue.increment(-1),
        },
        { merge: true }
    );
}

/**
 * Add bonus processings (from rewarded ads)
 */
export async function addBonusProcessings(
    userId: string,
    amount: number
): Promise<void> {
    const currentMonth = getCurrentMonthKey();
    const usageRef = db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(currentMonth);

    await usageRef.set(
        {
            bonusProcessings: admin.firestore.FieldValue.increment(amount),
            lastBonusAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    console.log(`${LOG_TAG} Added ${amount} bonus processings for ${userId}`);
}

/**
 * Get user's current usage stats
 */
export async function getUserUsage(userId: string): Promise<{
    tier: UserTier;
    processingsThisMonth: number;
    processingsLimit: number;
    itemsCount: number;
    itemsLimit: number;
}> {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const tier: UserTier = userData.subscriptionTier || 'free';
    const limits = TIER_LIMITS[tier];

    const currentMonth = getCurrentMonthKey();
    const usageDoc = await db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(currentMonth)
        .get();

    const usageData = usageDoc.data() || {};
    const processings = usageData.processings || 0;
    const bonus = usageData.bonusProcessings || 0;

    return {
        tier,
        processingsThisMonth: processings,
        processingsLimit: limits.aiProcessingsPerMonth + bonus,
        itemsCount: userData.itemsCount || 0,
        itemsLimit: limits.maxItems,
    };
}

/**
 * Get current month key (YYYY-MM format)
 */
function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
