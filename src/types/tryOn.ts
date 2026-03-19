/**
 * Virtual Try-On Types
 * 
 * Types for the IDM-VTON virtual try-on feature.
 */

export type TryOnCategory = 'upper_body' | 'lower_body' | 'full_body';
export type TryOnQuality = 'preview' | 'hd';
export type TryOnStatus = 'idle' | 'processing' | 'preview_ready' | 'hd_ready' | 'error';

export type MannequinType = 'neutral' | 'man' | 'child' | 'dog' | 'cat';

export interface MannequinModel {
    id: MannequinType;
    name: string;
    description: string;
    imageUri: string;
    isPremium: boolean;
}

export interface TryOnRequest {
    garmentImageUri: string;
    modelImageUri: string;
    category: TryOnCategory;
    quality: TryOnQuality;
}

export interface TryOnResult {
    success: boolean;
    previewUri?: string;
    hdUri?: string;
    processingTimeMs: number;
    error?: string;
}

export interface TryOnQuotaInfo {
    remaining: number;
    total: number;
    resetsAt: string;
    isPremium: boolean;
}

/**
 * Map item categories to try-on categories
 */
export function mapItemCategoryToTryOn(itemCategory: string): TryOnCategory {
    switch (itemCategory) {
        case 'tops':
        case 'outerwear':
            return 'upper_body';
        case 'bottoms':
        case 'shoes':
            return 'lower_body';
        case 'dresses':
            return 'full_body';
        default:
            return 'upper_body';
    }
}
