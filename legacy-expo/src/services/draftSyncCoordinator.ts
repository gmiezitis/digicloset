import { closetStore } from './closetStore';
import {
  bootstrapDraftSyncQueue,
  shutdownDraftSyncQueue,
  startDraftSyncQueue,
} from './draftSyncQueue';

const LOG_TAG = '[draft-sync-coordinator]';

let initPromise: Promise<void> | null = null;

export async function initializeDraftSync() {
  if (!initPromise) {
    initPromise = (async () => {
      await closetStore.initialize();
      startDraftSyncQueue();
      await bootstrapDraftSyncQueue();
      log('initialized');
    })().catch(error => {
      logError('initialize', error);
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

export async function refreshDraftSync() {
  await closetStore.refresh();
  await bootstrapDraftSyncQueue();
}

export function shutdownDraftSync() {
  shutdownDraftSyncQueue();
  log('shutdown');
}

function log(event: string, metadata?: Record<string, unknown>) {
  console.log(`${LOG_TAG} ${event}`, {
    timestampUtc: new Date().toISOString(),
    ...(metadata ?? {}),
  });
}

function logError(event: string, error: unknown, metadata?: Record<string, unknown>) {
  console.error(`${LOG_TAG} ${event} failed`, {
    timestampUtc: new Date().toISOString(),
    error,
    ...(metadata ?? {}),
  });
}


