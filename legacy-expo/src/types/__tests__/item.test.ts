import { ZodError } from 'zod';
import {
  createWardrobeItem,
  markSyncStatus,
  updateWardrobeItem,
  validateWardrobeItem,
  WardrobeItem,
  type ItemSeason,
} from '../item';

const baseSeasons: ItemSeason[] = ['summer'];

const baseInput = {
  id: 'item-123',
  category: 'tops' as const,
  name: 'Linen Shirt',
  seasons: baseSeasons,
  colors: [{ name: 'Sand', hex: '#C2B280' }],
  imageUri: 'https://example.com/linen-shirt.jpg',
  syncStatus: 'pending' as const,
};

const now = '2025-01-01T00:00:00.000Z';
const later = '2025-02-01T00:00:00.000Z';

const createNowMock = () => jest.fn(() => now);
const createRevisionMock = () => jest.fn(() => 'rev-001');

describe('Wardrobe item domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a wardrobe item with generated revision metadata', () => {
    const nowMock = createNowMock();
    const revisionMock = createRevisionMock();

    const item = createWardrobeItem(baseInput, nowMock, revisionMock);

    expect(item.createdAtUtc).toBe(now);
    expect(item.revision).toEqual({
      revisionId: 'rev-001',
      updatedAtUtc: now,
    });
    expect(item.syncStatus).toBe('pending');
    expect(nowMock).toHaveBeenCalledTimes(1);
    expect(revisionMock).toHaveBeenCalledTimes(1);
  });

  it('respects provided revision and creation timestamps', () => {
    const customRevision = {
      revisionId: 'rev-custom',
      updatedAtUtc: later,
    };

    const item = createWardrobeItem(
      {
        ...baseInput,
        createdAtUtc: now,
        revision: customRevision,
        syncStatus: 'synced',
      },
      createNowMock(),
      createRevisionMock()
    );

    expect(item.revision).toEqual(customRevision);
    expect(item.createdAtUtc).toBe(now);
    expect(item.syncStatus).toBe('synced');
  });

  it('updates a wardrobe item with new revision metadata', () => {
    const original = createWardrobeItem(baseInput, createNowMock(), createRevisionMock());
    const updateNow = jest.fn(() => later);
    const revisionMock = jest.fn(() => 'rev-002');

    const updated = updateWardrobeItem(
      original,
      { name: 'Linen Shirt (Tailored)', syncStatus: 'pending' },
      updateNow,
      revisionMock
    );

    expect(updated.name).toBe('Linen Shirt (Tailored)');
    expect(updated.revision).toEqual({
      revisionId: 'rev-002',
      updatedAtUtc: later,
    });
    expect(updated.createdAtUtc).toBe(original.createdAtUtc);
    expect(updateNow).toHaveBeenCalledTimes(1);
    expect(revisionMock).toHaveBeenCalledTimes(1);
  });

  it('rejects seasons that combine "all" with specific values', () => {
    const invalidItem: WardrobeItem = {
      ...createWardrobeItem(baseInput, createNowMock(), createRevisionMock()),
      seasons: ['all', 'summer'],
    };

    expect(() => validateWardrobeItem(invalidItem)).toThrow(ZodError);
  });

  it('requires currency when price is provided', () => {
    const invalidItem: WardrobeItem = {
      ...createWardrobeItem(baseInput, createNowMock(), createRevisionMock()),
      priceCents: 12900,
      currency: undefined,
    };

    expect(() => validateWardrobeItem(invalidItem)).toThrow(ZodError);
  });

  it('ensures last worn date is not before createdAtUtc', () => {
    const invalidItem: WardrobeItem = {
      ...createWardrobeItem(baseInput, createNowMock(), createRevisionMock()),
      lastWornAtUtc: '2024-12-01T00:00:00.000Z',
    };

    expect(() => validateWardrobeItem(invalidItem)).toThrow(ZodError);
  });

  it('marks sync status transitions without mutating revision unless synced', () => {
    const original = createWardrobeItem(baseInput, createNowMock(), createRevisionMock());
    const failed = markSyncStatus(original, 'failed');

    expect(failed.syncStatus).toBe('failed');
    expect(failed.revision).toBe(original.revision);

    const synced = markSyncStatus(failed, 'synced', {
      revisionId: 'rev-server',
      updatedAtUtc: later,
    });

    expect(synced.syncStatus).toBe('synced');
    expect(synced.revision).toEqual({
      revisionId: 'rev-server',
      updatedAtUtc: later,
    });
  });
});


