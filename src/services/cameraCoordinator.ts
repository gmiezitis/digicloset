import { createCameraService, type CameraService } from './camera/CameraService';
import {
  createBackgroundRemovalQueue,
  createProxyBackgroundRemovalAdapter,
  type BackgroundRemovalAdapter,
  type BackgroundRemovalQueue,
} from './camera/BackgroundRemovalQueue';
import type { BackgroundRemovalQueueDependencies } from './camera/BackgroundRemovalQueue';
import { API_BASE_URL } from '@/constants';
import { createImagePickerCameraAdapter } from './camera/imagePickerAdapter';

const LOG_TAG = '[camera-coordinator]';

/**
 * Mock adapter for development mode.
 * Returns the original image as "processed" so the app works without a backend.
 */
function createMockBackgroundRemovalAdapter(): BackgroundRemovalAdapter {
  return {
    async removeBackground({ captureId, localUri }) {
      console.log(`${LOG_TAG} [DEV] Mock background removal for ${captureId}`);
      // Simulate a small delay like a real API would have
      await new Promise(resolve => setTimeout(resolve, 500));
      // Return original image as "processed" with a mask so brush/erase buttons are enabled
      return {
        processedUri: localUri,
        maskUri: localUri, // Use same image as mock mask for dev mode
        metadata: { mock: true, processor: 'dev-mode' },
      };
    },
  };
}

type CameraCoordinatorOptions = {
  adapter?: BackgroundRemovalAdapter;
  queueDependencies?: Partial<Omit<BackgroundRemovalQueueDependencies, 'cameraService' | 'adapter'>>;
};

let cameraServiceSingleton: CameraService | null = null;
let backgroundRemovalQueueSingleton: BackgroundRemovalQueue | null = null;

export function getCameraService(): CameraService {
  if (!cameraServiceSingleton) {
    cameraServiceSingleton = createCameraService({
      nativeAdapter: createImagePickerCameraAdapter(),
    });
  }
  return cameraServiceSingleton;
}

export function initializeCameraProcessing(options: CameraCoordinatorOptions = {}) {
  const cameraService = getCameraService();

  if (!backgroundRemovalQueueSingleton) {
    // Use mock adapter in development mode, real proxy in production
    let adapter: BackgroundRemovalAdapter;

    if (options.adapter) {
      adapter = options.adapter;
    } else if (__DEV__) {
      console.log(`${LOG_TAG} Using mock background removal adapter (development mode)`);
      adapter = createMockBackgroundRemovalAdapter();
    } else {
      adapter = createProxyBackgroundRemovalAdapter({
        baseUrl: API_BASE_URL,
      });
    }

    backgroundRemovalQueueSingleton = createBackgroundRemovalQueue({
      cameraService,
      adapter,
      ...(options.queueDependencies ?? {}),
    });
  }

  backgroundRemovalQueueSingleton.start();
}

export function shutdownCameraProcessing() {
  backgroundRemovalQueueSingleton?.stop();
}

export function getBackgroundRemovalQueue() {
  return backgroundRemovalQueueSingleton;
}

export async function retryBackgroundRemoval(
  captureId: string,
  options: { immediate?: boolean; reason?: string } = {}
) {
  if (!backgroundRemovalQueueSingleton) {
    console.warn('[camera-coordinator] Background removal queue not initialized');
    return;
  }

  await backgroundRemovalQueueSingleton.enqueue(captureId, {
    immediate: options.immediate ?? false,
    reason: options.reason ?? 'manual-retry',
  });
}



