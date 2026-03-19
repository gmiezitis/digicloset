import * as FileSystem from 'expo-file-system/legacy';
import { quotaStore } from './quotaStore';
import { defaultNowUtc, createRandomId } from './storage';

/**
 * Image Processing Service
 * 
 * Handles the cloud processing pipeline for clothing images:
 * 1. Upload image to cloud storage
 * 2. Trigger background removal (rembg)
 * 3. Apply 3D effects (CSS for free, MiDaS for premium)
 * 4. Download and cache processed result
 * 
 * Cost Structure:
 * - Background removal (rembg): ~$0.001/image
 * - 3D effects (MiDaS): ~$0.0005/image (premium only)
 */

// Configuration - will be replaced with environment variables
const PROCESSING_CONFIG = {
    // Cloud endpoints (replace with actual URLs after deployment)
    rembgServiceUrl: process.env.REMBG_SERVICE_URL || 'http://localhost:8080',
    midasServiceUrl: process.env.MIDAS_SERVICE_URL || 'http://localhost:8081',

    // Firebase Storage (replace with actual bucket)
    storageBucket: 'digicloset-prod.appspot.com',

    // Timeouts
    uploadTimeoutMs: 60000,
    processingTimeoutMs: 120000,

    // Compression
    maxImageSizeMB: 5,
    compressionQuality: 0.8,
    maxDimension: 2048,
};

const LOG_TAG = '[image-processing]';

export type ProcessingStatus =
    | 'idle'
    | 'uploading'
    | 'removing-background'
    | 'applying-3d'
    | 'downloading'
    | 'complete'
    | 'failed';

export interface ProcessingProgress {
    status: ProcessingStatus;
    progress: number; // 0-100
    message: string;
    startedAt: string;
    estimatedTimeMs?: number;
}

export interface ProcessingResult {
    success: boolean;
    originalUri: string;
    processedUri?: string;
    maskUri?: string;
    shadowUri?: string;
    processingTimeMs: number;
    estimatedCostCents: number;
    tier: 'free' | 'premium';
    error?: string;
}

type ProgressCallback = (progress: ProcessingProgress) => void;

/**
 * Process a clothing image through the cloud pipeline
 */
