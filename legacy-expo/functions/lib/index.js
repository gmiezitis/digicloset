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
exports.resetMonthlyQuotas = exports.upgradeToPremium = exports.getQuotaStatus = exports.onImageUpload = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const imageProcessor_1 = require("./imageProcessor");
const quotaService_1 = require("./quotaService");
// Initialize Firebase Admin
admin.initializeApp();
const LOG_TAG = '[functions]';
/**
 * Triggered when a new image is uploaded to Firebase Storage.
 * Routes to appropriate processing tier based on user subscription.
 *
 * Expected path: users/{userId}/uploads/{imageId}.{ext}
 */
exports.onImageUpload = functions
    .runWith({
    memory: '512MB',
    timeoutSeconds: 120,
    maxInstances: 50, // Cost control: limit concurrent executions
})
    .storage.object()
    .onFinalize(async (object) => {
    const filePath = object.name;
    // Only process uploads in user directories
    if (!filePath?.startsWith('users/') || !filePath.includes('/uploads/')) {
        console.log(`${LOG_TAG} Skipping non-upload file: ${filePath}`);
        return;
    }
    const userId = filePath.split('/')[1];
    console.log(`${LOG_TAG} Processing upload for user: ${userId}`);
    // Check quota before processing
    const quota = await (0, quotaService_1.checkUserQuota)(userId);
    if (!quota.canProcess) {
        console.log(`${LOG_TAG} Quota exceeded for ${userId}: ${quota.reason}`);
        await notifyQuotaExceeded(userId, quota.reason || 'Monthly limit reached');
        return;
    }
    try {
        // Process the image
        const result = await (0, imageProcessor_1.processImageUpload)({
            bucket: object.bucket,
            filePath,
            userId,
            userTier: quota.tier,
            contentType: object.contentType,
        });
        // Increment usage on success
        await (0, quotaService_1.incrementUsage)(userId, quota.tier);
        // Notify user of completion
        await notifyProcessingComplete(userId, {
            originalPath: filePath,
            processedPath: result.processedPath,
            tier: quota.tier,
        });
        console.log(`${LOG_TAG} Successfully processed image for ${userId}`);
    }
    catch (error) {
        console.error(`${LOG_TAG} Processing failed for ${userId}:`, error);
        await notifyProcessingFailed(userId, filePath);
    }
});
/**
 * HTTP endpoint to get user quota status
 */
exports.getQuotaStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = context.auth.uid;
    const quota = await (0, quotaService_1.checkUserQuota)(userId);
    return {
        tier: quota.tier,
        usage: quota.usage,
        limits: quotaService_1.TIER_LIMITS[quota.tier],
        canProcess: quota.canProcess,
        reason: quota.reason,
    };
});
/**
 * HTTP endpoint to upgrade user to premium.
 *
 * Purchases are not verified with the App Store / Play Store yet, so outside
 * the local emulator this refuses every request. Otherwise any signed-in user
 * could call it and get premium for free.
 */
exports.upgradeToPremium = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    // TODO: Verify purchaseToken with App Store / Play Store, then remove this guard.
    if (process.env.FUNCTIONS_EMULATOR !== 'true') {
        throw new functions.https.HttpsError('failed-precondition', 'Purchase verification is not available yet');
    }
    const userId = context.auth.uid;
    const platform = data?.platform;
    if (platform !== 'ios' && platform !== 'android') {
        throw new functions.https.HttpsError('invalid-argument', 'platform must be ios or android');
    }
    const db = admin.firestore();
    await db.collection('users').doc(userId).set({
        subscriptionTier: 'premium',
        subscriptionPlatform: platform,
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // In production, store purchase verification details
    }, { merge: true });
    console.log(`${LOG_TAG} User ${userId} upgraded to premium`);
    return { success: true, tier: 'premium' };
});
/**
 * Scheduled function to reset monthly quotas
 * Runs on the 1st of each month
 */
exports.resetMonthlyQuotas = functions.pubsub
    .schedule('0 0 1 * *')
    .timeZone('UTC')
    .onRun(async () => {
    console.log(`${LOG_TAG} Resetting monthly quotas...`);
    const db = admin.firestore();
    const currentMonth = getCurrentMonthKey();
    console.log(`${LOG_TAG} Current month: ${currentMonth}`);
    // Archive last month's usage stats
    const usersSnapshot = await db.collection('users').get();
    for (const userDoc of usersSnapshot.docs) {
        try {
            // Get last month's usage for analytics
            const lastMonth = getLastMonthKey();
            const usageDoc = await db
                .collection('users')
                .doc(userDoc.id)
                .collection('usage')
                .doc(lastMonth)
                .get();
            if (usageDoc.exists) {
                // Archive to analytics collection
                await db.collection('analytics').doc('usage').collection(lastMonth).doc(userDoc.id).set({
                    ...usageDoc.data(),
                    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        }
        catch (error) {
            console.error(`${LOG_TAG} Error archiving usage for ${userDoc.id}:`, error);
        }
    }
    console.log(`${LOG_TAG} Monthly reset complete`);
    return null;
});
// Helper functions
async function notifyQuotaExceeded(userId, reason) {
    const db = admin.firestore();
    await db.collection('users').doc(userId).collection('notifications').add({
        type: 'quota_exceeded',
        message: reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}
async function notifyProcessingComplete(userId, data) {
    const db = admin.firestore();
    await db.collection('users').doc(userId).collection('notifications').add({
        type: 'processing_complete',
        data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}
async function notifyProcessingFailed(userId, filePath) {
    const db = admin.firestore();
    await db.collection('users').doc(userId).collection('notifications').add({
        type: 'processing_failed',
        message: 'Image processing failed. Please try again.',
        filePath,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}
function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
function getLastMonthKey() {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
//# sourceMappingURL=index.js.map