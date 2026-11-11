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
exports.processImageUpload = processImageUpload;
const admin = __importStar(require("firebase-admin"));
const LOG_TAG = '[image-processor]';
// Configuration from environment
const REMBG_SERVICE_URL = process.env.REMBG_SERVICE_URL || 'http://rembg-service:8080';
const MIDAS_SERVICE_URL = process.env.MIDAS_SERVICE_URL || 'http://midas-service:8080';
/**
 * Process an uploaded image through the pipeline:
 * 1. Download from Firebase Storage
 * 2. Send to rembg for background removal
 * 3. (Premium) Send to MiDaS for depth-aware shadow
 * 4. Upload results back to Firebase Storage
 */
async function processImageUpload(options) {
    const startTime = Date.now();
    const storage = admin.storage();
    const bucket = storage.bucket(options.bucket);
    console.log(`${LOG_TAG} Starting processing for ${options.filePath}`);
    // Step 1: Download image from Firebase Storage
    const inputFile = bucket.file(options.filePath);
    const [imageBuffer] = await inputFile.download();
    console.log(`${LOG_TAG} Downloaded image: ${imageBuffer.length} bytes`);
    // Step 2: Call rembg for background removal
    const quality = options.userTier === 'premium' ? 'high' : 'medium';
    const rembgResult = await callRembg(imageBuffer, quality);
    if (!rembgResult.success) {
        throw new Error(`rembg failed: ${rembgResult.error}`);
    }
    // Step 3: Save processed image to Storage
    const outputPath = options.filePath
        .replace('/uploads/', '/processed/')
        .replace(/\.[^.]+$/, '_nobg.png');
    const outputFile = bucket.file(outputPath);
    await outputFile.save(rembgResult.imageBuffer, {
        contentType: 'image/png',
        metadata: {
            processingTier: options.userTier,
            quality,
            originalPath: options.filePath,
            processedAt: new Date().toISOString(),
        },
    });
    let shadowPath;
    let costCents = 0.1; // Base rembg cost
    // Step 4: (Premium only) Generate depth-aware shadow
    if (options.userTier === 'premium') {
        const shadowResult = await callMidas(rembgResult.imageBuffer);
        if (shadowResult.success && shadowResult.shadowBuffer) {
            shadowPath = outputPath.replace('_nobg.png', '_shadow.png');
            const shadowFile = bucket.file(shadowPath);
            await shadowFile.save(shadowResult.shadowBuffer, {
                contentType: 'image/png',
                metadata: {
                    effect: 'floor-shadow',
                    originalPath: options.filePath,
                },
            });
            costCents += 0.05; // MiDaS cost
        }
    }
    const durationMs = Date.now() - startTime;
    console.log(`${LOG_TAG} Processing complete in ${durationMs}ms, cost: ${costCents} cents`);
    return {
        processedPath: outputPath,
        shadowPath,
        processingTier: options.userTier === 'premium' ? 'midas' : 'rembg',
        durationMs,
        costCents,
    };
}
/**
 * Call rembg background removal service
 */
async function callRembg(imageBuffer, quality) {
    try {
        const response = await fetch(`${REMBG_SERVICE_URL}/remove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Quality': quality,
            },
            body: new Uint8Array(imageBuffer),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${response.status}: ${errorText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return {
            success: true,
            imageBuffer: Buffer.from(arrayBuffer),
        };
    }
    catch (error) {
        console.error(`${LOG_TAG} rembg call failed:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Call MiDaS depth estimation and shadow generation service
 */
async function callMidas(imageBuffer) {
    try {
        const response = await fetch(`${MIDAS_SERVICE_URL}/shadow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
            },
            body: new Uint8Array(imageBuffer),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${response.status}: ${errorText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return {
            success: true,
            shadowBuffer: Buffer.from(arrayBuffer),
        };
    }
    catch (error) {
        // MiDaS failure is non-critical - just skip shadow
        console.warn(`${LOG_TAG} MiDaS call failed (non-critical):`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
//# sourceMappingURL=imageProcessor.js.map