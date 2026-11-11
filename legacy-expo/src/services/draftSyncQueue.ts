import type { WardrobeDraft } from '@/types/draft';
import type { WardrobeItem } from '@/types/item';
import { createWardrobeItem } from '@/types/item';
import {
  createRandomId,
  defaultNowUtc,
  getWardrobeDraft,
  removeWardrobeDraft,
  setLastSyncSnapshot,
  upsertWardrobeDraft,
  upsertWardrobeItem,
} from './storage';
import { closetStore } from './closetStore';

const LOG_TAG = '[draft-sync-queue]';
const MAX_DELAY_MS = 5 * 60 * 1000; // 5 minutes

type DraftSyncJob = {
  draftId: string;
  attempt: number;
  reason: string;
  timer?: ReturnType<typeof setTimeout>;
  scheduledAtUtc: string;
  nextRunUtc: string | null;
  lastKnownUpdatedAtUtc: string;
};

type RunningJob = {
  attempt: number;
  reason: string;
  startedAtUtc: string;
};

export type DraftSyncQueueSnapshot = {
  draftId: string;
  attempt: number;
  state: 'scheduled' | 'running';
  nextRunUtc: string | null;
  reason: string;
};

type QueueListener = (snapshot: DraftSyncQueueSnapshot[]) => void;

const scheduledJobs = new Map<string, DraftSyncJob>();
const runningJobs = new Map<string, RunningJob>();
const listeners = new Set<QueueListener>();

let queueActive = false;
let customNowUtc: (() => string) | null = null;

export function configureDraftSyncQueue(options: { nowUtc?: () => string } = {}) {
  if (options.nowUtc) {
    customNowUtc = options.nowUtc;
  }
}

export function startDraftSyncQueue() {
  queueActive = true;
  emitTelemetry();
}

export function shutdownDraftSyncQueue() {
  scheduledJobs.forEach(job => {
    if (job.timer) {
      clearTimeout(job.timer);
    }
  });
  scheduledJobs.clear();
  runningJobs.clear();
  queueActive = false;
  emitTelemetry();
}

