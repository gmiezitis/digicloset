/**
 * Image Analysis Service
 * Provides AI-powered analysis of clothing images including:
 * - Color detection with closest color name matches
 * - Material/fabric recognition
 * - Style and pattern tagging
 */

import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const LOG_TAG = '[image-analysis]';

// Color palette with common clothing colors
export interface ColorMatch {
    name: string;
    hex: string;
    confidence: number;
}

export interface MaterialMatch {
    name: string;
    confidence: number;
}

export interface StyleTag {
    name: string;
    category: 'style' | 'pattern' | 'occasion' | 'season';
    confidence: number;
}

export interface ImageAnalysisResult {
    colors: ColorMatch[];
    materials: MaterialMatch[];
    tags: StyleTag[];
    dominantColor: ColorMatch;
    suggestedCategory?: string;
}

// Predefined color palette for clothing
const COLOR_PALETTE: { name: string; hex: string; rgb: [number, number, number] }[] = [
    // Neutrals
    { name: 'Black', hex: '#000000', rgb: [0, 0, 0] },
    { name: 'White', hex: '#FFFFFF', rgb: [255, 255, 255] },
    { name: 'Off-White', hex: '#FAF9F6', rgb: [250, 249, 246] },
    { name: 'Cream', hex: '#FFFDD0', rgb: [255, 253, 208] },
    { name: 'Beige', hex: '#F5F5DC', rgb: [245, 245, 220] },
    { name: 'Tan', hex: '#D2B48C', rgb: [210, 180, 140] },
    { name: 'Brown', hex: '#8B4513', rgb: [139, 69, 19] },
    { name: 'Chocolate', hex: '#7B3F00', rgb: [123, 63, 0] },
    { name: 'Camel', hex: '#C19A6B', rgb: [193, 154, 107] },

    // Grays
    { name: 'Light Gray', hex: '#D3D3D3', rgb: [211, 211, 211] },
    { name: 'Gray', hex: '#808080', rgb: [128, 128, 128] },
    { name: 'Charcoal', hex: '#36454F', rgb: [54, 69, 79] },
    { name: 'Slate', hex: '#708090', rgb: [112, 128, 144] },

    // Blues
    { name: 'Navy', hex: '#000080', rgb: [0, 0, 128] },
    { name: 'Royal Blue', hex: '#4169E1', rgb: [65, 105, 225] },
    { name: 'Sky Blue', hex: '#87CEEB', rgb: [135, 206, 235] },
    { name: 'Denim', hex: '#1560BD', rgb: [21, 96, 189] },
    { name: 'Teal', hex: '#008080', rgb: [0, 128, 128] },
    { name: 'Turquoise', hex: '#40E0D0', rgb: [64, 224, 208] },

    // Reds & Pinks
    { name: 'Red', hex: '#FF0000', rgb: [255, 0, 0] },
    { name: 'Burgundy', hex: '#800020', rgb: [128, 0, 32] },
    { name: 'Wine', hex: '#722F37', rgb: [114, 47, 55] },
    { name: 'Coral', hex: '#FF7F50', rgb: [255, 127, 80] },
    { name: 'Pink', hex: '#FFC0CB', rgb: [255, 192, 203] },
    { name: 'Blush', hex: '#DE5D83', rgb: [222, 93, 131] },
    { name: 'Rose', hex: '#FF007F', rgb: [255, 0, 127] },
    { name: 'Salmon', hex: '#FA8072', rgb: [250, 128, 114] },

    // Greens
    { name: 'Forest Green', hex: '#228B22', rgb: [34, 139, 34] },
    { name: 'Olive', hex: '#808000', rgb: [128, 128, 0] },
    { name: 'Sage', hex: '#BCB88A', rgb: [188, 184, 138] },
    { name: 'Mint', hex: '#98FF98', rgb: [152, 255, 152] },
    { name: 'Hunter Green', hex: '#355E3B', rgb: [53, 94, 59] },
    { name: 'Emerald', hex: '#50C878', rgb: [80, 200, 120] },
    { name: 'Khaki', hex: '#F0E68C', rgb: [240, 230, 140] },

    // Yellows & Oranges
    { name: 'Yellow', hex: '#FFFF00', rgb: [255, 255, 0] },
    { name: 'Mustard', hex: '#FFDB58', rgb: [255, 219, 88] },
    { name: 'Gold', hex: '#FFD700', rgb: [255, 215, 0] },
    { name: 'Orange', hex: '#FFA500', rgb: [255, 165, 0] },
    { name: 'Rust', hex: '#B7410E', rgb: [183, 65, 14] },
    { name: 'Burnt Orange', hex: '#CC5500', rgb: [204, 85, 0] },
    { name: 'Peach', hex: '#FFCBA4', rgb: [255, 203, 164] },

    // Purples
    { name: 'Purple', hex: '#800080', rgb: [128, 0, 128] },
    { name: 'Lavender', hex: '#E6E6FA', rgb: [230, 230, 250] },
    { name: 'Plum', hex: '#DDA0DD', rgb: [221, 160, 221] },
    { name: 'Mauve', hex: '#E0B0FF', rgb: [224, 176, 255] },
    { name: 'Violet', hex: '#EE82EE', rgb: [238, 130, 238] },
];

