import {
  createCameraService,
  type CameraServiceEvent,
  type CaptureCacheStore,
  type CameraCaptureRecord,
} from '../camera/CameraService';
import {
  createBackgroundRemovalQueue,
  type BackgroundRemovalAdapter,
} from '../camera/BackgroundRemovalQueue';

class TestCaptureCache implements CaptureCacheStore {
  private map = new Map<string, CameraCaptureRecord>();

  async save(record: CameraCaptureRecord) {
    this.map.set(record.id, record);
  }

  async update(record: CameraCaptureRecord) {
    this.map.set(record.id, record);
  }

  async get(captureId: string) {
    return this.map.get(captureId) ?? null;
  }

  async list() {
    return Array.from(this.map.values());
  }
}

function createLogger() {
  return {
    log: jest.fn(),
    logError: jest.fn(),
  };
}

describe('BackgroundRemovalQueue', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('processes new capture and marks it ready', async () => {
    jest.useFakeTimers();

    const adapter: BackgroundRemovalAdapter = {
      removeBackground: jest.fn().mockResolvedValue({
        processedUri: 'file://processed.png',
        maskUri: 'file://mask.png',
      }),
    };

    const cacheStore = new TestCaptureCache();
    const logger = createLogger();
    const cameraService = createCameraService({
      fallbackCapture: async () => ({ uri: 'file://local.jpg' }),
      cacheStore,
      nowUtc: () => '2025-05-01T00:00:00.000Z',
      generateId: () => 'capture-1',
      logger,
    });

    const queueLogger = createLogger();
    const queue = createBackgroundRemovalQueue({
      cameraService,
      adapter,
      nowUtc: () => '2025-05-01T00:00:00.000Z',
      logger: queueLogger,
    });

    queue.start();

    const events: CameraServiceEvent[] = [];
    cameraService.subscribe(event => events.push(event));

    const capture = await cameraService.capture({ draftId: 'draft-1' });
    expect(capture.status).toBe('pending');

    const snapshot = queue.getSnapshot();
    expect(snapshot).toEqual([
      expect.objectContaining({
        captureId: 'capture-1',
        state: 'scheduled',
      }),
    ]);

    await jest.runOnlyPendingTimersAsync();
    await flushMicrotasks();

    expect((adapter.removeBackground as jest.Mock)).toHaveBeenCalledTimes(1);

    const updated = await cameraService.getCachedCapture('capture-1');
    expect(updated?.status).toBe('ready');
    expect(updated?.processedUri).toBe('file://processed.png');
    expect(updated?.maskUri).toBe('file://mask.png');
    expect(events.map(event => event.type)).toContain('captureReady');

    queue.stop();
  });

  it('retries failed removals with backoff', async () => {
    jest.useFakeTimers();

    const adapter: BackgroundRemovalAdapter = {
      removeBackground: jest
        .fn()
        .mockRejectedValueOnce(new Error('proxy-timeout'))
        .mockResolvedValue({ processedUri: 'file://processed-second.png' }),
    };

    const cacheStore = new TestCaptureCache();
    const cameraService = createCameraService({
      fallbackCapture: async () => ({ uri: 'file://local.jpg' }),
      cacheStore,
      nowUtc: () => '2025-06-01T00:00:00.000Z',
      generateId: () => 'capture-retry',
      logger: createLogger(),
    });

    const queue = createBackgroundRemovalQueue({
      cameraService,
      adapter,
      nowUtc: () => '2025-06-01T00:00:00.000Z',
      logger: createLogger(),
    });

    queue.start();

    await cameraService.capture();

    const firstSnapshot = queue.getSnapshot();
    expect(firstSnapshot.some(entry => entry.captureId === 'capture-retry')).toBe(true);

    // First run fails
    await jest.runOnlyPendingTimersAsync();
    await flushMicrotasks();

    expect((adapter.removeBackground as jest.Mock)).toHaveBeenCalledTimes(1);

    const failed = await cameraService.getCachedCapture('capture-retry');
    expect(failed?.status).toBe('failed');
    expect(failed?.lastError).toBe('proxy-timeout');

    // Second run (retry) succeeds
    await jest.runOnlyPendingTimersAsync();
    await flushMicrotasks();

    const retried = await cameraService.getCachedCapture('capture-retry');
    expect(retried?.status).toBe('ready');
    expect(retried?.processedUri).toBe('file://processed-second.png');
    expect((adapter.removeBackground as jest.Mock)).toHaveBeenCalledTimes(2);

    queue.stop();
  });
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}


