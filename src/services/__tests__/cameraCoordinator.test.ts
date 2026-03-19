import { API_BASE_URL } from '@/constants';

jest.mock('../camera/CameraService', () => ({
  createCameraService: jest.fn(),
}));

jest.mock('../camera/BackgroundRemovalQueue', () => ({
  createBackgroundRemovalQueue: jest.fn(),
  createProxyBackgroundRemovalAdapter: jest.fn(),
}));

type CameraServiceMock = {
  subscribe: jest.Mock;
};

type BackgroundRemovalQueueMock = {
  start: jest.Mock;
  stop: jest.Mock;
  enqueue: jest.Mock;
};

function getCameraServiceFactory() {
  return require('../camera/CameraService').createCameraService as jest.Mock;
}

function getBackgroundRemovalQueueFactory() {
  const module = require('../camera/BackgroundRemovalQueue');
  return {
    createBackgroundRemovalQueue: module.createBackgroundRemovalQueue as jest.Mock,
    createProxyBackgroundRemovalAdapter: module.createProxyBackgroundRemovalAdapter as jest.Mock,
  };
}

function loadCoordinator() {
  return require('../cameraCoordinator') as typeof import('../cameraCoordinator');
}

function createCameraServiceMock(): CameraServiceMock {
  return {
    subscribe: jest.fn().mockReturnValue(jest.fn()),
  };
}

function createQueueMock(): BackgroundRemovalQueueMock {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
}

describe('cameraCoordinator', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('creates camera service and background removal queue once, starting on each initialize call', () => {
    const cameraService = createCameraServiceMock();
    const queue = createQueueMock();
    const defaultAdapter = {};

    const createCameraService = getCameraServiceFactory();
    const { createBackgroundRemovalQueue, createProxyBackgroundRemovalAdapter } =
      getBackgroundRemovalQueueFactory();

    createCameraService.mockReturnValue(cameraService);
    createBackgroundRemovalQueue.mockReturnValue(queue);
    createProxyBackgroundRemovalAdapter.mockReturnValue(defaultAdapter);

    const coordinator = loadCoordinator();

    coordinator.initializeCameraProcessing();

    expect(createCameraService).toHaveBeenCalledTimes(1);
    expect(createProxyBackgroundRemovalAdapter).toHaveBeenCalledWith({ baseUrl: API_BASE_URL });
    expect(createBackgroundRemovalQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraService,
        adapter: defaultAdapter,
      })
    );
    expect(queue.start).toHaveBeenCalledTimes(1);
    expect(coordinator.getBackgroundRemovalQueue()).toBe(queue);

    coordinator.initializeCameraProcessing();

    expect(createCameraService).toHaveBeenCalledTimes(1);
    expect(createBackgroundRemovalQueue).toHaveBeenCalledTimes(1);
    expect(queue.start).toHaveBeenCalledTimes(2);
  });

  it('uses provided adapter and forwards queue dependencies', () => {
    const cameraService = createCameraServiceMock();
    const queue = createQueueMock();
    const customAdapter = { removeBackground: jest.fn() };
    const logger = { log: jest.fn(), logError: jest.fn() };

    const createCameraService = getCameraServiceFactory();
    const { createBackgroundRemovalQueue, createProxyBackgroundRemovalAdapter } =
      getBackgroundRemovalQueueFactory();

    createCameraService.mockReturnValue(cameraService);
    createBackgroundRemovalQueue.mockReturnValue(queue);

    const coordinator = loadCoordinator();

    coordinator.initializeCameraProcessing({
      adapter: customAdapter,
      queueDependencies: {
        maxDelayMs: 5_000,
        logger,
      },
    });

    expect(createProxyBackgroundRemovalAdapter).not.toHaveBeenCalled();
    expect(createBackgroundRemovalQueue).toHaveBeenCalledWith({
      cameraService,
      adapter: customAdapter,
      maxDelayMs: 5_000,
      logger,
    });
    expect(queue.start).toHaveBeenCalledWith();
  });

  it('stops background removal queue on shutdown', () => {
    const cameraService = createCameraServiceMock();
    const queue = createQueueMock();

    const createCameraService = getCameraServiceFactory();
    const { createBackgroundRemovalQueue } = getBackgroundRemovalQueueFactory();

    createCameraService.mockReturnValue(cameraService);
    createBackgroundRemovalQueue.mockReturnValue(queue);

    const coordinator = loadCoordinator();

    coordinator.initializeCameraProcessing();
    coordinator.shutdownCameraProcessing();

    expect(queue.stop).toHaveBeenCalledTimes(1);

    queue.stop.mockClear();
    coordinator.shutdownCameraProcessing();
    expect(queue.stop).toHaveBeenCalledTimes(1);
  });

  it('warns when retrying without initialized queue', async () => {
    const coordinator = loadCoordinator();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await coordinator.retryBackgroundRemoval('capture-uninitialized');

    expect(warnSpy).toHaveBeenCalledWith(
      '[camera-coordinator] Background removal queue not initialized'
    );

    warnSpy.mockRestore();
  });

  it('enqueues retry with defaults and provided options', async () => {
    const cameraService = createCameraServiceMock();
    const queue = createQueueMock();

    const createCameraService = getCameraServiceFactory();
    const { createBackgroundRemovalQueue } = getBackgroundRemovalQueueFactory();

    createCameraService.mockReturnValue(cameraService);
    createBackgroundRemovalQueue.mockReturnValue(queue);

    const coordinator = loadCoordinator();

    coordinator.initializeCameraProcessing();
    queue.enqueue.mockClear();

    await coordinator.retryBackgroundRemoval('capture-1');
    expect(queue.enqueue).toHaveBeenCalledWith('capture-1', {
      immediate: false,
      reason: 'manual-retry',
    });

    queue.enqueue.mockClear();

    await coordinator.retryBackgroundRemoval('capture-2', {
      immediate: true,
      reason: 'flaky',
    });
    expect(queue.enqueue).toHaveBeenCalledWith('capture-2', {
      immediate: true,
      reason: 'flaky',
    });
  });
});


