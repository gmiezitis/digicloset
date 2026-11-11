import {
  bootstrapDraftSyncQueue,
  enqueueDraftSync,
  getDraftSyncQueueSnapshot,
  processDraftImmediately,
  shutdownDraftSyncQueue,
  startDraftSyncQueue,
} from '../draftSyncQueue';
import {
  createInMemoryDriver,
  getWardrobeDraft,
  listWardrobeDrafts,
  listWardrobeItems,
  setLastSyncSnapshot,
  upsertWardrobeDraft,
  initializeStorage,
} from '../storage';
import { closetStore } from '../closetStore';
import { createWardrobeDraftFromWizard } from '@/types/draft';
import type { ItemSeason } from '@/types/item';

function createTestDraft(options?: Partial<Parameters<typeof createWardrobeDraftFromWizard>[0]>) {
  const nowUtc = () => '2025-01-01T00:00:00.000Z';
  const seasons: ItemSeason[] = ['spring'];
  const basePayload = {
    name: 'Linen Blazer',
    category: 'tops' as const,
    seasons,
    photoConfirmed: true,
    cleanupConfirmed: true,
    reviewAcknowledged: true,
    confirmedAtUtc: nowUtc(),
  };

  return createWardrobeDraftFromWizard(
    { ...basePayload, ...options },
    {
      nowUtc,
      generateId: () => 'draft_test',
      generateRevisionId: () => 'rev_test',
      version: 1,
    }
  );
}

describe('draftSyncQueue', () => {
  beforeEach(async () => {
    shutdownDraftSyncQueue();
    await initializeStorage(createInMemoryDriver());
    await setLastSyncSnapshot(null);
    await closetStore.refresh();
    startDraftSyncQueue();
    await bootstrapDraftSyncQueue();
  });

  afterEach(() => {
    shutdownDraftSyncQueue();
  });

  it('keeps drafts pending when cleanup is incomplete', async () => {
    const draft = createTestDraft({ cleanupConfirmed: false });
    await upsertWardrobeDraft(draft);
    closetStore.applyDraftUpsert(draft);

    enqueueDraftSync(draft, { reason: 'test', immediate: true });
    await processDraftImmediately(draft.id);

    const stored = await getWardrobeDraft(draft.id);
    expect(stored).not.toBeNull();
    expect(stored?.syncStatus).toBe('pending');
    expect(stored?.lastSyncAttemptUtc).toBeTruthy();
    expect(stored?.lastSyncError).toBe('Waiting for background cleanup confirmation.');

    const snapshot = getDraftSyncQueueSnapshot();
    expect(snapshot.find(entry => entry.draftId === draft.id)).toBeDefined();
  });

  it('promotes ready drafts into wardrobe items', async () => {
    const draft = createTestDraft();
    await upsertWardrobeDraft(draft);
    closetStore.applyDraftUpsert(draft);

    enqueueDraftSync(draft, { reason: 'test-ready', immediate: true });
    await processDraftImmediately(draft.id);

    const drafts = await listWardrobeDrafts();
    expect(drafts).toHaveLength(0);

    const items = await listWardrobeItems();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe(draft.name);
    expect(items[0].syncStatus).toBe('synced');

    const storeState = closetStore.getState();
    expect(storeState.items.length).toBe(1);
    expect(storeState.drafts.length).toBe(0);
  });

  it('marks draft as failed and schedules retry when migration errors', async () => {
    const draft = createTestDraft();
    await upsertWardrobeDraft(draft);
    closetStore.applyDraftUpsert(draft);

    const spy = jest.spyOn(require('../storage'), 'upsertWardrobeItem');
    spy.mockRejectedValueOnce(new Error('fs-error'));

    enqueueDraftSync(draft, { reason: 'test-failure', immediate: true });
    await processDraftImmediately(draft.id);

    const stored = await getWardrobeDraft(draft.id);
    expect(stored?.syncStatus).toBe('failed');
    expect(stored?.lastSyncError).toBe('fs-error');

    const queue = getDraftSyncQueueSnapshot();
    const entry = queue.find(item => item.draftId === draft.id);
    expect(entry).toBeDefined();
    expect(entry?.attempt).toBe(1);

    spy.mockRestore();
  });
});


