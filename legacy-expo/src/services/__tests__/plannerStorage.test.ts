import {
  createInMemoryDriver,
  initializeStorage,
  listPlannerEntries,
  removePlannerEntry,
  upsertPlannerEntry,
} from '../storage';
import { createPlannerEntry } from '@/types/planner';

const now = () => '2025-04-01T10:00:00.000Z';
let revisionCounter = 0;
const nextRevisionId = () => `rev_${revisionCounter++}`;

const baseEntryInput = {
  id: 'planner_entry_1',
  calendarDate: '2025-04-11',
  lookKind: 'outfit' as const,
  wardrobeItemIds: ['item_a', 'item_b'],
  note: 'Work look',
  orderIndex: 0,
  syncStatus: 'pending' as const,
};

function buildEntry(overrides: Partial<typeof baseEntryInput> = {}, createdAtUtc = now(), revisionId?: string) {
  return createPlannerEntry(
    {
      ...baseEntryInput,
      ...overrides,
      createdAtUtc,
      revision: revisionId
        ? { revisionId, updatedAtUtc: createdAtUtc }
        : undefined,
    },
    now,
    nextRevisionId
  );
}

describe('planner storage', () => {
  beforeEach(async () => {
    revisionCounter = 0;
    const driver = createInMemoryDriver();
    await initializeStorage(driver);
  });

  it('upserts planner entries and persists them', async () => {
    const entry = buildEntry();
    const result = await upsertPlannerEntry(entry);
    expect(result.applied).toBe(true);

    const stored = await listPlannerEntries();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: entry.id,
      calendarDate: entry.calendarDate,
      orderIndex: 0,
    });
  });

  it('rejects stale planner revisions', async () => {
    const newer = buildEntry({}, '2025-04-11T12:00:00.000Z', 'rev-new');
    await upsertPlannerEntry(newer);

    const stale = buildEntry({ note: 'Old' }, '2025-04-11T08:00:00.000Z', 'rev-old');
    const result = await upsertPlannerEntry(stale);

    expect(result.applied).toBe(false);
    if (!result.applied) {
      expect(result.reason).toBe('staleRevision');
    }

    const stored = await listPlannerEntries();
    expect(stored[0].note).toBe('Work look');
  });

  it('removes planner entries', async () => {
    const entry = buildEntry({ id: 'planner_entry_remove' });
    await upsertPlannerEntry(entry);

    await removePlannerEntry(entry.id);
    const stored = await listPlannerEntries();
    expect(stored).toHaveLength(0);
  });
});





