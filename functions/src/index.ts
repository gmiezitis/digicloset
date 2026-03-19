import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { processImageUpload } from './imageProcessor';
import { checkUserQuota, incrementUsage, TIER_LIMITS } from './quotaService';

// Initialize Firebase Admin
admin.initializeApp();

const LOG_TAG = '[functions]';

/**
 * Triggered when a new image is uploaded to Firebase Storage.
 * Routes to appropriate processing tier based on user subscription.
 * 
 * Expected path: users/{userId}/uploads/{imageId}.{ext}
 */
export const onImageUpload = functions
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
        const quota = await checkUserQuota(userId);

        if (!quota.canProcess) {
            console.log(`${LOG_TAG} Quota exceeded for ${userId}: ${quota.reason}`);
            await notifyQuotaExceeded(userId, quota.reason || 'Monthly limit reached');
            return;
        }

        try {
            // Process the image
            const result = await processImageUpload({
                bucket: object.bucket,
                filePath,
                userId,
                userTier: quota.tier,
                contentType: object.contentType,
            });

            // Increment usage on success
            await incrementUsage(userId, quota.tier);

            // Notify user of completion
            await notifyProcessingComplete(userId, {
                originalPath: filePath,
                processedPath: result.processedPath,
                tier: quota.tier,
            });

            console.log(`${LOG_TAG} Successfully processed image for ${userId}`);
        } catch (error) {
            console.error(`${LOG_TAG} Processing failed for ${userId}:`, error);
            await notifyProcessingFailed(userId, filePath);
        }
    });

/**
 * HTTP endpoint to get user quota status
 */
export const getQuotaStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const quota = await checkUserQuota(userId);

    return {
        tier: quota.tier,
        usage: quota.usage,
        limits: TIER_LIMITS[quota.tier],
        canProcess: quota.canProcess,
        reason: quota.reason,
    };
});

/**
 * HTTP endpoint to upgrade user to premium
 * In production, this would verify with App Store/Play Store
 */
export const upgradeToPremium = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { purchaseToken: _purchaseToken, platform } = data;

    // TODO: Verify purchase with App Store / Play Store
    // For now, just update the user's tier

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
export const resetMonthlyQuotas = functions.pubsub
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
            } catch (error) {
                console.error(`${LOG_TAG} Error archiving usage for ${userDoc.id}:`, error);
            }
        }

        console.log(`${LOG_TAG} Monthly reset complete`);
        return null;
    });

// Helper functions

async function notifyQuotaExceeded(userId: string, reason: string) {
    const db = admin.firestore();
    await db.collection('users').doc(userId).collection('notifications').add({
        type: 'quota_exceeded',
        message: reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}

async function notifyProcessingComplete(userId: string, data: {
    originalPath: string;
    processedPath: string;
    tier: string;
}) {
    const db = admin.firestore();
    await db.collection('users').doc(userId).collection('notifications').add({
        type: 'processing_complete',
        data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}

async function notifyProcessingFailed(userId: string, filePath: string) {
    const db = admin.firestore();
    await db.collection('users').doc(userId).collection('notifications').add({
        type: 'processing_failed',
        message: 'Image processing failed. Please try again.',
        filePath,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}

function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getLastMonthKey(): string {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
