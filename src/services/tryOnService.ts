/**
 * Virtual Try-On Service
 * 
 * Provides AI-powered virtual try-on using IDM-VTON via Fal.ai.
 * Supports mannequin models for visualization.
 */

import { defaultNowUtc } from './storage';
import type {
    TryOnRequest,
    TryOnResult,
    TryOnCategory,
    TryOnQuality,
    MannequinModel,
    MannequinType,
} from '@/types/tryOn';

const LOG_TAG = '[try-on-service]';

// Fal.ai configuration - placeholder for now
const FAL_CONFIG = {
    apiKey: process.env.EXPO_PUBLIC_FAL_KEY || 'placeholder_key',
    endpoint: 'https://fal.run/fal-ai/idm-vton',
    previewSteps: 8,
    hdSteps: 25,
    guidanceScale: 2.0,
};

/**
 * Available mannequin models
 */
const MANNEQUIN_MODELS: MannequinModel[] = [
    {
        id: 'neutral',
        name: 'Classic',
        description: 'Gender-neutral mannequin',
        imageUri: require('../../assets/mannequins/neutral.png'),
        isPremium: false,
    },
    {
        id: 'man',
        name: 'Man',
        description: 'Adult male model',
        imageUri: require('../../assets/mannequins/man.png'),
        isPremium: true,
    },
    {
        id: 'child',
        name: 'Child',
        description: 'Child mannequin',
        imageUri: require('../../assets/mannequins/child.png'),
        isPremium: true,
    },
    {
        id: 'dog',
        name: 'Dog',
        description: 'Dog model for pet clothes',
        imageUri: require('../../assets/mannequins/dog.png'),
        isPremium: true,
    },
    {
        id: 'cat',
        name: 'Cat',
        description: 'Cat model for pet clothes',
        imageUri: require('../../assets/mannequins/cat.png'),
        isPremium: true,
    },
];

/**
 * Get available mannequin models based on user tier
 */
export function getMannequinModels(isPremium: boolean): MannequinModel[] {
    return MANNEQUIN_MODELS.map(model => ({
        ...model,
        // Mark premium models as locked for free users
        isLocked: model.isPremium && !isPremium,
    })) as (MannequinModel & { isLocked: boolean })[];
}

/**
 * Get a specific mannequin model by ID
 */
export function getMannequinById(id: MannequinType): MannequinModel | undefined {
    return MANNEQUIN_MODELS.find(model => model.id === id);
}

/**
 * Generate virtual try-on preview (fast, lower quality)
 */
export async function generateTryOnPreview(
    garmentUri: string,
    modelUri: string,
    category: TryOnCategory
): Promise<TryOnResult> {
    return generateTryOn({
        garmentImageUri: garmentUri,
        modelImageUri: modelUri,
        category,
        quality: 'preview',
    });
}

/**
 * Generate virtual try-on HD result (slower, higher quality)
 */
export async function generateTryOnHD(
    garmentUri: string,
    modelUri: string,
    category: TryOnCategory
): Promise<TryOnResult> {
    return generateTryOn({
        garmentImageUri: garmentUri,
        modelImageUri: modelUri,
        category,
        quality: 'hd',
    });
}

/**
 * Main try-on generation function
 */
async function generateTryOn(request: TryOnRequest): Promise<TryOnResult> {
    const startTime = Date.now();

    log('generate-start', {
        category: request.category,
        quality: request.quality,
    });

    try {
        // For now, return a placeholder result
        // TODO: Implement actual Fal.ai API call when key is available
        if (FAL_CONFIG.apiKey === 'placeholder_key') {
            log('using-placeholder', { reason: 'API key not configured' });

            // Simulate processing time
            const delay = request.quality === 'preview' ? 2000 : 6000;
            await new Promise(resolve => setTimeout(resolve, delay));

            return {
                success: true,
                previewUri: request.garmentImageUri, // Return garment as placeholder
                hdUri: request.quality === 'hd' ? request.garmentImageUri : undefined,
                processingTimeMs: Date.now() - startTime,
            };
        }

        // Real API call (when key is configured)
        const response = await callFalApi(request);

        const processingTimeMs = Date.now() - startTime;
        log('generate-complete', { processingTimeMs, quality: request.quality });

        return {
            success: true,
            previewUri: response.imageUrl,
            hdUri: request.quality === 'hd' ? response.imageUrl : undefined,
            processingTimeMs,
        };
    } catch (error) {
        const processingTimeMs = Date.now() - startTime;
        logError('generate-failed', error);

        return {
            success: false,
            processingTimeMs,
            error: error instanceof Error ? error.message : 'Try-on generation failed',
        };
    }
}

/**
 * Call Fal.ai IDM-VTON API
 */
async function callFalApi(request: TryOnRequest): Promise<{ imageUrl: string }> {
    const numSteps = request.quality === 'preview'
        ? FAL_CONFIG.previewSteps
        : FAL_CONFIG.hdSteps;

    const response = await fetch(FAL_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            human_image_url: request.modelImageUri,
            garment_image_url: request.garmentImageUri,
            category: request.category,
            num_inference_steps: numSteps,
            guidance_scale: FAL_CONFIG.guidanceScale,
            auto_mask: true,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return { imageUrl: data.image?.url || data.images?.[0]?.url };
}

/**
 * Check if try-on service is available
 */
export function isTryOnAvailable(): boolean {
    return FAL_CONFIG.apiKey !== 'placeholder_key';
}

// Logging helpers
function log(event: string, data?: Record<string, unknown>) {
    console.log(`${LOG_TAG} ${event}`, { timestamp: defaultNowUtc(), ...data });
}

function logError(event: string, error: unknown) {
    console.error(`${LOG_TAG} ${event}`, {
        timestamp: defaultNowUtc(),
        error: error instanceof Error ? error.message : String(error),
    });
}