export async function processClothingImage(
    localUri: string,
    options: {
        onProgress?: ProgressCallback;
        apply3D?: boolean;
    } = {}
): Promise<ProcessingResult> {
    const startTime = Date.now();
    const tier = quotaStore.getSnapshot().tier;
    const apply3D = options.apply3D ?? true;

    const updateProgress = (status: ProcessingStatus, progress: number, message: string) => {
        options.onProgress?.({
            status,
            progress,
            message,
            startedAt: defaultNowUtc(),
        });
    };

    try {
        // Step 1: Validate and prepare image
        updateProgress('uploading', 10, 'Preparing image...');

        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (!fileInfo.exists) {
            throw new Error('Image file does not exist');
        }

        // Step 2: Compress if needed
        let processUri = localUri;
        const fileSize = 'size' in fileInfo ? fileInfo.size : 0;
        if (fileSize > PROCESSING_CONFIG.maxImageSizeMB * 1024 * 1024) {
            updateProgress('uploading', 20, 'Compressing image...');
            processUri = await compressImage(localUri);
        }

        // Step 3: Read image as base64 for API call
        updateProgress('uploading', 30, 'Reading image...');
        const imageBase64 = await FileSystem.readAsStringAsync(processUri, {
            encoding: FileSystem.EncodingType.Base64,
        });

        // Step 4: Call background removal service
        updateProgress('removing-background', 40, 'Removing background...');
        const bgResult = await callRembgService(imageBase64);

        if (!bgResult.success) {
            throw new Error(bgResult.error || 'Background removal failed');
        }

        updateProgress('removing-background', 60, 'Background removed!');

        // Step 5: Save processed image locally
        const processedPath = `${FileSystem.cacheDirectory}processed_${createRandomId('img')}.png`;
        await FileSystem.writeAsStringAsync(processedPath, bgResult.imageBase64!, {
            encoding: FileSystem.EncodingType.Base64,
        });

        let shadowUri: string | undefined;
        let estimatedCostCents = 0.1; // rembg cost

        // Step 6: Apply 3D effects (premium only uses server-side)
        if (apply3D && tier === 'premium') {
            updateProgress('applying-3d', 70, 'Generating 3D shadow...');

            const shadowResult = await callMidasService(bgResult.imageBase64!);

            if (shadowResult.success && shadowResult.shadowBase64) {
                const shadowPath = `${FileSystem.cacheDirectory}shadow_${createRandomId('shadow')}.png`;
                await FileSystem.writeAsStringAsync(shadowPath, shadowResult.shadowBase64, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                shadowUri = shadowPath;
                estimatedCostCents += 0.05; // MiDaS cost
            }

            updateProgress('applying-3d', 85, '3D effects applied!');
        }

        // Step 7: Complete
        updateProgress('complete', 100, 'Processing complete!');

        const processingTimeMs = Date.now() - startTime;
        log('processing-complete', {
            tier,
            timeMs: processingTimeMs,
            costCents: estimatedCostCents,
        });

        return {
            success: true,
            originalUri: localUri,
            processedUri: processedPath,
            shadowUri,
            processingTimeMs,
            estimatedCostCents,
            tier,
        };

    } catch (error) {
        updateProgress('failed', 0, 'Processing failed');
        logError('processing-failed', error);

        return {
            success: false,
            originalUri: localUri,
            processingTimeMs: Date.now() - startTime,
            estimatedCostCents: 0,
            tier,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Call the rembg background removal service
 */
async function callRembgService(imageBase64: string): Promise<{
    success: boolean;
    imageBase64?: string;
    error?: string;
}> {
    try {
        // Convert base64 to binary for sending
        const binaryString = atob(imageBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const response = await fetch(`${PROCESSING_CONFIG.rembgServiceUrl}/remove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Quality': 'medium',
            },
            body: bytes,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`rembg service error: ${response.status} - ${errorText}`);
        }

        // Read response as array buffer and convert to base64
        const arrayBuffer = await response.arrayBuffer();
        const resultBytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < resultBytes.length; i++) {
            binary += String.fromCharCode(resultBytes[i]);
        }
        const resultBase64 = btoa(binary);

        return {
            success: true,
            imageBase64: resultBase64,
        };
    } catch (error) {
        logError('rembg-call-failed', error);

        // For development, return a mock success
        // In production, this should properly fail
        if (__DEV__) {
            return {
                success: true,
                imageBase64: imageBase64, // Return original in dev mode
            };
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'rembg service unavailable',
        };
    }
}

/**
 * Call the MiDaS shadow generation service (premium only)
 */
async function callMidasService(imageBase64: string): Promise<{
    success: boolean;
    shadowBase64?: string;
    error?: string;
}> {
    try {
        const binaryString = atob(imageBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const response = await fetch(`${PROCESSING_CONFIG.midasServiceUrl}/shadow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
            },
            body: bytes,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`MiDaS service error: ${response.status} - ${errorText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const resultBytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < resultBytes.length; i++) {
            binary += String.fromCharCode(resultBytes[i]);
        }
        const resultBase64 = btoa(binary);

        return {
            success: true,
            shadowBase64: resultBase64,
        };
    } catch (error) {
        logError('midas-call-failed', error);

        // Non-critical - just skip 3D effects
        return {
            success: false,
            error: error instanceof Error ? error.message : 'MiDaS service unavailable',
        };
    }
}

/**
 * Compress an image to reduce size and processing costs
 */
async function compressImage(uri: string): Promise<string> {
    // In production, use expo-image-manipulator:
    // const result = await ImageManipulator.manipulateAsync(
    //   uri,
    //   [{ resize: { width: PROCESSING_CONFIG.maxDimension } }],
    //   { compress: PROCESSING_CONFIG.compressionQuality, format: SaveFormat.JPEG }
    // );
    // return result.uri;

    // For now, return original
    return uri;
}

/**
 * Get processing cost estimate
 */
export function getProcessingCostEstimate(tier: 'free' | 'premium'): {
    backgroundRemoval: number;
    effects3D: number;
    total: number;
    currency: string;
} {
    const bgCost = 0.1; // cents
    const effectsCost = tier === 'premium' ? 0.05 : 0; // MiDaS only for premium

    return {
        backgroundRemoval: bgCost,
        effects3D: effectsCost,
        total: bgCost + effectsCost,
        currency: 'USD cents',
    };
}

function log(event: string, data?: Record<string, unknown>) {
    console.log(`${LOG_TAG} ${event}`, {
        timestamp: defaultNowUtc(),
        ...data,
    });
}

function logError(event: string, error: unknown) {
    console.error(`${LOG_TAG} ${event}`, {
        timestamp: defaultNowUtc(),
        error,
    });
}