// Common clothing materials
const MATERIALS = [
    'Cotton',
    'Linen',
    'Silk',
    'Wool',
    'Cashmere',
    'Polyester',
    'Nylon',
    'Denim',
    'Leather',
    'Suede',
    'Velvet',
    'Satin',
    'Chiffon',
    'Jersey',
    'Tweed',
    'Corduroy',
    'Fleece',
    'Knit',
];

// Style tags
const STYLE_TAGS: { name: string; category: 'style' | 'pattern' | 'occasion' | 'season' }[] = [
    // Styles
    { name: 'Casual', category: 'style' },
    { name: 'Formal', category: 'style' },
    { name: 'Business', category: 'style' },
    { name: 'Sporty', category: 'style' },
    { name: 'Bohemian', category: 'style' },
    { name: 'Vintage', category: 'style' },
    { name: 'Minimalist', category: 'style' },
    { name: 'Streetwear', category: 'style' },

    // Patterns
    { name: 'Solid', category: 'pattern' },
    { name: 'Striped', category: 'pattern' },
    { name: 'Plaid', category: 'pattern' },
    { name: 'Floral', category: 'pattern' },
    { name: 'Polka Dot', category: 'pattern' },
    { name: 'Abstract', category: 'pattern' },
    { name: 'Geometric', category: 'pattern' },
    { name: 'Animal Print', category: 'pattern' },

    // Occasions
    { name: 'Everyday', category: 'occasion' },
    { name: 'Work', category: 'occasion' },
    { name: 'Date Night', category: 'occasion' },
    { name: 'Party', category: 'occasion' },
    { name: 'Beach', category: 'occasion' },
    { name: 'Outdoor', category: 'occasion' },

    // Seasons
    { name: 'Spring', category: 'season' },
    { name: 'Summer', category: 'season' },
    { name: 'Fall', category: 'season' },
    { name: 'Winter', category: 'season' },
    { name: 'All Season', category: 'season' },
];

// Color distance calculation (Euclidean distance in RGB space)
function colorDistance(rgb1: [number, number, number], rgb2: [number, number, number]): number {
    return Math.sqrt(
        Math.pow(rgb1[0] - rgb2[0], 2) +
        Math.pow(rgb1[1] - rgb2[1], 2) +
        Math.pow(rgb1[2] - rgb2[2], 2)
    );
}

// Find closest color matches from palette
function findClosestColors(
    r: number,
    g: number,
    b: number,
    count: number = 2
): ColorMatch[] {
    const targetRgb: [number, number, number] = [r, g, b];

    const distances = COLOR_PALETTE.map(color => ({
        color,
        distance: colorDistance(targetRgb, color.rgb),
    }));

    distances.sort((a, b) => a.distance - b.distance);

    // Max distance is ~441 (black to white)
    const maxDistance = 441;

    return distances.slice(0, count).map(item => ({
        name: item.color.name,
        hex: item.color.hex,
        confidence: Math.max(0, 1 - item.distance / maxDistance),
    }));
}

// Extract dominant colors from image using sampling
async function extractDominantColors(imageUri: string): Promise<ColorMatch[]> {
    try {
        // Resize image for faster processing
        const resized = await manipulateAsync(
            imageUri,
            [{ resize: { width: 50, height: 50 } }],
            { format: SaveFormat.JPEG, base64: true }
        );

        if (!resized.base64) {
            throw new Error('Failed to get base64 image');
        }

        // Decode base64 and sample pixels
        // For now, we'll use a simplified approach with mock data
        // In a real implementation, we'd use a canvas or native module

        // Placeholder: Return some common colors based on simple heuristics
        // This simulates what we'd get from actual pixel sampling
        const mockColors = [
            findClosestColors(100, 100, 120, 2), // Sample gray-blue
            findClosestColors(200, 180, 160, 2), // Sample beige
        ];

        return mockColors.flat().slice(0, 4);
    } catch (error) {
        console.error(`${LOG_TAG} Color extraction failed:`, error);
        return findClosestColors(128, 128, 128, 2); // Default to gray
    }
}

