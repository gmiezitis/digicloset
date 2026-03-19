import { createWardrobeDraftFromWizard } from '../draft';
import type { ItemSeason } from '../item';

describe('createWardrobeDraftFromWizard', () => {
  const now = '2025-01-15T12:00:00.000Z';
  const seasons: ItemSeason[] = ['spring'];
  const payload = {
    name: '  Linen Shirt  ',
    category: 'tops' as const,
    seasons,
    photoConfirmed: true,
    cleanupConfirmed: true,
    reviewAcknowledged: true,
    confirmedAtUtc: '2025-01-15T12:00:00.000Z',
  };

  it('creates a validated draft with pending sync status', () => {
    const draft = createWardrobeDraftFromWizard(payload, {
      nowUtc: () => now,
      generateId: () => 'draft_123',
      generateRevisionId: () => 'rev_123',
      version: 1,
    });

    expect(draft).toEqual({
      id: 'draft_123',
      name: 'Linen Shirt',
      category: 'tops',
      seasons: ['spring'],
      source: 'addItemWizard',
      version: 1,
      wizard: {
        photoConfirmed: true,
        cleanupConfirmed: true,
        reviewAcknowledged: true,
        confirmedAtUtc: '2025-01-15T12:00:00.000Z',
      },
      createdAtUtc: now,
      updatedAtUtc: now,
      revision: {
        revisionId: 'rev_123',
        updatedAtUtc: now,
      },
      syncStatus: 'pending',
      lastSyncAttemptUtc: null,
    });
  });
});