export function subscribeToDraftSyncQueue(listener: QueueListener) {
  listeners.add(listener);
  listener(getDraftSyncQueueSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getDraftSyncQueueSnapshot(): DraftSyncQueueSnapshot[] {
  const scheduled = Array.from(scheduledJobs.values()).map(job => ({
    draftId: job.draftId,
    attempt: job.attempt,
    state: 'scheduled' as const,
    nextRunUtc: job.nextRunUtc,
    reason: job.reason,
  }));

  const running = Array.from(runningJobs.entries()).map(([draftId, job]) => ({
    draftId,
    attempt: job.attempt,
    state: 'running' as const,
    nextRunUtc: null,
    reason: job.reason,
  }));

  return [...scheduled, ...running].sort((a, b) => a.draftId.localeCompare(b.draftId));
}

export function enqueueDraftSync(
  draft: WardrobeDraft,
  options: { reason?: string; immediate?: boolean } = {}
) {
  ensureQueueActive();

  const delayMs = options.immediate ? 0 : computeDelayMs(0);
  scheduleDraft(draft, {
    attempt: 0,
    delayMs,
    reason: options.reason ?? 'queued',
    overwrite: true,
  });
}

export async function retryDraftSync(draftId: string, options: { immediate?: boolean } = {}) {
  ensureQueueActive();
  const draft = await getWardrobeDraft(draftId);
  if (!draft) {
    log('retry-skipped', { draftId, reason: 'missing-draft' });
    return;
  }

  const delayMs = options.immediate ? 0 : computeDelayMs(0);
  scheduleDraft(draft, {
    attempt: 0,
    delayMs,
    reason: 'manual-retry',
    overwrite: true,
  });
}

export async function bootstrapDraftSyncQueue() {
  ensureQueueActive();
  const { drafts } = closetStore.getState();
  drafts.forEach(draft =>
    scheduleDraft(draft, { attempt: 0, delayMs: computeDelayMs(0), reason: 'bootstrap' })
  );
}

export async function processDraftImmediately(draftId: string) {
  const job = scheduledJobs.get(draftId);
  if (!job) {
    const draft = await getWardrobeDraft(draftId);
    if (!draft) {
      return;
    }
    scheduleDraft(draft, { attempt: 0, delayMs: 0, reason: 'manual-immediate', overwrite: true });
    const scheduled = scheduledJobs.get(draftId);
    if (!scheduled) {
      return;
    }
    if (scheduled.timer) {
      clearTimeout(scheduled.timer);
      scheduled.timer = undefined;
    }
    await runJob(scheduled);
    return;
  }

  if (job.timer) {
    clearTimeout(job.timer);
    job.timer = undefined;
  }

  await runJob(job);
}

function ensureQueueActive() {
  if (!queueActive) {
    startDraftSyncQueue();
  }
}

function scheduleDraft(
  draft: WardrobeDraft,
  options: { attempt: number; delayMs: number; reason: string; overwrite?: boolean }
) {
  if (!queueActive) {
    return;
  }

  const existing = scheduledJobs.get(draft.id);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const job: DraftSyncJob = {
    draftId: draft.id,
    attempt: options.attempt,
    reason: options.reason,
    scheduledAtUtc: nowUtc(),
    nextRunUtc: options.delayMs === 0 ? nowUtc() : new Date(Date.now() + options.delayMs).toISOString(),
    lastKnownUpdatedAtUtc: draft.updatedAtUtc,
  };

  const timer = setTimeout(() => {
    void runJob(job);
  }, Math.max(options.delayMs, 0));
  job.timer = timer;
  scheduledJobs.set(draft.id, job);
  emitTelemetry();

  log('scheduled', {
    draftId: draft.id,
    attempt: job.attempt,
    delayMs: options.delayMs,
    reason: job.reason,
  });
}

async function runJob(job: DraftSyncJob) {
  if (!queueActive) {
    return;
  }

  scheduledJobs.delete(job.draftId);
  runningJobs.set(job.draftId, {
    attempt: job.attempt,
    reason: job.reason,
    startedAtUtc: nowUtc(),
  });
  emitTelemetry();

  try {
    await processDraft(job);
  } finally {
    runningJobs.delete(job.draftId);
    emitTelemetry();
  }
}

async function processDraft(job: DraftSyncJob) {
  const draft = await getWardrobeDraft(job.draftId);
  if (!draft) {
    log('process-skip', { draftId: job.draftId, reason: 'missing' });
    return;
  }

  if (Date.parse(draft.updatedAtUtc) > Date.parse(job.lastKnownUpdatedAtUtc)) {
    log('stale-job', { draftId: job.draftId });
    scheduleDraft(draft, {
      attempt: 0,
      delayMs: computeDelayMs(0),
      reason: 'updated-before-run',
    });
    return;
  }

  const attemptStartedAtUtc = nowUtc();
  const readiness = evaluateDraftReadiness(draft);

  try {
    switch (readiness.status) {
      case 'ready':
        await promoteDraftToWardrobe(draft, attemptStartedAtUtc);
        log('promoted', { draftId: draft.id });
        break;
      case 'blocked': {
        const updatedDraft = await markDraftPending(draft, readiness.message, attemptStartedAtUtc);
        scheduleDraft(updatedDraft, {
          attempt: job.attempt + 1,
          delayMs: computeDelayMs(job.attempt + 1),
          reason: readiness.code,
        });
        break;
      }
      case 'failed': {
        const failedDraft = await markDraftFailed(draft, readiness.message, attemptStartedAtUtc);
        scheduleDraft(failedDraft, {
          attempt: job.attempt + 1,
          delayMs: computeDelayMs(job.attempt + 1),
          reason: readiness.code,
        });
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    const failedDraft = await markDraftFailed(draft, message, attemptStartedAtUtc);
    scheduleDraft(failedDraft, {
      attempt: job.attempt + 1,
      delayMs: computeDelayMs(job.attempt + 1),
      reason: 'exception',
    });
    logError('process-error', error, { draftId: draft.id });
  }
}

async function promoteDraftToWardrobe(draft: WardrobeDraft, timestampUtc: string) {
  // Use the actual captured image URI, or a placeholder if not available
  const imageUri = draft.imageUri ?? `file://drafts/${draft.id}.jpg`;

  const item = createWardrobeItem(
    {
      id: createRandomId('item'),
      category: draft.category,
      name: draft.name,
      seasons: draft.seasons.length > 0 ? draft.seasons : ['all'],
      colors: [
        {
          name: 'Awaiting classification',
          hex: '#9CA3AF',
        },
      ],
      imageUri,
      syncStatus: 'synced',
      notes: draft.captureId ? `From capture ${draft.captureId}` : undefined,
    },
    () => timestampUtc,
    () => createRandomId('rev')
  );

  await upsertWardrobeItem(item);
  closetStore.applyItemUpsert(item);

  await removeWardrobeDraft(draft.id);
  closetStore.applyDraftRemoval(draft.id);

  const snapshot = {
    status: item.syncStatus,
    revisionId: item.revision.revisionId,
    timestampUtc,
  };
  await setLastSyncSnapshot(snapshot);
  closetStore.applyLastSyncSnapshot(snapshot);
  log('draft-migrated', { draftId: draft.id, itemId: item.id, imageUri });
}

async function markDraftPending(draft: WardrobeDraft, message: string, timestampUtc: string) {
  const updatedDraft: WardrobeDraft = {
    ...draft,
    revision: {
      ...draft.revision,
      updatedAtUtc: timestampUtc,
    },
    syncStatus: 'pending',
    updatedAtUtc: timestampUtc,
    lastSyncAttemptUtc: timestampUtc,
    lastSyncError: message,
  };

  await upsertWardrobeDraft(updatedDraft);
  closetStore.applyDraftUpsert(updatedDraft);

  const snapshot = {
    status: updatedDraft.syncStatus,
    revisionId: draft.revision.revisionId,
    timestampUtc,
  };
  await setLastSyncSnapshot(snapshot);
  closetStore.applyLastSyncSnapshot(snapshot);
  log('draft-pending', { draftId: draft.id, message });
  return updatedDraft;
}

async function markDraftFailed(draft: WardrobeDraft, message: string, timestampUtc: string) {
  const failedDraft: WardrobeDraft = {
    ...draft,
    revision: {
      ...draft.revision,
      updatedAtUtc: timestampUtc,
    },
    syncStatus: 'failed',
    updatedAtUtc: timestampUtc,
    lastSyncAttemptUtc: timestampUtc,
    lastSyncError: message,
  };

  await upsertWardrobeDraft(failedDraft);
  closetStore.applyDraftUpsert(failedDraft);

  const snapshot = {
    status: failedDraft.syncStatus,
    revisionId: draft.revision.revisionId,
    timestampUtc,
  };
  await setLastSyncSnapshot(snapshot);
  closetStore.applyLastSyncSnapshot(snapshot);
  log('draft-failed', { draftId: draft.id, message });
  return failedDraft;
}

function evaluateDraftReadiness(
  draft: WardrobeDraft
):
  | { status: 'ready' }
  | { status: 'blocked'; code: string; message: string }
  | { status: 'failed'; code: string; message: string } {
  if (!draft.wizard.photoConfirmed) {
    return {
      status: 'blocked',
      code: 'photo-unconfirmed',
      message: 'Awaiting photo confirmation.',
    };
  }

  if (!draft.wizard.cleanupConfirmed) {
    return {
      status: 'blocked',
      code: 'cleanup-pending',
      message: 'Waiting for background cleanup confirmation.',
    };
  }

  if (!draft.wizard.reviewAcknowledged) {
    return {
      status: 'blocked',
      code: 'review-pending',
      message: 'Review confirmation required before syncing.',
    };
  }

  if (!draft.name.trim()) {
    return {
      status: 'failed',
      code: 'invalid-name',
      message: 'Draft requires a valid name before syncing.',
    };
  }

  return { status: 'ready' };
}

function computeDelayMs(attempt: number) {
  const base = 2000;
  const cappedAttempt = Math.min(attempt, 6);
  const delay = base * Math.pow(2, cappedAttempt);
  return Math.min(delay, MAX_DELAY_MS);
}

function nowUtc() {
  return customNowUtc?.() ?? defaultNowUtc();
}

function emitTelemetry() {
  const snapshot = getDraftSyncQueueSnapshot();
  listeners.forEach(listener => listener(snapshot));
}

function log(event: string, metadata?: Record<string, unknown>) {
  console.log(`${LOG_TAG} ${event}`, {
    timestampUtc: nowUtc(),
    ...(metadata ?? {}),
  });
}

function logError(event: string, error: unknown, metadata?: Record<string, unknown>) {
  console.error(`${LOG_TAG} ${event} failed`, {
    timestampUtc: nowUtc(),
    error,
    ...(metadata ?? {}),
  });
}


