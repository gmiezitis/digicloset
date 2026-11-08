import { defaultNowUtc } from '../storage';
import type { CameraCaptureRecord, CameraService, CameraServiceEvent } from './CameraService';

type CleanupJob = {
  captureId: string;
  uri: string;
  attempt: number;
  reason: string;
  timer?: ReturnType<typeof setTimeout>;
  scheduledAtUtc: string;
  nextRunUtc: string | null;
};

type CleanupSnapshot = {
  captureId: string;
  attempt: number;
  nextRunUtc: string | null;
  state: 'scheduled' | 'running';
  reason: string;
};

type CleanupListener = (snapshot: CleanupSnapshot[]) => void;

export interface BackgroundCleanupQueueDependencies {
  cameraService: CameraService;
  removeFile: (uri: string) => Promise<void>;
  retentionMs?: number;
  maxRetryDelayMs?: number;
  nowUtc?: () => string;
}

export interface BackgroundCleanupQueue {
  start(): void;
  stop(): void;
  getSnapshot(): CleanupSnapshot[];
  subscribe(listener: CleanupListener): () => void;
}

const LOG_TAG = '[cleanup-queue]';
const DEFAULT_RETENTION_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createBackgroundCleanupQueue(
  deps: BackgroundCleanupQueueDependencies
): BackgroundCleanupQueue {
  const cameraService = deps.cameraService;
  const removeFile = deps.removeFile;
  const retentionMs = deps.retentionMs ?? DEFAULT_RETENTION_MS;
  const maxRetryDelay = deps.maxRetryDelayMs ?? MAX_DELAY_MS;
  const nowUtc = deps.nowUtc ?? defaultNowUtc;

  const scheduledJobs = new Map<string, CleanupJob>();
  const runningJobs = new Map<string, { attempt: number; reason: string; startedAtUtc: string }>();
  const listeners = new Set<CleanupListener>();

  let unsubCamera: (() => void) | null = null;
  let active = false;

  function start() {
    if (active) {
      return;
    }
    active = true;
    unsubCamera = cameraService.subscribe(handleCameraEvent);
    void seedFromExistingCaptures();
    emitSnapshot();
    log('started');
  }

  function stop() {
    if (!active) {
      return;
    }
    active = false;
    if (unsubCamera) {
      unsubCamera();
      unsubCamera = null;
    }
    scheduledJobs.forEach(job => {
      if (job.timer) {
        clearTimeout(job.timer);
      }
    });
    scheduledJobs.clear();
    runningJobs.clear();
    emitSnapshot();
    log('stopped');
  }

  async function seedFromExistingCaptures() {
    const captures = await cameraService.listCachedCaptures();
    captures
      .filter(record => record.status === 'ready' || record.status === 'failed')
      .forEach(record =>
        scheduleCleanup(record, retentionMs, 'bootstrap', record.retries ?? 0)
      );
  }

  function handleCameraEvent(event: CameraServiceEvent) {
    if (!active) {
      return;
    }
    switch (event.type) {
      case 'captureReady':
        scheduleCleanup(event.record, retentionMs, 'ready', event.record.retries ?? 0);
        break;
      case 'captureFailed':
        scheduleCleanup(event.record, 0, 'failed', event.record.retries ?? 0);
        break;
      default:
        break;
    }
  }

  function scheduleCleanup(
    record: CameraCaptureRecord,
    delayMs: number,
    reason: string,
    attempt = 0
  ) {
    if (!record.processedUri && !record.localUri) {
      return;
    }

    const targetUri = record.processedUri ?? record.localUri;
    const existing = scheduledJobs.get(record.id);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const job: CleanupJob = {
      captureId: record.id,
      uri: targetUri,
      attempt,
      reason,
      scheduledAtUtc: nowUtc(),
      nextRunUtc: delayMs === 0 ? nowUtc() : new Date(Date.now() + delayMs).toISOString(),
    };

    job.timer = setTimeout(() => {
      void runJob(job);
    }, Math.max(delayMs, 0));

    scheduledJobs.set(record.id, job);
    emitSnapshot();
    log('scheduled', { captureId: record.id, delayMs, reason });
  }

  async function runJob(job: CleanupJob) {
    if (!active) {
      return;
    }

    scheduledJobs.delete(job.captureId);
    runningJobs.set(job.captureId, {
      attempt: job.attempt,
      reason: job.reason,
      startedAtUtc: nowUtc(),
    });
    emitSnapshot();

    try {
      await removeFile(job.uri);
      await cameraService.markCaptureCached(job.captureId);
      runningJobs.delete(job.captureId);
      emitSnapshot();
      log('cleanup-success', { captureId: job.captureId, uri: job.uri });
    } catch (error) {
      runningJobs.delete(job.captureId);
      const nextAttempt = job.attempt + 1;
      const delayMs = Math.min(Math.pow(2, nextAttempt) * 1000, maxRetryDelay);
      const latestRecord = await lookupCapture(job.captureId, job.uri);
      if (latestRecord) {
        scheduleCleanup(latestRecord, delayMs, 'retry', nextAttempt);
      }
      logError('cleanup-failed', error, { captureId: job.captureId, attempt: nextAttempt });
    }
  }

  async function lookupCapture(captureId: string, fallbackUri: string): Promise<CameraCaptureRecord | null> {
    const captures = await cameraService.listCachedCaptures();
    const record = captures.find(entry => entry.id === captureId);
    if (record) {
      return record;
    }
    return {
      id: captureId,
      localUri: fallbackUri,
      processedUri: fallbackUri,
      capturedAtUtc: nowUtc(),
      updatedAtUtc: nowUtc(),
      status: 'ready',
      retries: 0,
      version: 1,
    };
  }

  function getSnapshot(): CleanupSnapshot[] {
    const scheduled = Array.from(scheduledJobs.values()).map(job => ({
      captureId: job.captureId,
      attempt: job.attempt,
      nextRunUtc: job.nextRunUtc,
      state: 'scheduled' as const,
      reason: job.reason,
    }));

    const running = Array.from(runningJobs.entries()).map(([captureId, job]) => ({
      captureId,
      attempt: job.attempt,
      nextRunUtc: null,
      state: 'running' as const,
      reason: job.reason,
    }));

    return [...scheduled, ...running];
  }

  function subscribe(listener: CleanupListener) {
    listeners.add(listener);
    listener(getSnapshot());
    return () => {
      listeners.delete(listener);
    };
  }

  function emitSnapshot() {
    const snapshot = getSnapshot();
    listeners.forEach(listener => listener(snapshot));
  }

  return {
    start,
    stop,
    getSnapshot,
    subscribe,
  };
}

function log(event: string, metadata?: Record<string, unknown>) {
  console.log(`${LOG_TAG} ${event}`, {
    timestampUtc: defaultNowUtc(),
    ...(metadata ?? {}),
  });
}

function logError(event: string, error: unknown, metadata?: Record<string, unknown>) {
  console.error(`${LOG_TAG} ${event} failed`, {
    timestampUtc: defaultNowUtc(),
    error,
    ...(metadata ?? {}),
  });
}


