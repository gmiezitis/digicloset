import { defaultNowUtc } from '../storage';
import type { CameraCaptureRecord, CameraService } from './CameraService';
import {
  backgroundRemovalRequestSchema,
  backgroundRemovalResponseSchema,
  type BackgroundRemovalRequest,
} from './backgroundRemovalProxy';

const LOG_TAG = '[background-removal-queue]';
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 15 * 60 * 1000; // 15 minutes

type RemovalJob = {
  captureId: string;
  attempt: number;
  reason: string;
  scheduledAtUtc: string;
  nextRunUtc: string | null;
  timer?: ReturnType<typeof setTimeout>;
};

type RunningRemovalJob = {
  attempt: number;
  reason: string;
  startedAtUtc: string;
};

export type BackgroundRemovalQueueSnapshot = {
  captureId: string;
  attempt: number;
  state: 'scheduled' | 'running';
  nextRunUtc: string | null;
  reason: string;
};

export interface BackgroundRemovalAdapter {
  removeBackground(input: {
    captureId: string;
    localUri: string;
    draftId?: string;
  }): Promise<{
    processedUri: string;
    maskUri?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface BackgroundRemovalQueueDependencies {
  cameraService: CameraService;
  adapter: BackgroundRemovalAdapter;
  nowUtc?: () => string;
  maxDelayMs?: number;
  logger?: {
    log: (event: string, metadata?: Record<string, unknown>) => void;
    logError: (event: string, error: unknown, metadata?: Record<string, unknown>) => void;
  };
}

export interface BackgroundRemovalQueue {
  start(): void;
  stop(): void;
  enqueue(captureId: string, options?: { immediate?: boolean; reason?: string }): Promise<void>;
  getSnapshot(): BackgroundRemovalQueueSnapshot[];
  subscribe(listener: (snapshot: BackgroundRemovalQueueSnapshot[]) => void): () => void;
}

export function createBackgroundRemovalQueue(
  deps: BackgroundRemovalQueueDependencies
): BackgroundRemovalQueue {
  const cameraService = deps.cameraService;
  const adapter = deps.adapter;
  const nowUtc = deps.nowUtc ?? defaultNowUtc;
  const maxDelay = deps.maxDelayMs ?? MAX_DELAY_MS;
  const logger = deps.logger ?? createConsoleLogger();

  const scheduledJobs = new Map<string, RemovalJob>();
  const runningJobs = new Map<string, RunningRemovalJob>();
  const listeners = new Set<(snapshot: BackgroundRemovalQueueSnapshot[]) => void>();

  let active = false;
  let unsubscribeCamera: (() => void) | null = null;

  function start() {
    if (active) {
      return;
    }
    active = true;
    unsubscribeCamera = cameraService.subscribe(handleCameraEvent);
    void seedFromExistingCaptures();
    emitSnapshot();
    logger.log('started');
  }

  function stop() {
    if (!active) {
      return;
    }
    active = false;
    if (unsubscribeCamera) {
      unsubscribeCamera();
      unsubscribeCamera = null;
    }
    scheduledJobs.forEach(job => {
      if (job.timer) {
        clearTimeout(job.timer);
      }
    });
    scheduledJobs.clear();
    runningJobs.clear();
    emitSnapshot();
    logger.log('stopped');
  }

  async function seedFromExistingCaptures() {
    const captures = await cameraService.listCachedCaptures();
    captures
      .filter(record => record.status === 'pending' || record.status === 'processing')
      .forEach(record =>
        scheduleRemoval(record, {
          attempt: record.retries,
          delayMs: computeDelay(record.retries),
          reason: 'bootstrap',
        })
      );
  }

  function handleCameraEvent(event: { type: string; record: CameraCaptureRecord }) {
    if (!active) {
      return;
    }

    switch (event.type) {
      case 'captureCreated':
        scheduleRemoval(event.record, {
          attempt: 0,
          delayMs: 0,
          reason: 'capture-created',
        });
        break;
      default:
        break;
    }
  }

  async function enqueue(
    captureId: string,
    options: { immediate?: boolean; reason?: string } = {}
  ) {
    const record = await cameraService.getCachedCapture(captureId);
    if (!record) {
      logger.log('enqueue-skip-missing', { captureId });
      return;
    }

    scheduleRemoval(record, {
      attempt: record.retries,
      delayMs: options.immediate ? 0 : computeDelay(record.retries),
      reason: options.reason ?? 'manual',
    });
  }

  function scheduleRemoval(
    record: CameraCaptureRecord,
    options: { attempt: number; delayMs: number; reason: string }
  ) {
    if (!active) {
      return;
    }

    if (record.status === 'ready' || record.status === 'cached') {
      return;
    }

    const existing = scheduledJobs.get(record.id);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const job: RemovalJob = {
      captureId: record.id,
      attempt: options.attempt,
      reason: options.reason,
      scheduledAtUtc: nowUtc(),
      nextRunUtc:
        options.delayMs === 0 ? nowUtc() : new Date(Date.now() + options.delayMs).toISOString(),
    };

    job.timer = setTimeout(() => {
      void runJob(job);
    }, Math.max(options.delayMs, 0));

    scheduledJobs.set(record.id, job);
    emitSnapshot();
    logger.log('scheduled', {
      captureId: record.id,
      attempt: job.attempt,
      delayMs: options.delayMs,
      reason: job.reason,
    });
  }

  async function runJob(job: RemovalJob) {
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
      await processCapture(job);
    } finally {
      runningJobs.delete(job.captureId);
      emitSnapshot();
    }
  }

  async function processCapture(job: RemovalJob) {
    const record = await cameraService.getCachedCapture(job.captureId);
    if (!record) {
      logger.log('process-skip-missing', { captureId: job.captureId });
      return;
    }

    if (record.status === 'ready' || record.status === 'cached') {
      logger.log('process-skip-complete', { captureId: job.captureId, status: record.status });
      return;
    }

    if (!record.localUri || record.localUri.startsWith('unavailable://')) {
      logger.log('process-skip-unavailable', { captureId: job.captureId, uri: record.localUri });
      return;
    }

    await cameraService.markCaptureProcessing(record.id);

    try {
      const result = await adapter.removeBackground({
        captureId: record.id,
        localUri: record.localUri,
        draftId: record.draftId,
      });

      await cameraService.markCaptureReady(record.id, {
        processedUri: result.processedUri,
        maskUri: result.maskUri,
      });

      logger.log('removal-success', {
        captureId: record.id,
        attempt: job.attempt,
        hasMask: Boolean(result.maskUri),
      });
    } catch (error) {
      await cameraService.markCaptureFailed(record.id, error);

      const nextAttempt = job.attempt + 1;
      scheduleRemoval(
        {
          ...record,
          retries: record.retries + 1,
        },
        {
          attempt: nextAttempt,
          delayMs: computeDelay(nextAttempt),
          reason: 'retry',
        }
      );

      logger.logError('removal-error', error, {
        captureId: record.id,
        attempt: job.attempt,
      });
    }
  }

  function getSnapshot(): BackgroundRemovalQueueSnapshot[] {
    const scheduled = Array.from(scheduledJobs.values()).map(job => ({
      captureId: job.captureId,
      attempt: job.attempt,
      state: 'scheduled' as const,
      nextRunUtc: job.nextRunUtc,
      reason: job.reason,
    }));

    const running = Array.from(runningJobs.entries()).map(([captureId, job]) => ({
      captureId,
      attempt: job.attempt,
      state: 'running' as const,
      nextRunUtc: null,
      reason: job.reason,
    }));

    return [...scheduled, ...running];
  }

  function subscribe(listener: (snapshot: BackgroundRemovalQueueSnapshot[]) => void) {
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

  function computeDelay(attempt: number) {
    const delay = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt));
    return Math.min(delay, maxDelay);
  }

  return {
    start,
    stop,
    enqueue,
    getSnapshot,
    subscribe,
  };
}

export function createProxyBackgroundRemovalAdapter(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}): BackgroundRemovalAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, '')}/background-removal`;

  return {
    async removeBackground({ captureId, localUri, draftId }) {
      const requestPayload: BackgroundRemovalRequest = {
        captureId,
        draftId,
        sourceUri: localUri,
      };

      backgroundRemovalRequestSchema.parse(requestPayload);

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorBody = await safeReadText(response);
        throw new Error(
          `Background removal failed (${response.status}): ${errorBody || response.statusText}`
        );
      }

      const payloadJson = await response.json();
      const payload = backgroundRemovalResponseSchema.parse(payloadJson);

      return payload;
    },
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

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}


