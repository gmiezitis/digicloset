import { createRandomId, defaultNowUtc } from '../storage';

export type CameraCaptureStatus = 'pending' | 'processing' | 'cached' | 'ready' | 'failed';

export type CameraCaptureRecord = {
  id: string;
  draftId?: string;
  localUri: string;
  processedUri?: string;
  maskUri?: string;
  capturedAtUtc: string;
  updatedAtUtc: string;
  status: CameraCaptureStatus;
  retries: number;
  lastError?: string;
  version: number;
};

export type CameraCaptureRequest = {
  draftId?: string;
  useFrontCamera?: boolean;
};

export type CameraServiceEvent =
  | { type: 'captureCreated'; record: CameraCaptureRecord }
  | { type: 'captureUpdated'; record: CameraCaptureRecord }
  | { type: 'captureFailed'; record: CameraCaptureRecord }
  | { type: 'captureReady'; record: CameraCaptureRecord };

export interface NativeCameraAdapter {
  capture(options?: CameraCaptureRequest): Promise<{ uri: string }>;
  pickFromLibrary?(options?: { multiple?: boolean }): Promise<{ uris: string[] }>;
}

export interface CaptureCacheStore {
  save(record: CameraCaptureRecord): Promise<void>;
  update(record: CameraCaptureRecord): Promise<void>;
  get(captureId: string): Promise<CameraCaptureRecord | null>;
  list(): Promise<CameraCaptureRecord[]>;
}

export interface CameraServiceDependencies {
  nativeAdapter?: NativeCameraAdapter;
  fallbackCapture?: () => Promise<{ uri: string } | null>;
  cacheStore?: CaptureCacheStore;
  nowUtc?: () => string;
  generateId?: () => string;
  logger?: {
    log: (event: string, metadata?: Record<string, unknown>) => void;
    logError: (event: string, error: unknown, metadata?: Record<string, unknown>) => void;
  };
}

export interface CameraService {
  capture(request?: CameraCaptureRequest): Promise<CameraCaptureRecord>;
  importFromLibrary(options?: { multiple?: boolean }): Promise<CameraCaptureRecord[]>;
  getCachedCapture(captureId: string): Promise<CameraCaptureRecord | null>;
  listCachedCaptures(): Promise<CameraCaptureRecord[]>;
  markCaptureProcessing(captureId: string): Promise<CameraCaptureRecord | null>;
  markCaptureReady(
    captureId: string,
    payload: { processedUri: string; maskUri?: string }
  ): Promise<CameraCaptureRecord | null>;
  markCaptureFailed(captureId: string, error: unknown): Promise<CameraCaptureRecord | null>;
  markCaptureCached(captureId: string): Promise<CameraCaptureRecord | null>;
  subscribe(listener: (event: CameraServiceEvent) => void): () => void;
}

const LOG_TAG = '[camera-service]';
const CACHE_VERSION = 1;

export class CameraCaptureCancelledError extends Error {
  constructor(message = 'Capture cancelled by user') {
    super(message);
    this.name = 'CameraCaptureCancelledError';
  }
}

