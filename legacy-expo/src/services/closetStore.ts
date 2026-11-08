import { defaultNowUtc, getLastSyncSnapshot, initializeStorage, listWardrobeDrafts, listWardrobeItems } from './storage';
import type { SyncSnapshot } from './storage';
import type { WardrobeDraft } from '@/types/draft';
import type { WardrobeItem } from '@/types/item';
import { useSyncExternalStore } from 'react';

const LOG_TAG = '[closet-store]';

type ClosetState = {
  loading: boolean;
  drafts: WardrobeDraft[];
  items: WardrobeItem[];
  lastSyncSnapshot: SyncSnapshot | null;
  hydratedAtUtc: string | null;
};

type Listener = () => void;

const INITIAL_STATE: ClosetState = {
  loading: true,
  drafts: [],
  items: [],
  lastSyncSnapshot: null,
  hydratedAtUtc: null,
};

export class ClosetStore {
  private state: ClosetState = INITIAL_STATE;
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState(): ClosetState {
    return this.state;
  }

  async initialize() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await initializeStorage();
        await this.refresh();
      })().catch(error => {
        this.logError('initialize', error);
        throw error;
      });
    }

    return this.initPromise;
  }

  async refresh() {
    this.setState(prev => ({ ...prev, loading: true }));
    try {
      const [drafts, items, snapshot] = await Promise.all([
        listWardrobeDrafts(),
        listWardrobeItems(),
        getLastSyncSnapshot(),
      ]);

      this.setState(() => ({
        loading: false,
        drafts: sortDrafts(drafts),
        items: sortItems(items),
        lastSyncSnapshot: snapshot,
        hydratedAtUtc: defaultNowUtc(),
      }));
      this.log('refreshed', {
        drafts: drafts.length,
        items: items.length,
        snapshotTimestampUtc: snapshot?.timestampUtc ?? null,
      });
    } catch (error) {
      this.logError('refresh', error);
      this.setState(prev => ({
        ...prev,
        loading: false,
        hydratedAtUtc: defaultNowUtc(),
      }));
    }
  }

  applyDraftUpsert(draft: WardrobeDraft) {
    this.setState(prev => ({
      ...prev,
      drafts: sortDrafts(replaceById(prev.drafts, draft)),
    }));
    this.log('draft-upserted', { id: draft.id, status: draft.syncStatus });
  }

  applyDraftRemoval(draftId: string) {
    this.setState(prev => ({
      ...prev,
      drafts: prev.drafts.filter(draft => draft.id !== draftId),
    }));
    this.log('draft-removed', { id: draftId });
  }

  applyItemUpsert(item: WardrobeItem) {
    this.setState(prev => ({
      ...prev,
      items: sortItems(replaceById(prev.items, item)),
    }));
    this.log('item-upserted', { id: item.id, status: item.syncStatus });
  }

  applyItemRemoval(itemId: string) {
    this.setState(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId),
    }));
    this.log('item-removed', { id: itemId });
  }

  applyLastSyncSnapshot(snapshot: SyncSnapshot | null) {
    this.setState(prev => ({
      ...prev,
      lastSyncSnapshot: snapshot,
    }));
    this.log('snapshot-updated', {
      status: snapshot?.status ?? null,
      timestampUtc: snapshot?.timestampUtc ?? null,
    });
  }

  private setState(updater: (prev: ClosetState) => ClosetState) {
    this.state = updater(this.state);
    this.listeners.forEach(listener => listener());
  }

  private log(event: string, metadata?: Record<string, unknown>) {
    const payload = {
      timestampUtc: defaultNowUtc(),
      ...(metadata ?? {}),
    };
    console.log(`${LOG_TAG} ${event}`, payload);
  }

  private logError(event: string, error: unknown, metadata?: Record<string, unknown>) {
    const payload = {
      timestampUtc: defaultNowUtc(),
      ...(metadata ?? {}),
      error,
    };
    console.error(`${LOG_TAG} ${event} failed`, payload);
  }
}

export const closetStore = new ClosetStore();

export function useClosetState() {
  return useSyncExternalStore(
    closetStore.subscribe,
    () => closetStore.getState(),
    () => closetStore.getState()
  );
}

function replaceById<T extends { id: string }>(collection: T[], item: T) {
  const map = new Map(collection.map(entry => [entry.id, entry]));
  map.set(item.id, item);
  return Array.from(map.values());
}

function sortDrafts(drafts: WardrobeDraft[]) {
  return [...drafts].sort((a, b) => Date.parse(b.updatedAtUtc) - Date.parse(a.updatedAtUtc));
}

function sortItems(items: WardrobeItem[]) {
  return [...items].sort((a, b) => Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc));
}


