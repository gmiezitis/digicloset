"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_LIMITS = void 0;
exports.checkUserQuota = checkUserQuota;
exports.incrementUsage = incrementUsage;
exports.incrementItemCount = incrementItemCount;
exports.decrementItemCount = decrementItemCount;
exports.addBonusProcessings = addBonusProcessings;
exports.getUserUsage = getUserUsage;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const LOG_TAG = '[quota-service]';
/**
 * Tier-based usage limits
 * Two tiers only: free (ad-supported) and premium (no ads)
 */
exports.TIER_LIMITS = {
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
};
/**
 * Check if a user can process another image
 */
async function checkUserQuota(userId) {
    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    // Determine tier (default to free)
    const tier = userData.subscriptionTier || 'free';
    const limits = exports.TIER_LIMITS[tier];
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
async function incrementUsage(userId, tier) {
    const currentMonth = getCurrentMonthKey();
    const usageRef = db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(currentMonth);
    await usageRef.set({
        processings: admin.firestore.FieldValue.increment(1),
        lastProcessingAt: admin.firestore.FieldValue.serverTimestamp(),
        tier,
    }, { merge: true });
    console.log(`${LOG_TAG} Incremented usage for ${userId} in ${currentMonth}`);
}
/**
 * Increment item count when adding new item
 */
async function incrementItemCount(userId) {
    await db.collection('users').doc(userId).set({
        itemsCount: admin.firestore.FieldValue.increment(1),
        lastItemAddedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
/**
 * Decrement item count when removing item
 */
async function decrementItemCount(userId) {
    await db.collection('users').doc(userId).set({
        itemsCount: admin.firestore.FieldValue.increment(-1),
    }, { merge: true });
}
/**
 * Add bonus processings (from rewarded ads)
 */
async function addBonusProcessings(userId, amount) {
    const currentMonth = getCurrentMonthKey();
    const usageRef = db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(currentMonth);
    await usageRef.set({
        bonusProcessings: admin.firestore.FieldValue.increment(amount),
        lastBonusAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`${LOG_TAG} Added ${amount} bonus processings for ${userId}`);
}
/**
 * Get user's current usage stats
 */
async function getUserUsage(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const tier = userData.subscriptionTier || 'free';
    const limits = exports.TIER_LIMITS[tier];
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
function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
//# sourceMappingURL=quotaService.js.map