export function createCameraService(deps: CameraServiceDependencies = {}): CameraService {
  const cacheStore = deps.cacheStore ?? new InMemoryCaptureCache();
  const nowUtc = deps.nowUtc ?? defaultNowUtc;
  const generateId = deps.generateId ?? (() => createRandomId('capture'));
  const logger = deps.logger ?? createConsoleLogger();
  const emitter = new EventEmitter();

  async function createRecordFromUri(uri: string, draftId?: string): Promise<CameraCaptureRecord> {
    const captureId = generateId();
    const capturedAtUtc = nowUtc();

    const record: CameraCaptureRecord = {
      id: captureId,
      draftId,
      localUri: uri,
      capturedAtUtc,
      updatedAtUtc: capturedAtUtc,
      status: 'pending',
      retries: 0,
      version: CACHE_VERSION,
    };

    await cacheStore.save(record);
    emitter.emit({ type: 'captureCreated', record });
    logger.log('capture-created', { captureId, draftId, source: 'library' });
    return record;
  }

  async function importFromLibrary(options?: { multiple?: boolean }): Promise<CameraCaptureRecord[]> {
    if (!deps.nativeAdapter?.pickFromLibrary) {
      throw new Error('Library import not supported by adapter');
    }

    try {
      const result = await deps.nativeAdapter.pickFromLibrary(options);
      const records = await Promise.all(
        result.uris.map(uri => createRecordFromUri(uri))
      );
      return records;
    } catch (error) {
      if (error instanceof CameraCaptureCancelledError) {
        throw error;
      }
      logger.logError('library-import-failed', error);
      throw error;
    }
  }

  async function capture(request?: CameraCaptureRequest): Promise<CameraCaptureRecord> {
    const captureId = generateId();
    const capturedAtUtc = nowUtc();

    let localUri: string | null = null;
    let errorMessage: string | undefined;

    try {
      if (deps.nativeAdapter) {
        const result = await deps.nativeAdapter.capture(request);
        localUri = result.uri;
      }
    } catch (error) {
      if (error instanceof CameraCaptureCancelledError) {
        logger.log('capture-cancelled', { captureId });
        throw error;
      }
      errorMessage = serializeError(error);
      logger.logError('native-capture-failed', error, { captureId });
    }

    if (!localUri && deps.fallbackCapture) {
      try {
        const fallback = await deps.fallbackCapture();
        localUri = fallback?.uri ?? null;
        if (localUri) {
          logger.log('fallback-capture-used', { captureId, uri: localUri });
        }
      } catch (error) {
        if (error instanceof CameraCaptureCancelledError) {
          logger.log('capture-cancelled', { captureId });
          throw error;
        }
        errorMessage = serializeError(error);
        logger.logError('fallback-capture-failed', error, { captureId });
      }
    }

    if (!localUri) {
      const failedRecord: CameraCaptureRecord = {
        id: captureId,
        draftId: request?.draftId,
        localUri: 'unavailable://capture',
        capturedAtUtc,
        updatedAtUtc: capturedAtUtc,
        status: 'failed',
        retries: 0,
        lastError: errorMessage ?? 'Capture unavailable.',
        version: CACHE_VERSION,
      };
      await cacheStore.save(failedRecord);
      emitter.emit({ type: 'captureFailed', record: failedRecord });
      return failedRecord;
    }

    const record: CameraCaptureRecord = {
      id: captureId,
      draftId: request?.draftId,
      localUri,
      capturedAtUtc,
      updatedAtUtc: capturedAtUtc,
      status: 'pending',
      retries: 0,
      version: CACHE_VERSION,
    };

    await cacheStore.save(record);
    emitter.emit({ type: 'captureCreated', record });
    logger.log('capture-created', { captureId, draftId: request?.draftId });
    return record;
  }

  async function listCachedCaptures() {
    return cacheStore.list();
  }

  async function getCachedCapture(captureId: string) {
    return cacheStore.get(captureId);
  }

  async function markCaptureProcessing(captureId: string): Promise<CameraCaptureRecord | null> {
    const record = await cacheStore.get(captureId);
    if (!record) {
      logger.log('capture-processing-miss', { captureId });
      return null;
    }

    const updated: CameraCaptureRecord = {
      ...record,
      status: 'processing',
      updatedAtUtc: nowUtc(),
      lastError: undefined,
    };

    await cacheStore.update(updated);
    emitter.emit({ type: 'captureUpdated', record: updated });
    logger.log('capture-processing', { captureId });
    return updated;
  }

  async function markCaptureReady(
    captureId: string,
    payload: { processedUri: string; maskUri?: string }
  ): Promise<CameraCaptureRecord | null> {
    const record = await cacheStore.get(captureId);
    if (!record) {
      logger.log('capture-ready-miss', { captureId });
      return null;
    }

    const updated: CameraCaptureRecord = {
      ...record,
      processedUri: payload.processedUri,
      maskUri: payload.maskUri ?? record.maskUri,
      status: 'ready',
      updatedAtUtc: nowUtc(),
      lastError: undefined,
    };

    await cacheStore.update(updated);
    emitter.emit({ type: 'captureReady', record: updated });
    logger.log('capture-ready', { captureId });
    return updated;
  }

  async function markCaptureFailed(
    captureId: string,
    error: unknown
  ): Promise<CameraCaptureRecord | null> {
    const record = await cacheStore.get(captureId);
    if (!record) {
      logger.log('capture-fail-miss', { captureId });
      return null;
    }

    const updated: CameraCaptureRecord = {
      ...record,
      status: 'failed',
      updatedAtUtc: nowUtc(),
      retries: record.retries + 1,
      lastError: serializeError(error),
      // preserve processed/mask URIs so user can review prior attempt if available
    };

    await cacheStore.update(updated);
    emitter.emit({ type: 'captureFailed', record: updated });
    logger.logError('capture-mark-failed', error, { captureId });
    return updated;
  }

  async function markCaptureCached(captureId: string) {
    const record = await cacheStore.get(captureId);
    if (!record) {
      logger.log('capture-cache-miss', { captureId });
      return null;
    }

    const updated: CameraCaptureRecord = {
      ...record,
      status: 'cached',
      updatedAtUtc: nowUtc(),
    };

    await cacheStore.update(updated);
    emitter.emit({ type: 'captureUpdated', record: updated });
    logger.log('capture-cached', { captureId });
    return updated;
  }

  return {
    capture,
    importFromLibrary,
    getCachedCapture,
    listCachedCaptures,
    markCaptureProcessing,
    markCaptureReady,
    markCaptureFailed,
    markCaptureCached,
    subscribe: emitter.subscribe,
  };
}

class InMemoryCaptureCache implements CaptureCacheStore {
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

class EventEmitter {
  private listeners = new Set<(event: CameraServiceEvent) => void>();

  emit(event: CameraServiceEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  subscribe = (listener: (event: CameraServiceEvent) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

function createConsoleLogger() {
  return {
    log: (event: string, metadata?: Record<string, unknown>) => {
      console.log(`${LOG_TAG} ${event}`, {
        timestampUtc: defaultNowUtc(),
        ...(metadata ?? {}),
      });
    },
    logError: (event: string, error: unknown, metadata?: Record<string, unknown>) => {
      console.error(`${LOG_TAG} ${event} failed`, {
        timestampUtc: defaultNowUtc(),
        error,
        ...(metadata ?? {}),
      });
    },
  };
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}


