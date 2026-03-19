import {
  initializeStorage,
  createInMemoryDriver,
  upsertWardrobeItem,
  listWardrobeItems,
  markWardrobeItemSyncStatus,
  getWardrobeItem,
  setLastSyncSnapshot,
  getLastSyncSnapshot,
  removeWardrobeItem,
  saveAddItemWizardDraft,
  listWardrobeDrafts,
} from '../storage';
import { createWardrobeItem } from '@/types/item';
import type { ItemSeason } from '@/types/item';

const baseSeasons: ItemSeason[] = ['winter'];

const baseInput = {
  id: 'item-1',
  category: 'tops' as const,
  name: 'Wool Sweater',
  seasons: baseSeasons,
  colors: [{ name: 'Slate', hex: '#708090' }],
  imageUri: 'https://example.com/sweater.jpg',
  syncStatus: 'pending' as const,
};

const now = () => '2025-01-01T00:00:00.000Z';

const later = () => '2025-01-05T00:00:00.000Z';

const createItem = (
  overrides: Partial<typeof baseInput> = {},
  timestampUtc = now(),
  revisionId = 'rev-base'
) =>
  createWardrobeItem({ ...baseInput, ...overrides }, () => timestampUtc, () => revisionId);

describe('storage service', () => {
  beforeEach(async () => {
    const driver = createInMemoryDriver();
    await initializeStorage(driver);
    await upsertWardrobeItem(createItem());
  });

  it('upserts newer revisions and persists them', async () => {
    const itemsBefore = await listWardrobeItems();
    expect(itemsBefore).toHaveLength(1);

    const updated = createItem({ name: 'Wool Sweater (New)' }, later(), 'rev-new');

    const result = await upsertWardrobeItem(updated);

    expect(result.applied).toBe(true);

    const stored = await getWardrobeItem(baseInput.id);
    expect(stored?.name).toBe('Wool Sweater (New)');
    expect(stored?.revision.revisionId).toBe('rev-new');
  });

  it('rejects stale revisions with last-write-wins semantics', async () => {
    const stale = createItem({ name: 'Wool Sweater (Stale)' }, now(), 'rev-stale');

    const result = await upsertWardrobeItem(stale);

    expect(result.applied).toBe(false);
  if (!result.applied) {
    expect(result.reason).toBe('staleRevision');
  }

    const stored = await getWardrobeItem(baseInput.id);
    expect(stored?.name).toBe('Wool Sweater'); // original seed value
  });

  it('updates sync status and revision metadata', async () => {
    const synced = await markWardrobeItemSyncStatus(baseInput.id, 'synced', {
      revisionId: 'rev-server',
      updatedAtUtc: '2025-01-10T00:00:00.000Z',
    });

    expect(synced?.syncStatus).toBe('synced');
    expect(synced?.revision.revisionId).toBe('rev-server');
  });

  it('tracks last sync snapshot locally', async () => {
    const snapshot = {
      status: 'pending' as const,
      revisionId: 'rev-latest',
      timestampUtc: '2025-01-11T10:00:00.000Z',
    };

    await setLastSyncSnapshot(snapshot);
    const stored = await getLastSyncSnapshot();
    expect(stored).toEqual(snapshot);
  });

  it('removes items', async () => {
    await removeWardrobeItem(baseInput.id);
    const after = await listWardrobeItems();
    expect(after).toHaveLength(0);
  });

  it('saves add item wizard drafts with versioned metadata', async () => {
    const draft = await saveAddItemWizardDraft(
      {
        name: 'Wool Sweater Draft',
        category: 'tops',
        seasons: ['winter'],
        photoConfirmed: true,
        cleanupConfirmed: false,
        reviewAcknowledged: true,
        confirmedAtUtc: '2025-01-12T12:00:00.000Z',
      },
      {
        nowUtc: () => '2025-01-12T12:00:00.000Z',
        generateId: () => 'draft-test',
        generateRevisionId: () => 'rev-draft',
        version: 1,
      }
    );

    expect(draft.id).toBe('draft-test');
    expect(draft.syncStatus).toBe('pending');
    expect(draft.version).toBe(1);

    const drafts = await listWardrobeDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      id: 'draft-test',
      name: 'Wool Sweater Draft',
      category: 'tops',
      seasons: ['winter'],
      wizard: {
        photoConfirmed: true,
        cleanupConfirmed: false,
        reviewAcknowledged: true,
        confirmedAtUtc: '2025-01-12T12:00:00.000Z',
      },
      revision: {
        revisionId: 'rev-draft',
        updatedAtUtc: '2025-01-12T12:00:00.000Z',
      },
    });
  });
});