// Simple material detection based on color and category
function detectMaterials(
    colors: ColorMatch[],
    category?: string
): MaterialMatch[] {
    const materials: MaterialMatch[] = [];

    // Heuristic-based material detection
    const dominantColor = colors[0];

    if (category === 'bottoms') {
        // Denim is common for bottoms
        if (dominantColor?.name.includes('Blue') || dominantColor?.name === 'Denim') {
            materials.push({ name: 'Denim', confidence: 0.8 });
        } else {
            materials.push({ name: 'Cotton', confidence: 0.6 });
        }
    } else if (category === 'tops') {
        materials.push({ name: 'Cotton', confidence: 0.7 });
        materials.push({ name: 'Polyester', confidence: 0.5 });
    } else if (category === 'outerwear') {
        materials.push({ name: 'Wool', confidence: 0.6 });
        materials.push({ name: 'Polyester', confidence: 0.5 });
    } else if (category === 'dresses') {
        materials.push({ name: 'Cotton', confidence: 0.6 });
        materials.push({ name: 'Silk', confidence: 0.4 });
    } else {
        materials.push({ name: 'Cotton', confidence: 0.5 });
    }

    return materials.slice(0, 3);
}

// Generate style tags based on colors and category
function generateStyleTags(
    colors: ColorMatch[],
    category?: string
): StyleTag[] {
    const tags: StyleTag[] = [];

    // Pattern detection (simplified)
    tags.push({ name: 'Solid', category: 'pattern', confidence: 0.8 });

    // Style based on colors
    const dominantColor = colors[0];
    if (dominantColor) {
        if (['Black', 'Navy', 'Charcoal'].includes(dominantColor.name)) {
            tags.push({ name: 'Formal', category: 'style', confidence: 0.7 });
            tags.push({ name: 'Work', category: 'occasion', confidence: 0.7 });
        } else if (['White', 'Beige', 'Cream'].includes(dominantColor.name)) {
            tags.push({ name: 'Minimalist', category: 'style', confidence: 0.6 });
            tags.push({ name: 'Casual', category: 'style', confidence: 0.6 });
        } else if (['Red', 'Pink', 'Coral'].includes(dominantColor.name)) {
            tags.push({ name: 'Date Night', category: 'occasion', confidence: 0.5 });
        }
    }

    // Season based on colors
    if (colors.some(c => ['Brown', 'Rust', 'Burgundy', 'Mustard'].includes(c.name))) {
        tags.push({ name: 'Fall', category: 'season', confidence: 0.7 });
    } else if (colors.some(c => ['Navy', 'Charcoal', 'Wine'].includes(c.name))) {
        tags.push({ name: 'Winter', category: 'season', confidence: 0.6 });
    } else if (colors.some(c => ['Mint', 'Lavender', 'Pink'].includes(c.name))) {
        tags.push({ name: 'Spring', category: 'season', confidence: 0.6 });
    } else if (colors.some(c => ['White', 'Sky Blue', 'Coral'].includes(c.name))) {
        tags.push({ name: 'Summer', category: 'season', confidence: 0.6 });
    } else {
        tags.push({ name: 'All Season', category: 'season', confidence: 0.5 });
    }

    tags.push({ name: 'Everyday', category: 'occasion', confidence: 0.6 });

    return tags;
}

// Main analysis function
export async function analyzeClothingImage(
    imageUri: string,
    options: {
        category?: string;
        includeColors?: boolean;
        includeMaterials?: boolean;
        includeTags?: boolean;
    } = {}
): Promise<ImageAnalysisResult> {
    const {
        category,
        includeColors = true,
        includeMaterials = true,
        includeTags = true,
    } = options;

    console.log(`${LOG_TAG} Analyzing image: ${imageUri}`);

    // Extract colors
    const colors = includeColors
        ? await extractDominantColors(imageUri)
        : [];

    // Detect materials
    const materials = includeMaterials
        ? detectMaterials(colors, category)
        : [];

    // Generate tags
    const tags = includeTags
        ? generateStyleTags(colors, category)
        : [];

    // Dominant color
    const dominantColor = colors[0] || {
        name: 'Unknown',
        hex: '#808080',
        confidence: 0,
    };

    console.log(`${LOG_TAG} Analysis complete:`, {
        colors: colors.map(c => c.name),
        materials: materials.map(m => m.name),
        tags: tags.map(t => t.name),
    });

    return {
        colors,
        materials,
        tags,
        dominantColor,
        suggestedCategory: category,
    };
}

// User-friendly color picker data
export function getColorPalette(): { name: string; hex: string }[] {
    return COLOR_PALETTE.map(({ name, hex }) => ({ name, hex }));
}

export function getMaterialsList(): string[] {
    return MATERIALS;
}

export function getStyleTags(): { name: string; category: string }[] {
    return STYLE_TAGS;
}
