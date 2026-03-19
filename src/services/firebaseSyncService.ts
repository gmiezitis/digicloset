/**
 * Firebase Sync Service
 * Handles syncing wardrobe items between local storage and Firebase Firestore
 */

import * as FileSystem from 'expo-file-system';

// Firebase configuration - to be replaced with actual config
const FIREBASE_CONFIG = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
};

const LOG_TAG = '[firebase-sync]';

// Firestore document types
export interface FirestoreWardrobeItem {
    id: string;
    userId: string;
    name: string;
    category: string;
    seasons: string[];
    colors: { name: string; hex: string }[];
    materials?: string[];
    tags?: string[];
    imageUrl?: string;
    thumbnailUrl?: string;
    createdAt: string;
    updatedAt: string;
    syncedAt: string;
}

export interface FirestoreOutfit {
    id: string;
    userId: string;
    name: string;
    items: { slot: string; itemId: string }[];
    createdAt: string;
    updatedAt: string;
}

// Sync status tracking
interface SyncStatus {
    lastSyncAt: string | null;
    pendingUploads: number;
    pendingDownloads: number;
    errors: string[];
}

let syncStatus: SyncStatus = {
    lastSyncAt: null,
    pendingUploads: 0,
    pendingDownloads: 0,
    errors: [],
};

type SyncListener = (status: SyncStatus) => void;
const listeners = new Set<SyncListener>();

function notifyListeners() {
    listeners.forEach(listener => listener({ ...syncStatus }));
}

export function subscribeSyncStatus(listener: SyncListener) {
    listeners.add(listener);
    listener({ ...syncStatus });
    return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncStatus {
    return { ...syncStatus };
}

// Firebase REST API helpers (works without full Firebase SDK)
async function firestoreRequest(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
): Promise<unknown> {
    const projectId = FIREBASE_CONFIG.projectId;
    if (!projectId) {
        console.warn(`${LOG_TAG} Firebase project ID not configured`);
        return null;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;

    const options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Firestore request failed: ${response.status} ${error}`);
    }

    return response.json();
}

// Convert Firestore document format to our type
function parseFirestoreDoc(doc: Record<string, unknown>): FirestoreWardrobeItem | null {
    try {
        const fields = doc.fields as Record<string, { stringValue?: string; arrayValue?: { values?: { stringValue?: string }[] } }>;
        if (!fields) return null;

        return {
            id: (doc.name as string)?.split('/').pop() || '',
            userId: fields.userId?.stringValue || '',
            name: fields.name?.stringValue || '',
            category: fields.category?.stringValue || 'tops',
            seasons: fields.seasons?.arrayValue?.values?.map(v => v.stringValue || '') || ['all'],
            colors: [], // Parse from nested structure
            createdAt: fields.createdAt?.stringValue || new Date().toISOString(),
            updatedAt: fields.updatedAt?.stringValue || new Date().toISOString(),
            syncedAt: new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

// Sync operations
export async function uploadItemToCloud(
    item: FirestoreWardrobeItem,
    localImageUri?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        syncStatus.pendingUploads++;
        notifyListeners();

        // If there's a local image, we would upload it to Firebase Storage first
        // For now, we'll skip image upload in dev mode
        let imageUrl = item.imageUrl;

        if (localImageUri && !__DEV__) {
            // In production, upload to Firebase Storage
            // imageUrl = await uploadImageToStorage(localImageUri, item.id);
            console.log(`${LOG_TAG} Would upload image: ${localImageUri}`);
        }

        // Create/update document in Firestore
        await firestoreRequest('PATCH', `wardrobeItems/${item.id}`, {
            fields: {
                userId: { stringValue: item.userId },
                name: { stringValue: item.name },
                category: { stringValue: item.category },
                seasons: { arrayValue: { values: item.seasons.map(s => ({ stringValue: s })) } },
                imageUrl: { stringValue: imageUrl || '' },
                updatedAt: { stringValue: new Date().toISOString() },
            },
        });

        console.log(`${LOG_TAG} Uploaded item: ${item.name}`);
        syncStatus.pendingUploads--;
        syncStatus.lastSyncAt = new Date().toISOString();
        notifyListeners();

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        syncStatus.pendingUploads--;
        syncStatus.errors.push(message);
        notifyListeners();
        console.error(`${LOG_TAG} Upload failed:`, error);
        return { success: false, error: message };
    }
}

export async function downloadItemsFromCloud(
    userId: string
): Promise<{ items: FirestoreWardrobeItem[]; error?: string }> {
    try {
        syncStatus.pendingDownloads++;
        notifyListeners();

        const result = await firestoreRequest('GET', `wardrobeItems?userId=${userId}`) as {
            documents?: Record<string, unknown>[];
        };

        const items = (result?.documents || [])
            .map(doc => parseFirestoreDoc(doc))
            .filter((item): item is FirestoreWardrobeItem => item !== null);

        console.log(`${LOG_TAG} Downloaded ${items.length} items`);
        syncStatus.pendingDownloads--;
        syncStatus.lastSyncAt = new Date().toISOString();
        notifyListeners();

        return { items };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Download failed';
        syncStatus.pendingDownloads--;
        syncStatus.errors.push(message);
        notifyListeners();
        console.error(`${LOG_TAG} Download failed:`, error);
        return { items: [], error: message };
    }
}

export async function deleteItemFromCloud(
    itemId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await firestoreRequest('DELETE', `wardrobeItems/${itemId}`);
        console.log(`${LOG_TAG} Deleted item: ${itemId}`);
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Delete failed';
        console.error(`${LOG_TAG} Delete failed:`, error);
        return { success: false, error: message };
    }
}

// Full sync - reconcile local and cloud data
export async function performFullSync(
    userId: string,
    localItems: FirestoreWardrobeItem[]
): Promise<{
    uploaded: number;
    downloaded: number;
    conflicts: string[];
}> {
    const result = {
        uploaded: 0,
        downloaded: 0,
        conflicts: [] as string[],
    };

    try {
        // Download cloud items
        const { items: cloudItems, error } = await downloadItemsFromCloud(userId);
        if (error) {
            console.warn(`${LOG_TAG} Sync download error: ${error}`);
        }

        // Create lookup maps
        const cloudMap = new Map(cloudItems.map(item => [item.id, item]));
        const localMap = new Map(localItems.map(item => [item.id, item]));

        // Upload local-only items
        for (const [id, localItem] of localMap) {
            if (!cloudMap.has(id)) {
                const uploadResult = await uploadItemToCloud(localItem);
                if (uploadResult.success) {
                    result.uploaded++;
                }
            }
        }

        // Track cloud-only items (would need to download)
        for (const [id, _cloudItem] of cloudMap) {
            if (!localMap.has(id)) {
                result.downloaded++;
                // In a full implementation, we'd save cloud items locally
            }
        }

        console.log(`${LOG_TAG} Sync complete: ${result.uploaded} up, ${result.downloaded} down`);
    } catch (error) {
        console.error(`${LOG_TAG} Full sync failed:`, error);
    }

    return result;
}

// Initialize Firebase (call on app start)
export function initializeFirebase() {
    if (!FIREBASE_CONFIG.projectId) {
        console.warn(`${LOG_TAG} Firebase not configured - cloud sync disabled`);
        return false;
    }
    console.log(`${LOG_TAG} Firebase initialized for project: ${FIREBASE_CONFIG.projectId}`);
    return true;
}
