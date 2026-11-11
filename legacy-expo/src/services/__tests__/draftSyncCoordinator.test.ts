jest.mock('../closetStore', () => ({
  closetStore: {
    initialize: jest.fn(),
    refresh: jest.fn(),
  },
}));

jest.mock('../draftSyncQueue', () => ({
  startDraftSyncQueue: jest.fn(),
  bootstrapDraftSyncQueue: jest.fn(),
  shutdownDraftSyncQueue: jest.fn(),
}));

type ClosetStoreMock = {
  initialize: jest.Mock<Promise<void>, []>;
  refresh: jest.Mock<Promise<void>, []>;
};

type DraftSyncQueueMock = {
  startDraftSyncQueue: jest.Mock<void, []>;
  bootstrapDraftSyncQueue: jest.Mock<Promise<void>, []>;
  shutdownDraftSyncQueue: jest.Mock<void, []>;
};

function getClosetStoreMock(): ClosetStoreMock {
  return require('../closetStore').closetStore as unknown as ClosetStoreMock;
}

function getDraftSyncQueueMock(): DraftSyncQueueMock {
  return require('../draftSyncQueue') as DraftSyncQueueMock;
}

function loadCoordinator() {
  return require('../draftSyncCoordinator') as typeof import('../draftSyncCoordinator');
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('draftSyncCoordinator', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('initializes draft sync only once for concurrent calls', async () => {
    const closetStore = getClosetStoreMock();
    const queue = getDraftSyncQueueMock();
    const deferred = createDeferred<void>();
    closetStore.initialize.mockReturnValue(deferred.promise);
    queue.bootstrapDraftSyncQueue.mockResolvedValue(undefined);

    const coordinator = loadCoordinator();

    const firstCall = coordinator.initializeDraftSync();
    const secondCall = coordinator.initializeDraftSync();

    expect(closetStore.initialize).toHaveBeenCalledTimes(1);
    expect(queue.startDraftSyncQueue).not.toHaveBeenCalled();

    deferred.resolve();
    await Promise.all([firstCall, secondCall]);

    expect(queue.startDraftSyncQueue).toHaveBeenCalledTimes(1);
    expect(queue.bootstrapDraftSyncQueue).toHaveBeenCalledTimes(1);
  });

  it('resets initialization state after a failure', async () => {
    const closetStore = getClosetStoreMock();
    const queue = getDraftSyncQueueMock();
    const error = new Error('init failed');
    closetStore.initialize.mockRejectedValueOnce(error);

    const coordinator = loadCoordinator();

    await expect(coordinator.initializeDraftSync()).rejects.toThrow(error);
    expect(queue.startDraftSyncQueue).not.toHaveBeenCalled();
    expect(queue.bootstrapDraftSyncQueue).not.toHaveBeenCalled();

    closetStore.initialize.mockResolvedValueOnce(undefined);
    queue.bootstrapDraftSyncQueue.mockResolvedValueOnce(undefined);

    await coordinator.initializeDraftSync();

    expect(closetStore.initialize).toHaveBeenCalledTimes(2);
    expect(queue.startDraftSyncQueue).toHaveBeenCalledTimes(1);
    expect(queue.bootstrapDraftSyncQueue).toHaveBeenCalledTimes(1);
  });

  it('refreshes closet state before bootstrapping the queue', async () => {
    const closetStore = getClosetStoreMock();
    const queue = getDraftSyncQueueMock();
    const callOrder: string[] = [];

    closetStore.refresh.mockImplementation(async () => {
      callOrder.push('refresh');
    });
    queue.bootstrapDraftSyncQueue.mockImplementation(async () => {
      callOrder.push('bootstrap');
    });

    const coordinator = loadCoordinator();
    await coordinator.refreshDraftSync();

    expect(callOrder).toEqual(['refresh', 'bootstrap']);
  });

  it('shuts down the queue and logs the event', () => {
    const queue = getDraftSyncQueueMock();
    const coordinator = loadCoordinator();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    coordinator.shutdownDraftSync();

    expect(queue.shutdownDraftSyncQueue).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[draft-sync-coordinator] shutdown',
      expect.objectContaining({
        timestampUtc: expect.any(String),
      })
    );

    logSpy.mockRestore();
  });
});








