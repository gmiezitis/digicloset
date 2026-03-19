import {
  createCameraService,
  type CameraCaptureRecord,
  type CameraServiceEvent,
  type CameraService,
  type CaptureCacheStore,
} from '../camera/CameraService';
import { createBackgroundCleanupQueue } from '../camera/BackgroundCleanupQueue';

class TestCaptureCache implements CaptureCacheStore {
  private map = new Map<string, CameraCaptureRecord>();

  constructor(initial?: CameraCaptureRecord) {
    if (initial) {
      this.map.set(initial.id, initial);
    }
  }

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

describe('CameraService', () => {
  it('uses fallback capture when native adapter fails', async () => {
    const nativeAdapter = {
      capture: jest.fn().mockRejectedValue(new Error('native-fail')),
    };
    const fallbackCapture = jest.fn().mockResolvedValue({ uri: 'file://fallback.jpg' });
    const cacheStore = new TestCaptureCache();
    const logger = createLogger();
    const events: CameraServiceEvent[] = [];

    const service = createCameraService({
      nativeAdapter,
      fallbackCapture,
      cacheStore,
      nowUtc: () => '2025-01-01T00:00:00.000Z',
      generateId: () => 'capture-test',
      logger,
    });

    service.subscribe(event => events.push(event));

    const record = await service.capture({ draftId: 'draft-1' });

    expect(nativeAdapter.capture).toHaveBeenCalledTimes(1);
    expect(fallbackCapture).toHaveBeenCalledTimes(1);
    expect(record.status).toBe('pending');
    expect(record.localUri).toBe('file://fallback.jpg');
    expect(events.map(event => event.type)).toContain('captureCreated');

    const stored = await cacheStore.get('capture-test');
    expect(stored?.status).toBe('pending');

    expect(logger.logError).toHaveBeenCalledWith(
      'native-capture-failed',
      expect.any(Error),
      expect.objectContaining({ captureId: 'capture-test' })
    );
    expect(logger.log).toHaveBeenCalledWith(
      'fallback-capture-used',
      expect.objectContaining({ captureId: 'capture-test' })
    );
  });

  it('emits failure event when capture is unavailable', async () => {
    const nativeAdapter = {
      capture: jest.fn().mockRejectedValue(new Error('native-down')),
    };
    const fallbackCapture = jest.fn().mockResolvedValue(null);
    const cacheStore = new TestCaptureCache();
    const logger = createLogger();
    const events: CameraServiceEvent[] = [];

    const service = createCameraService({
      nativeAdapter,
      fallbackCapture,
      cacheStore,
      nowUtc: () => '2025-02-01T00:00:00.000Z',
      generateId: () => 'capture-missing',
      logger,
    });

    service.subscribe(event => events.push(event));

    const record = await service.capture();

    expect(record.status).toBe('failed');
    expect(record.lastError).toBe('native-down');
    expect(events.map(event => event.type)).toContain('captureFailed');

    const stored = await cacheStore.get('capture-missing');
    expect(stored?.status).toBe('failed');
    expect(logger.logError).toHaveBeenCalledWith(
      'native-capture-failed',
      expect.any(Error),
      expect.objectContaining({ captureId: 'capture-missing' })
    );
  });

  it('notifies subscribers on ready and cached transitions', async () => {
    const cacheStore = new TestCaptureCache();
    const logger = createLogger();
    const events: CameraServiceEvent[] = [];

    const service = createCameraService({
      fallbackCapture: async () => ({ uri: 'file://local.jpg' }),
      cacheStore,
      nowUtc: () => '2025-03-01T00:00:00.000Z',
      generateId: () => 'capture-ready',
      logger,
    });

    service.subscribe(event => events.push(event));

    const record = await service.capture();
    expect(record.status).toBe('pending');

    const readyRecord = await service.markCaptureReady('capture-ready', {
      processedUri: 'file://processed.jpg',
    });
    expect(readyRecord?.status).toBe('ready');
    expect(events.map(event => event.type)).toContain('captureReady');

    const failedRecord = await service.markCaptureFailed('capture-ready', new Error('cleanup'));
    expect(failedRecord?.status).toBe('failed');
    expect(events.filter(event => event.type === 'captureFailed')).toHaveLength(1);

    const cachedRecord = await service.markCaptureCached('capture-ready');
    expect(cachedRecord?.status).toBe('cached');
    expect(events.map(event => event.type)).toContain('captureUpdated');
  });
});

describe('BackgroundCleanupQueue', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('cleans processed captures and caches results', async () => {
    jest.useFakeTimers();

    const cacheStore = new TestCaptureCache();
    const logger = createLogger();
    const cameraService = createCameraService({
      fallbackCapture: async () => ({ uri: 'file://local.jpg' }),
      cacheStore,
      nowUtc: () => '2025-04-01T00:00:00.000Z',
      generateId: () => 'capture-cleanup',
      logger,
    });

    const removeFile = jest.fn().mockResolvedValue(undefined);
    const queue = createBackgroundCleanupQueue({
      cameraService,
      removeFile,
      retentionMs: 0,
      nowUtc: () => '2025-04-01T00:00:00.000Z',
    });

    const markCaptureCachedSpy = jest.spyOn(cameraService, 'markCaptureCached');

    queue.start();

    const capture = await cameraService.capture();
    expect(capture.status).toBe('pending');

    await cameraService.markCaptureReady('capture-cleanup', { processedUri: 'file://processed.jpg' });

    jest.runOnlyPendingTimers();
    await flushMicrotasks();

    expect(removeFile).toHaveBeenCalledWith('file://processed.jpg');
    expect(markCaptureCachedSpy).toHaveBeenCalledWith('capture-cleanup');

    queue.stop();
    markCaptureCachedSpy.mockRestore();
  });
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}


