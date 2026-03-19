import { plannerStore } from '../plannerStore';
import type { PlannerEntry } from '@/types/planner';

jest.mock('../storage', () => ({
  listPlannerEntries: jest.fn(),
  upsertPlannerEntry: jest.fn(),
  removePlannerEntry: jest.fn(),
  defaultNowUtc: jest.fn(() => '2025-04-01T00:00:00.000Z'),
}));

const { listPlannerEntries, upsertPlannerEntry, removePlannerEntry } = jest.requireMock('../storage');

const sampleEntry = (overrides: Partial<PlannerEntry> = {}): PlannerEntry => ({
  id: overrides.id ?? 'planner_1',
  version: 1,
  calendarDate: overrides.calendarDate ?? '2025-04-10',
  lookKind: overrides.lookKind ?? 'outfit',
  wardrobeItemIds: overrides.wardrobeItemIds ?? ['item_a'],
  note: overrides.note,
  title: overrides.title ?? 'Sample',
  coverImageUri: overrides.coverImageUri,
  labels: overrides.labels,
  searchKeywords: overrides.searchKeywords ?? ['sample'],
  orderIndex: overrides.orderIndex ?? 0,
  createdAtUtc: overrides.createdAtUtc ?? '2025-04-10T10:00:00.000Z',
  revision: overrides.revision ?? { revisionId: `rev_${overrides.id ?? 'planner_1'}`, updatedAtUtc: '2025-04-10T10:00:00.000Z' },
  syncStatus: overrides.syncStatus ?? 'pending',
});

describe('plannerStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    plannerStore.resetForTests();
    (listPlannerEntries as jest.Mock).mockResolvedValue([]);
    (upsertPlannerEntry as jest.Mock).mockImplementation(async (entry: PlannerEntry) => ({
      applied: true,
      entry,
    }));
  });

  it('hydrates entries on initialize', async () => {
    (listPlannerEntries as jest.Mock).mockResolvedValue([
      sampleEntry({ id: 'b', calendarDate: '2025-04-12', orderIndex: 1 }),
      sampleEntry({ id: 'a', calendarDate: '2025-04-11', orderIndex: 0 }),
    ]);

    await plannerStore.initialize();
    const state = plannerStore.getState();

    expect(state.loading).toBe(false);
    expect(state.entries.map(entry => entry.id)).toEqual(['a', 'b']);
  });

  it('saves entries optimistically', async () => {
    const entry = sampleEntry({ id: 'optimistic' });

    await plannerStore.save(entry);
    const state = plannerStore.getState();

    expect(upsertPlannerEntry).toHaveBeenCalledWith(entry);
    expect(state.entries.some(e => e.id === 'optimistic')).toBe(true);
    expect(state.optimistic['optimistic']).toBeUndefined();
  });

  it('removes entries and restores on failure', async () => {
    const entry = sampleEntry({ id: 'delete-me' });
    await plannerStore.save(entry);

    (removePlannerEntry as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(plannerStore.remove('delete-me')).rejects.toThrow('boom');
    const state = plannerStore.getState();

    expect(state.entries.some(e => e.id === 'delete-me')).toBe(true);
    expect(state.error).toContain('Unable to delete');
  });

  it('reorders day entries and persists', async () => {
    const first = sampleEntry({ id: 'first', calendarDate: '2025-04-09', orderIndex: 0 });
    const second = sampleEntry({ id: 'second', calendarDate: '2025-04-09', orderIndex: 1 });
    await plannerStore.save(first);
    await plannerStore.save(second);

    await plannerStore.reorder('2025-04-09', ['second', 'first']);

    const state = plannerStore.getState();
    const dayIds = state.entries.filter(entry => entry.calendarDate === '2025-04-09').map(entry => entry.id);
    expect(dayIds[0]).toBe('second');
  });
});


