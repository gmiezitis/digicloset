import {
  PLANNER_ENTRY_VERSION,
  buildWornHistory,
  createPlannerEntry,
  derivePlannerEntryTitle,
  updatePlannerEntry,
} from '../planner';

const fixedNow = () => '2025-04-01T08:00:00.000Z';
let revisionCounter = 0;
const nextRevisionId = () => `rev_${revisionCounter++}`;

describe('planner types', () => {
  beforeEach(() => {
    revisionCounter = 0;
  });

  it('derives title from the first populated note line', () => {
    const title = derivePlannerEntryTitle('\n\nWork look\nSecond line', undefined, 'outfit');
    expect(title).toBe('Work look');
  });

  it('creates entries with defaults, titles, and keywords', () => {
    const entry = createPlannerEntry(
      {
        id: 'planner_1',
        calendarDate: '2025-04-11',
        lookKind: 'outfit',
        wardrobeItemIds: ['item_1', 'item_2'],
        note: 'Garden party fit\nAdd sparkly earrings',
        orderIndex: 0,
        syncStatus: 'pending',
        labels: { context: 'event', weather: 'warm' },
      },
      fixedNow,
      nextRevisionId
    );

    expect(entry.version).toBe(PLANNER_ENTRY_VERSION);
    expect(entry.title).toBe('Garden party fit');
    expect(entry.searchKeywords).toEqual(expect.arrayContaining(['garden', 'party', 'event', 'warm']));
  });

  it('updates entries and refreshes title + keywords', () => {
    const entry = createPlannerEntry(
      {
        id: 'planner_2',
        calendarDate: '2025-04-12',
        lookKind: 'single',
        wardrobeItemIds: ['item_1'],
        note: 'Travel coat',
        orderIndex: 0,
        syncStatus: 'pending',
      },
      fixedNow,
      nextRevisionId
    );

    const updated = updatePlannerEntry(
      entry,
      {
        note: 'Airport coat\nLayered with scarf',
        labels: { context: 'travel' },
      },
      () => '2025-04-13T09:00:00.000Z',
      nextRevisionId
    );

    expect(updated.title).toBe('Airport coat');
    expect(updated.revision.revisionId).not.toBe(entry.revision.revisionId);
    expect(updated.searchKeywords).toEqual(expect.arrayContaining(['airport', 'travel']));
  });

  it('builds worn history counts', () => {
    const entryA = createPlannerEntry(
      {
        id: 'planner_A',
        calendarDate: '2025-04-10',
        lookKind: 'outfit',
        wardrobeItemIds: ['item_a', 'item_b'],
        note: 'Morning walk',
        orderIndex: 0,
        syncStatus: 'pending',
        createdAtUtc: '2025-04-10T07:00:00.000Z',
      },
      fixedNow,
      nextRevisionId
    );
    const entryB = createPlannerEntry(
      {
        id: 'planner_B',
        calendarDate: '2025-04-11',
        lookKind: 'single',
        wardrobeItemIds: ['item_a'],
        note: 'Evening wrap',
        orderIndex: 1,
        syncStatus: 'pending',
        createdAtUtc: '2025-04-11T21:00:00.000Z',
      },
      fixedNow,
      nextRevisionId
    );

    const history = buildWornHistory([entryA, entryB]);

    expect(history).toHaveLength(2);
    const itemA = history.find(entry => entry.wardrobeItemId === 'item_a');
    expect(itemA).toMatchObject({
      occurrences: 2,
      firstWornAtUtc: '2025-04-10T07:00:00.000Z',
      lastWornAtUtc: '2025-04-11T21:00:00.000Z',
    });
  });
});





